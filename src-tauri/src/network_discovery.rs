use serde::Serialize;
use serde_json::{json, Value};
use sha2::Digest;
use std::collections::HashMap;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::net::UdpSocket;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

const DISCOVERY_MESSAGE: &str = "EDULINKER_DISCOVERY";
const DISCOVERY_VERSION: &str = "1.0";

#[derive(Clone, Serialize)]
pub struct DiscoveredDevice {
  pub deviceId: String,
  pub hostname: String,
  pub ipAddress: String,
  pub macAddress: String,
  pub os: String,
  pub platform: String,
  pub userId: Option<String>,
  pub lastSeen: String,
  pub discoveryVersion: String,
}

struct NetworkDiscoveryState {
  running: bool,
  requested_port: u16,
  port: u16,
  device_id: String,
  devices: HashMap<String, DiscoveredDevice>,
  token: Option<CancellationToken>,
  task: Option<tokio::task::JoinHandle<()>>,
}

#[derive(Clone)]
pub struct NetworkDiscoveryManager {
  app: AppHandle,
  state: std::sync::Arc<Mutex<NetworkDiscoveryState>>,
}

impl NetworkDiscoveryManager {
  pub fn new(app: AppHandle) -> Self {
    let requested_port = requested_discovery_port();
    let state = NetworkDiscoveryState {
      running: false,
      requested_port,
      port: requested_port,
      device_id: generate_device_id(),
      devices: HashMap::new(),
      token: None,
      task: None,
    };

    Self {
      app,
      state: std::sync::Arc::new(Mutex::new(state)),
    }
  }

  pub async fn start(&self, port: u16, requested_port: u16) -> Result<Value, String> {
    let mut state = self.state.lock().await;
    if state.running {
      return Ok(json!({"success": true, "port": state.port}));
    }

    state.running = true;
    state.port = port;
    state.requested_port = requested_port;

    let token = CancellationToken::new();
    state.token = Some(token.clone());

    let manager = self.clone();
    let task = tokio::spawn(async move {
      manager.broadcast_loop(port, token).await;
    });

    state.task = Some(task);

    if port != requested_port {
      let payload = json!({
        "port": port,
        "requestedPort": requested_port,
        "isFallback": true
      });
      let _ = self.app.emit("network-discovery:port-changed", payload);
    }

    Ok(json!({"success": true, "message": "Network discovery started", "port": port}))
  }

  pub async fn stop(&self) -> Result<Value, String> {
    let mut state = self.state.lock().await;
    if !state.running {
      return Ok(json!({"success": true}));
    }

    state.running = false;
    if let Some(token) = state.token.take() {
      token.cancel();
    }

    state.task = None;

    Ok(json!({"success": true, "message": "Network discovery stopped"}))
  }

  pub async fn is_running(&self) -> bool {
    let state = self.state.lock().await;
    state.running
  }

  pub async fn get_devices(&self) -> Value {
    let state = self.state.lock().await;
    json!({
      "success": true,
      "devices": state.devices.values().cloned().collect::<Vec<_>>()
    })
  }

  pub async fn handle_discovery_message(&self, message: &Value) {
    let msg_type = message.get("type").and_then(|v| v.as_str());
    if msg_type != Some(DISCOVERY_MESSAGE) {
      return;
    }

    let version = message.get("version").and_then(|v| v.as_str()).unwrap_or("");
    if version != DISCOVERY_VERSION {
      return;
    }

    let device_id = match message.get("deviceId").and_then(|v| v.as_str()) {
      Some(id) => id,
      None => return,
    };

    let mut state = self.state.lock().await;
    if device_id == state.device_id {
      return;
    }

    let device = DiscoveredDevice {
      deviceId: device_id.to_string(),
      hostname: message.get("hostname").and_then(|v| v.as_str()).unwrap_or("").to_string(),
      ipAddress: message.get("ipAddress").and_then(|v| v.as_str()).unwrap_or("").to_string(),
      macAddress: message.get("macAddress").and_then(|v| v.as_str()).unwrap_or("").to_string(),
      os: message.get("os").and_then(|v| v.as_str()).unwrap_or("").to_string(),
      platform: message.get("platform").and_then(|v| v.as_str()).unwrap_or("").to_string(),
      userId: message.get("userId").and_then(|v| v.as_str()).map(|s| s.to_string()),
      lastSeen: chrono::Utc::now().to_rfc3339(),
      discoveryVersion: version.to_string(),
    };

    state.devices.insert(device_id.to_string(), device.clone());
    let _ = self.app.emit("network-device-discovered", device);
  }

  async fn broadcast_loop(&self, port: u16, token: CancellationToken) {
    let mut interval = tokio::time::interval(Duration::from_secs(30));

    loop {
      tokio::select! {
        _ = token.cancelled() => break,
        _ = interval.tick() => {
          let _ = self.broadcast_once(port).await;
        }
      }
    }
  }

  async fn broadcast_once(&self, port: u16) -> bool {
    let (device_id, hostname, ip_address, mac_address) = {
      let state = self.state.lock().await;
      (
        state.device_id.clone(),
        get_hostname(),
        get_local_ip(),
        get_mac_address(),
      )
    };

    if ip_address.is_empty() {
      return false;
    }

    let message = json!({
      "type": DISCOVERY_MESSAGE,
      "version": DISCOVERY_VERSION,
      "discoveryPort": port,
      "deviceId": device_id,
      "hostname": hostname,
      "ipAddress": ip_address,
      "macAddress": mac_address,
      "os": std::env::consts::OS,
      "platform": std::env::consts::OS,
      "timestamp": chrono::Utc::now().timestamp_millis(),
    });

    let data = match serde_json::to_vec(&message) {
      Ok(data) => data,
      Err(_) => return false,
    };

    let socket = match UdpSocket::bind("0.0.0.0:0").await {
      Ok(socket) => socket,
      Err(_) => return false,
    };

    let _ = socket.set_broadcast(true);

    let targets = broadcast_addresses();
    for addr in targets {
      let _ = socket.send_to(&data, (addr.as_str(), port)).await;
    }

    true
  }
}

pub fn requested_discovery_port() -> u16 {
  parse_port(std::env::var("VITE_DISCOVERY_PORT").ok(), 41235)
}

fn parse_port(value: Option<String>, fallback: u16) -> u16 {
  value
    .and_then(|v| v.parse::<u16>().ok())
    .unwrap_or(fallback)
}

fn generate_device_id() -> String {
  let mac = get_mac_address();
  let mut hasher = sha2::Sha256::new();
  hasher.update(mac);
  let result = hasher.finalize();
  let hex = hex::encode(result);
  hex.chars().take(16).collect()
}

fn get_hostname() -> String {
  hostname::get()
    .ok()
    .and_then(|h| h.into_string().ok())
    .unwrap_or_else(|| "unknown".to_string())
}

fn get_local_ip() -> String {
  match local_ip_address::local_ip() {
    Ok(ip) => ip.to_string(),
    Err(_) => "".to_string(),
  }
}

fn get_mac_address() -> String {
  mac_address::get_mac_address()
    .ok()
    .flatten()
    .map(|m| m.to_string())
    .unwrap_or_else(|| "00:00:00:00:00:00".to_string())
}

fn broadcast_addresses() -> Vec<String> {
  let mut addresses = Vec::new();
  if let Ok(ip) = local_ip_address::local_ip() {
    if let std::net::IpAddr::V4(ipv4) = ip {
      let octets = ipv4.octets();
      addresses.push(format!("{}.{}.{}.255", octets[0], octets[1], octets[2]));
    }
  }

  if addresses.is_empty() {
    addresses.push("255.255.255.255".to_string());
  }

  addresses
}

