use serde::Serialize;
use serde_json::{json, Value};
use sha2::Digest;
use rusqlite::{params, Connection};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream, UdpSocket};
use tokio::sync::Mutex;
use tokio::time::timeout;
use tokio_util::sync::CancellationToken;

#[derive(Clone, Serialize)]
pub struct PeerInfo {
  pub peerId: String,
  pub userId: String,
  pub userName: Option<String>,
  pub schoolId: Option<String>,
  pub ipAddress: String,
  pub port: u16,
  pub lastSeen: String,
  pub isOnline: bool,
  pub hostname: Option<String>,
  pub platform: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct FileTransfer {
  pub id: String,
  pub peerId: String,
  pub fileName: String,
  pub fileSize: u64,
  pub progress: u8,
  pub status: String,
  pub direction: String,
  pub totalChunks: u64,
}

struct InternalP2PState {
  running: bool,
  my_peer_id: String,
  my_user_id: String,
  my_user_name: String,
  my_school_id: String,
  my_ip: String,
  discovery_port: u16,
  udp_message_port: u16,
  tcp_message_port: u16,
  peers: HashMap<String, PeerInfo>,
  message_queue: HashMap<String, Vec<Value>>,
  file_transfers: HashMap<String, FileTransfer>,
  cancel_token: Option<CancellationToken>,
  tasks: Vec<tokio::task::JoinHandle<()>>,
}

#[derive(Clone)]
pub struct InternalP2PManager {
  app: AppHandle,
  state: std::sync::Arc<Mutex<InternalP2PState>>,
}

impl InternalP2PManager {
  pub fn new(app: AppHandle) -> Self {
    let state = InternalP2PState {
      running: false,
      my_peer_id: generate_peer_id(),
      my_user_id: String::new(),
      my_user_name: String::new(),
      my_school_id: String::new(),
      my_ip: String::new(),
      discovery_port: requested_discovery_port(),
      udp_message_port: requested_udp_message_port(),
      tcp_message_port: requested_tcp_message_port(),
      peers: HashMap::new(),
      message_queue: HashMap::new(),
      file_transfers: HashMap::new(),
      cancel_token: None,
      tasks: Vec::new(),
    };

    Self {
      app,
      state: std::sync::Arc::new(Mutex::new(state)),
    }
  }

  pub async fn start(
    &self,
    user_id: String,
    user_name: String,
    school_id: Option<String>,
    discovery_port: u16,
  ) -> Result<Value, String> {
    let mut state = self.state.lock().await;
    if state.running {
      return Ok(json!({
        "success": true,
        "info": self.info_from_state(&state)
      }));
    }

    state.running = true;
    state.my_user_id = user_id.clone();
    state.my_user_name = user_name.clone();
    state.my_school_id = school_id.unwrap_or_else(|| "default-school".to_string());
    state.my_ip = get_local_ip();
    state.discovery_port = discovery_port;

    let token = CancellationToken::new();
    state.cancel_token = Some(token.clone());

    let udp_port = state.udp_message_port;
    let tcp_port = state.tcp_message_port;

    let token1 = token.clone();
    let manager = self.clone();
    let udp_task = tokio::spawn(async move {
      manager.udp_message_loop(udp_port, token1).await;
    });

    let token2 = token.clone();
    let manager = self.clone();
    let tcp_task = tokio::spawn(async move {
      manager.tcp_message_loop(tcp_port, token2).await;
    });

    let token3 = token.clone();
    let manager = self.clone();
    let discovery_port = state.discovery_port;
    let discovery_task = tokio::spawn(async move {
      manager.discovery_broadcast_loop(discovery_port, token3).await;
    });

    let token4 = token.clone();
    let manager = self.clone();
    let cleanup_task = tokio::spawn(async move {
      manager.cleanup_loop(token4).await;
    });

    let token5 = token.clone();
    let manager = self.clone();
    let heartbeat_task = tokio::spawn(async move {
      manager.heartbeat_loop(token5).await;
    });

    state.tasks = vec![udp_task, tcp_task, discovery_task, cleanup_task, heartbeat_task];

    let info = self.info_from_state(&state);
    let _ = self.app.emit("p2p:started", info.clone());

    Ok(json!({"success": true, "info": info}))
  }

  pub async fn stop(&self) -> Result<Value, String> {
    let mut state = self.state.lock().await;
    if !state.running {
      return Ok(json!({"success": true}));
    }

    state.running = false;

    if let Some(token) = state.cancel_token.take() {
      token.cancel();
    }

    state.tasks.clear();
    state.peers.clear();
    state.message_queue.clear();

    let _ = self.app.emit("p2p:stopped", json!({}));

    Ok(json!({"success": true}))
  }

  pub async fn status(&self) -> Value {
    let state = self.state.lock().await;
    json!({
      "running": state.running,
      "info": self.info_from_state(&state),
      "peers": state.peers.values().cloned().collect::<Vec<_>>(),
      "onlinePeers": state
        .peers
        .values()
        .filter(|peer| peer.isOnline)
        .cloned()
        .collect::<Vec<_>>()
    })
  }

  pub async fn get_peers(&self) -> Value {
    let state = self.state.lock().await;
    json!({
      "success": true,
      "peers": state.peers.values().cloned().collect::<Vec<_>>(),
      "onlinePeers": state
        .peers
        .values()
        .filter(|peer| peer.isOnline)
        .cloned()
        .collect::<Vec<_>>()
    })
  }

  pub async fn send_message(&self, data: Value) -> Result<Value, String> {
    let receiver_id = data.get("receiverId").and_then(|v| v.as_str()).ok_or("missing receiverId")?;
    let content = data.get("content").and_then(|v| v.as_str()).unwrap_or("");
    let message_id = data
      .get("messageId")
      .and_then(|v| v.as_str())
      .unwrap_or_else(|| "");

    let (sender_id, sender_name) = {
      let state = self.state.lock().await;
      (state.my_user_id.clone(), state.my_user_name.clone())
    };

    let id = if message_id.is_empty() {
      uuid::Uuid::new_v4().to_string()
    } else {
      message_id.to_string()
    };

    let message = json!({
      "id": id,
      "type": "chat",
      "senderId": sender_id,
      "senderName": sender_name,
      "receiverId": receiver_id,
      "content": content,
      "timestamp": now_iso()
    });

    let result = self.send_to_peer(receiver_id, &message).await;
    let delivered = result.get("error").is_none();
    self.persist_message(message.clone(), delivered, false).await;
    Ok(result)
  }

  pub async fn send_read_receipt(&self, data: Value) -> Result<Value, String> {
    let message_id = data.get("messageId").and_then(|v| v.as_str()).ok_or("missing messageId")?;
    let sender_id = data.get("senderId").and_then(|v| v.as_str()).ok_or("missing senderId")?;

    let receipt = json!({
      "id": uuid::Uuid::new_v4().to_string(),
      "type": "read_receipt",
      "senderId": self.my_user_id().await,
      "receiverId": sender_id,
      "timestamp": now_iso(),
      "messageId": message_id,
      "readAt": now_iso()
    });

    let _ = self.send_to_peer(sender_id, &receipt).await;
    Ok(json!({"success": true}))
  }

  pub async fn send_typing(&self, data: Value) -> Result<Value, String> {
    let receiver_id = data.get("receiverId").and_then(|v| v.as_str()).ok_or("missing receiverId")?;
    let is_typing = data.get("isTyping").and_then(|v| v.as_bool()).unwrap_or(false);

    let message = json!({
      "id": uuid::Uuid::new_v4().to_string(),
      "type": "typing",
      "senderId": self.my_user_id().await,
      "receiverId": receiver_id,
      "content": if is_typing { "typing" } else { "stopped" },
      "timestamp": now_iso()
    });

    let _ = self.send_to_peer(receiver_id, &message).await;
    Ok(json!({"success": true}))
  }

  pub async fn offer_file(&self, data: Value) -> Result<Value, String> {
    let receiver_id = data.get("receiverId").and_then(|v| v.as_str()).ok_or("missing receiverId")?;
    let file_name = data.get("fileName").and_then(|v| v.as_str()).unwrap_or("unknown");
    let file_size = data.get("fileSize").and_then(|v| v.as_u64()).unwrap_or(0);

    let transfer = FileTransfer {
      id: uuid::Uuid::new_v4().to_string(),
      peerId: receiver_id.to_string(),
      fileName: file_name.to_string(),
      fileSize: file_size,
      progress: 0,
      status: "pending".to_string(),
      direction: "send".to_string(),
      totalChunks: (file_size / (64 * 1024)).max(1),
    };

    {
      let mut state = self.state.lock().await;
      state.file_transfers.insert(transfer.id.clone(), transfer.clone());
    }

    let offer = json!({
      "id": transfer.id,
      "type": "file_offer",
      "senderId": self.my_user_id().await,
      "senderName": self.my_user_name().await,
      "receiverId": receiver_id,
      "timestamp": now_iso(),
      "fileName": file_name,
      "fileSize": file_size,
      "totalChunks": transfer.totalChunks
    });

    let _ = self.send_to_peer(receiver_id, &offer).await;
    Ok(json!({"success": true, "transfer": transfer}))
  }

  pub async fn accept_file(&self, transfer_id: String) -> Result<Value, String> {
    let (peer_id, accept) = {
      let mut state = self.state.lock().await;
      if let Some(transfer) = state.file_transfers.get_mut(&transfer_id) {
        transfer.status = "accepted".to_string();
        let peer_id = transfer.peerId.clone();
        let accept = json!({
          "id": uuid::Uuid::new_v4().to_string(),
          "type": "file_accept",
          "senderId": state.my_user_id,
          "receiverId": peer_id,
          "timestamp": now_iso(),
          "messageId": transfer_id
        });
        (Some(peer_id), Some(accept))
      } else {
        (None, None)
      }
    };

    if let (Some(peer_id), Some(accept)) = (peer_id, accept) {
      let _ = self.send_to_peer(&peer_id, &accept).await;
    }

    Ok(json!({"success": true}))
  }

  pub async fn reject_file(&self, transfer_id: String) -> Result<Value, String> {
    let (peer_id, reject) = {
      let mut state = self.state.lock().await;
      if let Some(transfer) = state.file_transfers.remove(&transfer_id) {
        let peer_id = transfer.peerId.clone();
        let reject = json!({
          "id": uuid::Uuid::new_v4().to_string(),
          "type": "file_reject",
          "senderId": state.my_user_id,
          "receiverId": peer_id,
          "timestamp": now_iso(),
          "messageId": transfer_id
        });
        (Some(peer_id), Some(reject))
      } else {
        (None, None)
      }
    };

    if let (Some(peer_id), Some(reject)) = (peer_id, reject) {
      let _ = self.send_to_peer(&peer_id, &reject).await;
    }

    Ok(json!({"success": true}))
  }

  pub async fn get_file_transfers(&self) -> Value {
    let state = self.state.lock().await;
    json!({
      "success": true,
      "transfers": state.file_transfers.values().cloned().collect::<Vec<_>>()
    })
  }

  pub async fn send_group_message(&self, data: Value) -> Result<Value, String> {
    let group_id = data.get("groupId").and_then(|v| v.as_str()).ok_or("missing groupId")?;
    let group_name = data.get("groupName").and_then(|v| v.as_str()).unwrap_or("");
    let member_ids = data.get("memberIds").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let content = data.get("content").and_then(|v| v.as_str()).unwrap_or("");
    let message_id = data.get("messageId").and_then(|v| v.as_str()).unwrap_or("");

    let id = if message_id.is_empty() {
      uuid::Uuid::new_v4().to_string()
    } else {
      message_id.to_string()
    };

    let sender_id = self.my_user_id().await;
    let sender_name = self.my_user_name().await;

    let mut failed = Vec::new();

    for member in &member_ids {
      let member_id = match member.as_str() {
        Some(id) => id,
        None => continue,
      };
      if member_id == sender_id {
        continue;
      }

      let message = json!({
        "id": id,
        "type": "group_chat",
        "senderId": sender_id,
        "senderName": sender_name,
        "receiverId": member_id,
        "content": content,
        "timestamp": now_iso(),
        "groupId": group_id,
        "groupName": group_name,
        "memberIds": member_ids.clone()
      });

      let result = self.send_to_peer(member_id, &message).await;
      if !result.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
        failed.push(member_id.to_string());
      }
    }

    Ok(json!({"success": true, "messageId": id, "failedRecipients": failed}))
  }

  pub async fn broadcast_group_create(&self, data: Value) -> Result<Value, String> {
    let group_id = data.get("groupId").and_then(|v| v.as_str()).ok_or("missing groupId")?;
    let group_name = data.get("groupName").and_then(|v| v.as_str()).unwrap_or("");
    let member_ids = data.get("memberIds").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let description = data.get("description").and_then(|v| v.as_str()).unwrap_or("");

    let sender_id = self.my_user_id().await;
    let sender_name = self.my_user_name().await;

    for member in &member_ids {
      let member_id = match member.as_str() {
        Some(id) => id,
        None => continue,
      };
      if member_id == sender_id {
        continue;
      }

      let message = json!({
        "id": uuid::Uuid::new_v4().to_string(),
        "type": "group_create",
        "senderId": sender_id,
        "senderName": sender_name,
        "receiverId": member_id,
        "content": description,
        "timestamp": now_iso(),
        "groupId": group_id,
        "groupName": group_name,
        "memberIds": member_ids.clone()
      });

      let _ = self.send_to_peer(member_id, &message).await;
    }

    Ok(json!({"success": true}))
  }

  pub async fn broadcast_group_member_change(&self, data: Value) -> Result<Value, String> {
    let group_id = data.get("groupId").and_then(|v| v.as_str()).ok_or("missing groupId")?;
    let group_name = data.get("groupName").and_then(|v| v.as_str()).unwrap_or("");
    let member_ids = data.get("memberIds").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let action = data.get("action").and_then(|v| v.as_str()).unwrap_or("join");
    let target_user_id = data.get("targetUserId").and_then(|v| v.as_str()).unwrap_or("");
    let target_user_name = data.get("targetUserName").and_then(|v| v.as_str()).unwrap_or("");

    let sender_id = self.my_user_id().await;
    let sender_name = self.my_user_name().await;

    for member in &member_ids {
      let member_id = match member.as_str() {
        Some(id) => id,
        None => continue,
      };
      if member_id == sender_id {
        continue;
      }

      let message = json!({
        "id": uuid::Uuid::new_v4().to_string(),
        "type": if action == "leave" { "group_leave" } else { "group_join" },
        "senderId": sender_id,
        "senderName": sender_name,
        "receiverId": member_id,
        "content": format!("{}", target_user_name),
        "timestamp": now_iso(),
        "groupId": group_id,
        "groupName": group_name,
        "memberIds": member_ids.clone(),
        "messageId": target_user_id
      });

      let _ = self.send_to_peer(member_id, &message).await;
    }

    Ok(json!({"success": true}))
  }

  pub async fn send_group_read_receipt(&self, data: Value) -> Result<Value, String> {
    let group_id = data.get("groupId").and_then(|v| v.as_str()).ok_or("missing groupId")?;
    let message_id = data.get("messageId").and_then(|v| v.as_str()).ok_or("missing messageId")?;
    let member_ids = data.get("memberIds").and_then(|v| v.as_array()).cloned().unwrap_or_default();

    let sender_id = self.my_user_id().await;

    for member in &member_ids {
      let member_id = match member.as_str() {
        Some(id) => id,
        None => continue,
      };
      if member_id == sender_id {
        continue;
      }

      let receipt = json!({
        "id": uuid::Uuid::new_v4().to_string(),
        "type": "group_read_receipt",
        "senderId": sender_id,
        "receiverId": member_id,
        "timestamp": now_iso(),
        "messageId": message_id,
        "groupId": group_id,
        "readAt": now_iso()
      });

      let _ = self.send_to_peer(member_id, &receipt).await;
    }

    Ok(json!({"success": true}))
  }

  pub async fn send_group_typing(&self, data: Value) -> Result<Value, String> {
    let group_id = data.get("groupId").and_then(|v| v.as_str()).ok_or("missing groupId")?;
    let member_ids = data.get("memberIds").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let is_typing = data.get("isTyping").and_then(|v| v.as_bool()).unwrap_or(false);

    let sender_id = self.my_user_id().await;
    let sender_name = self.my_user_name().await;

    for member in &member_ids {
      let member_id = match member.as_str() {
        Some(id) => id,
        None => continue,
      };
      if member_id == sender_id {
        continue;
      }

      let message = json!({
        "id": uuid::Uuid::new_v4().to_string(),
        "type": "group_typing",
        "senderId": sender_id,
        "senderName": sender_name,
        "receiverId": member_id,
        "content": if is_typing { "typing" } else { "stopped" },
        "timestamp": now_iso(),
        "groupId": group_id
      });

      let _ = self.send_to_peer(member_id, &message).await;
    }

    Ok(json!({"success": true}))
  }

  pub async fn handle_discovery_message(&self, message: &Value, sender_ip: &str) {
    let msg_type = message.get("type").and_then(|v| v.as_str());
    if msg_type != Some("discovery") && msg_type != Some("discovery-response") {
      return;
    }

    let peer_id = match message.get("peerId").and_then(|v| v.as_str()) {
      Some(id) => id,
      None => return,
    };

    let user_id = match message.get("userId").and_then(|v| v.as_str()) {
      Some(id) => id,
      None => return,
    };

    let school_id = message.get("schoolId").and_then(|v| v.as_str()).unwrap_or("default-school");

    let mut state = self.state.lock().await;
    if peer_id == state.my_peer_id {
      return;
    }

    if !state.my_school_id.is_empty() && school_id != state.my_school_id {
      return;
    }

    let now = now_iso();
    let is_new = !state.peers.contains_key(peer_id);
    let was_offline = state
      .peers
      .get(peer_id)
      .map(|peer| !peer.isOnline)
      .unwrap_or(false);

    let peer = PeerInfo {
      peerId: peer_id.to_string(),
      userId: user_id.to_string(),
      userName: message.get("userName").and_then(|v| v.as_str()).map(|s| s.to_string()),
      schoolId: Some(school_id.to_string()),
      ipAddress: sender_ip.to_string(),
      port: state.udp_message_port,
      lastSeen: now,
      isOnline: true,
      hostname: message.get("hostname").and_then(|v| v.as_str()).map(|s| s.to_string()),
      platform: message.get("platform").and_then(|v| v.as_str()).map(|s| s.to_string()),
    };

    state.peers.insert(peer_id.to_string(), peer.clone());

    if is_new {
      let _ = self.app.emit("p2p:peer-discovered", peer.clone());
    } else if was_offline {
      let _ = self.app.emit("p2p:peer-online", peer.clone());
    }

    if msg_type == Some("discovery") {
      drop(state);
      let _ = self.send_discovery_response(sender_ip).await;
    }

    let _ = self.deliver_queued_messages(user_id, sender_ip).await;
  }

  pub async fn is_running(&self) -> bool {
    let state = self.state.lock().await;
    state.running
  }

  fn info_from_state(&self, state: &InternalP2PState) -> Value {
    json!({
      "peerId": state.my_peer_id,
      "userId": state.my_user_id,
      "userName": state.my_user_name,
      "ipAddress": state.my_ip
    })
  }

  async fn my_user_id(&self) -> String {
    let state = self.state.lock().await;
    state.my_user_id.clone()
  }

  async fn my_user_name(&self) -> String {
    let state = self.state.lock().await;
    state.my_user_name.clone()
  }

  async fn send_to_peer(&self, receiver_id: &str, message: &Value) -> Value {
    let peer = {
      let state = self.state.lock().await;
      state
        .peers
        .values()
        .find(|peer| peer.userId == receiver_id)
        .cloned()
    };

    if let Some(peer) = peer {
      let tcp_success = self.send_tcp_message(&peer.ipAddress, message).await;
      if tcp_success {
        return json!({"success": true, "messageId": message.get("id").and_then(|v| v.as_str()).unwrap_or("")});
      }

      let udp_success = self.send_udp_message(&peer.ipAddress, message).await;
      if udp_success {
        return json!({"success": true, "messageId": message.get("id").and_then(|v| v.as_str()).unwrap_or("")});
      }
    }

    self.queue_message(receiver_id, message.clone()).await;

    json!({
      "success": true,
      "messageId": message.get("id").and_then(|v| v.as_str()).unwrap_or(""),
      "error": "Message queued (peer offline)"
    })
  }

  async fn send_udp_message(&self, target_ip: &str, message: &Value) -> bool {
    let port = {
      let state = self.state.lock().await;
      state.udp_message_port
    };

    let socket = match UdpSocket::bind("0.0.0.0:0").await {
      Ok(socket) => socket,
      Err(_) => return false,
    };

    let data = match serde_json::to_vec(message) {
      Ok(data) => data,
      Err(_) => return false,
    };

    timeout(Duration::from_secs(3), socket.send_to(&data, (target_ip, port)))
      .await
      .ok()
      .and_then(|res| res.ok())
      .is_some()
  }

  async fn send_tcp_message(&self, target_ip: &str, message: &Value) -> bool {
    let port = {
      let state = self.state.lock().await;
      state.tcp_message_port
    };

    let addr = format!("{}:{}", target_ip, port);
    let stream = match timeout(Duration::from_secs(5), TcpStream::connect(addr)).await {
      Ok(Ok(stream)) => stream,
      _ => return false,
    };

    let payload = match serde_json::to_string(message) {
      Ok(text) => format!("{}\n", text),
      Err(_) => return false,
    };

    let mut stream = stream;
    timeout(Duration::from_secs(5), stream.write_all(payload.as_bytes()))
      .await
      .ok()
      .and_then(|res| res.ok())
      .is_some()
  }

  async fn send_discovery_response(&self, target_ip: &str) -> bool {
    let (peer_id, user_id, user_name, school_id, port) = {
      let state = self.state.lock().await;
      (
        state.my_peer_id.clone(),
        state.my_user_id.clone(),
        state.my_user_name.clone(),
        state.my_school_id.clone(),
        state.discovery_port,
      )
    };

    let message = json!({
      "type": "discovery-response",
      "peerId": peer_id,
      "userId": user_id,
      "userName": user_name,
      "schoolId": school_id,
      "hostname": get_hostname(),
      "platform": std::env::consts::OS,
      "timestamp": now_iso()
    });

    let socket = match UdpSocket::bind("0.0.0.0:0").await {
      Ok(socket) => socket,
      Err(_) => return false,
    };

    let data = match serde_json::to_vec(&message) {
      Ok(data) => data,
      Err(_) => return false,
    };

    socket.send_to(&data, (target_ip, port)).await.is_ok()
  }

  async fn queue_message(&self, receiver_id: &str, message: Value) {
    let mut state = self.state.lock().await;
    let queue = state.message_queue.entry(receiver_id.to_string()).or_default();
    queue.push(message);
  }

  async fn deliver_queued_messages(&self, user_id: &str, target_ip: &str) {
    let queue = {
      let mut state = self.state.lock().await;
      state.message_queue.remove(user_id)
    };

    let Some(messages) = queue else { return; };

    for message in messages {
      let tcp_ok = self.send_tcp_message(target_ip, &message).await;
      if !tcp_ok {
        let _ = self.send_udp_message(target_ip, &message).await;
      }
    }
  }

  async fn udp_message_loop(&self, port: u16, token: CancellationToken) {
    let socket = match UdpSocket::bind(("0.0.0.0", port)).await {
      Ok(socket) => socket,
      Err(_) => return,
    };

    let mut buf = vec![0u8; 8192];
    loop {
      tokio::select! {
        _ = token.cancelled() => break,
        res = socket.recv_from(&mut buf) => {
          let Ok((len, addr)) = res else { continue; };
          let payload = &buf[..len];
          if let Ok(message) = serde_json::from_slice::<Value>(payload) {
            self.handle_incoming_message(message, addr).await;
          }
        }
      }
    }
  }

  async fn tcp_message_loop(&self, port: u16, token: CancellationToken) {
    let listener = match TcpListener::bind(("0.0.0.0", port)).await {
      Ok(listener) => listener,
      Err(_) => return,
    };

    loop {
      tokio::select! {
        _ = token.cancelled() => break,
        res = listener.accept() => {
          let Ok((stream, _)) = res else { continue; };
          let manager = self.clone();
          tokio::spawn(async move {
            manager.handle_tcp_stream(stream).await;
          });
        }
      }
    }
  }

  async fn handle_tcp_stream(&self, stream: TcpStream) {
    let mut reader = BufReader::new(stream);
    let mut line = String::new();

    loop {
      line.clear();
      let result = reader.read_line(&mut line).await;
      if result.unwrap_or(0) == 0 {
        break;
      }

      if let Ok(message) = serde_json::from_str::<Value>(&line) {
        if let Ok(addr) = reader.get_ref().peer_addr() {
          self.handle_incoming_message(message, addr).await;
        }
      }
    }
  }

  async fn handle_incoming_message(&self, message: Value, addr: SocketAddr) {
    let msg_type = message.get("type").and_then(|v| v.as_str()).unwrap_or("");
    let sender_id = message.get("senderId").and_then(|v| v.as_str()).unwrap_or("");
    let receiver_id = message.get("receiverId").and_then(|v| v.as_str()).unwrap_or("");

    if !self.should_process_message(msg_type, receiver_id).await {
      return;
    }

    match msg_type {
      "chat" => {
        self.emit_message_received(&message).await;
        self
          .send_delivery_receipt(
            sender_id,
            message.get("id").and_then(|v| v.as_str()).unwrap_or(""),
            addr.ip().to_string(),
          )
          .await;
      }
      "delivery_receipt" => {
        let _ = self.app.emit("messaging:delivery-receipt", message.clone());
        let message_id = message.get("messageId").and_then(|v| v.as_str()).unwrap_or("");
        self.update_delivered(message_id).await;
      }
      "read_receipt" => {
        let _ = self.app.emit("messaging:read-receipt", message.clone());
        let message_id = message.get("messageId").and_then(|v| v.as_str()).unwrap_or("");
        self.update_read(message_id).await;
      }
      "typing" => {
        let is_typing = message.get("content").and_then(|v| v.as_str()).unwrap_or("") == "typing";
        let payload = json!({"userId": sender_id, "isTyping": is_typing});
        let _ = self.app.emit("messaging:typing", payload);
      }
      "group_chat" => {
        let _ = self.app.emit("group:message-received", message.clone());
        let receipt = json!({
          "id": uuid::Uuid::new_v4().to_string(),
          "type": "group_delivery_receipt",
          "senderId": self.my_user_id().await,
          "receiverId": sender_id,
          "timestamp": now_iso(),
          "messageId": message.get("id").and_then(|v| v.as_str()).unwrap_or(""),
          "groupId": message.get("groupId").and_then(|v| v.as_str()).unwrap_or(""),
          "deliveredAt": now_iso()
        });
        let _ = self.send_udp_message(&addr.ip().to_string(), &receipt).await;
      }
      "group_create" => {
        let _ = self.app.emit("group:created", message.clone());
      }
      "group_join" | "group_leave" => {
        let _ = self.app.emit("group:member-changed", message.clone());
      }
      "group_read_receipt" => {
        let _ = self.app.emit("group:read-receipt", message.clone());
      }
      "group_delivery_receipt" => {
        let _ = self.app.emit("group:delivery-receipt", message.clone());
      }
      "group_typing" => {
        let _ = self.app.emit("group:typing", message.clone());
      }
      "file_offer" => {
        self.handle_file_offer(&message).await;
      }
      "file_accept" => {
        self.handle_file_accept(&message).await;
      }
      "file_reject" => {
        self.handle_file_reject(&message).await;
      }
      "ping" => {
        let _ = self.send_pong(sender_id, &addr.ip().to_string()).await;
      }
      "pong" => {
        self.update_peer_presence(sender_id, &addr.ip().to_string()).await;
      }
      _ => {}
    }
  }

  async fn emit_message_received(&self, message: &Value) {
    let payload = json!({
      "id": message.get("id").and_then(|v| v.as_str()),
      "messageId": message.get("id").and_then(|v| v.as_str()),
      "senderId": message.get("senderId").and_then(|v| v.as_str()),
      "senderName": message.get("senderName").and_then(|v| v.as_str()),
      "receiverId": message.get("receiverId").and_then(|v| v.as_str()),
      "content": message.get("content").and_then(|v| v.as_str()),
      "timestamp": message.get("timestamp").and_then(|v| v.as_str()),
      "type": "text",
      "isRead": false,
      "delivered": true,
      "deliveredAt": now_iso()
    });

    let _ = self.app.emit("messaging:received", payload);
    self.persist_message(message.clone(), true, false).await;
  }

    async fn persist_message(&self, message: Value, delivered: bool, is_read: bool) {
    let app = self.app.clone();
    tokio::task::spawn_blocking(move || {
      store_message(&app, message, delivered, is_read);
    });
  }
async fn send_delivery_receipt(&self, receiver_id: &str, message_id: &str, target_ip: String) {
    if receiver_id.is_empty() || message_id.is_empty() {
      return;
    }

    let receipt = json!({
      "id": uuid::Uuid::new_v4().to_string(),
      "type": "delivery_receipt",
      "senderId": self.my_user_id().await,
      "receiverId": receiver_id,
      "timestamp": now_iso(),
      "messageId": message_id,
      "deliveredAt": now_iso()
    });

    let _ = self.send_udp_message(&target_ip, &receipt).await;
  }

  async fn send_pong(&self, receiver_id: &str, target_ip: &str) -> bool {
    let pong = json!({
      "id": uuid::Uuid::new_v4().to_string(),
      "type": "pong",
      "senderId": self.my_user_id().await,
      "receiverId": receiver_id,
      "timestamp": now_iso()
    });

    self.send_udp_message(target_ip, &pong).await
  }

  async fn should_process_message(&self, msg_type: &str, receiver_id: &str) -> bool {
    if msg_type.starts_with("group_") {
      return true;
    }

    let my_user_id = self.my_user_id().await;
    receiver_id == my_user_id || receiver_id.is_empty()
  }

    async fn update_delivered(&self, message_id: &str) {
    if message_id.is_empty() {
      return;
    }
    let app = self.app.clone();
    let id = message_id.to_string();
    tokio::task::spawn_blocking(move || {
      update_message_status(&app, &id, true, false);
    });
  }

  async fn update_read(&self, message_id: &str) {
    if message_id.is_empty() {
      return;
    }
    let app = self.app.clone();
    let id = message_id.to_string();
    tokio::task::spawn_blocking(move || {
      update_message_status(&app, &id, true, true);
    });
  }
async fn handle_file_offer(&self, message: &Value) {
    let transfer = FileTransfer {
      id: message.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
      peerId: message.get("senderId").and_then(|v| v.as_str()).unwrap_or("").to_string(),
      fileName: message.get("fileName").and_then(|v| v.as_str()).unwrap_or("unknown").to_string(),
      fileSize: message.get("fileSize").and_then(|v| v.as_u64()).unwrap_or(0),
      progress: 0,
      status: "pending".to_string(),
      direction: "receive".to_string(),
      totalChunks: message.get("totalChunks").and_then(|v| v.as_u64()).unwrap_or(0),
    };

    {
      let mut state = self.state.lock().await;
      state.file_transfers.insert(transfer.id.clone(), transfer.clone());
    }

    let _ = self.app.emit("p2p:file-offer", transfer);
  }

  async fn handle_file_accept(&self, message: &Value) {
    let transfer_id = message.get("messageId").and_then(|v| v.as_str()).unwrap_or("");
    let mut state = self.state.lock().await;
    if let Some(transfer) = state.file_transfers.get_mut(transfer_id) {
      transfer.status = "accepted".to_string();
      let _ = self
        .app
        .emit("p2p:file-progress", json!({"transferId": transfer_id, "progress": 0}));
    }
  }

  async fn handle_file_reject(&self, message: &Value) {
    let transfer_id = message.get("messageId").and_then(|v| v.as_str()).unwrap_or("");
    let mut state = self.state.lock().await;
    if let Some(transfer) = state.file_transfers.remove(transfer_id) {
      let _ = self.app.emit("p2p:file-complete", transfer);
    }
  }

  async fn update_peer_presence(&self, user_id: &str, ip_address: &str) {
    let mut state = self.state.lock().await;
    for peer in state.peers.values_mut() {
      if peer.userId == user_id {
        peer.isOnline = true;
        peer.ipAddress = ip_address.to_string();
        peer.lastSeen = now_iso();
        let _ = self.app.emit("p2p:peer-online", peer.clone());
        break;
      }
    }
  }

  async fn discovery_broadcast_loop(&self, discovery_port: u16, token: CancellationToken) {
    let mut interval = tokio::time::interval(Duration::from_secs(30));

    loop {
      tokio::select! {
        _ = token.cancelled() => break,
        _ = interval.tick() => {
          let _ = self.broadcast_discovery(discovery_port).await;
        }
      }
    }
  }

  async fn broadcast_discovery(&self, discovery_port: u16) -> bool {
    let (peer_id, user_id, user_name, school_id) = {
      let state = self.state.lock().await;
      (
        state.my_peer_id.clone(),
        state.my_user_id.clone(),
        state.my_user_name.clone(),
        state.my_school_id.clone(),
      )
    };

    if user_id.is_empty() {
      return false;
    }

    let message = json!({
      "type": "discovery",
      "peerId": peer_id,
      "userId": user_id,
      "userName": user_name,
      "schoolId": school_id,
      "hostname": get_hostname(),
      "platform": std::env::consts::OS,
      "timestamp": now_iso()
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
      let _ = socket.send_to(&data, (addr.as_str(), discovery_port)).await;
    }

    true
  }

  async fn cleanup_loop(&self, token: CancellationToken) {
    let mut interval = tokio::time::interval(Duration::from_secs(60));

    loop {
      tokio::select! {
        _ = token.cancelled() => break,
        _ = interval.tick() => {
          let mut state = self.state.lock().await;
          let now = now_unix_ms();
          for peer in state.peers.values_mut() {
            if peer.isOnline {
              if let Ok(last_seen) = parse_iso(&peer.lastSeen) {
                if now.saturating_sub(last_seen) > 5 * 60 * 1000 {
                  peer.isOnline = false;
                  let _ = self.app.emit("p2p:peer-offline", peer.clone());
                }
              }
            }
          }
        }
      }
    }
  }

  async fn heartbeat_loop(&self, token: CancellationToken) {
    let mut interval = tokio::time::interval(Duration::from_secs(60));

    loop {
      tokio::select! {
        _ = token.cancelled() => break,
        _ = interval.tick() => {
          let peers = {
            let state = self.state.lock().await;
            state.peers.values().cloned().collect::<Vec<_>>()
          };

          for peer in peers {
            if peer.isOnline {
              let ping = json!({
                "id": uuid::Uuid::new_v4().to_string(),
                "type": "ping",
                "senderId": self.my_user_id().await,
                "receiverId": peer.userId,
                "timestamp": now_iso()
              });
              let _ = self.send_udp_message(&peer.ipAddress, &ping).await;
            }
          }
        }
      }
    }
  }
}

pub fn requested_discovery_port() -> u16 {
  parse_port(std::env::var("INTERNAL_P2P_DISCOVERY_PORT").ok(), 41235)
}

pub fn requested_udp_message_port() -> u16 {
  parse_port(std::env::var("INTERNAL_P2P_MESSAGE_PORT").ok(), 41236)
}

pub fn requested_tcp_message_port() -> u16 {
  parse_port(std::env::var("INTERNAL_P2P_TCP_PORT").ok(), 41237)
}

fn parse_port(value: Option<String>, fallback: u16) -> u16 {
  value
    .and_then(|v| v.parse::<u16>().ok())
    .unwrap_or(fallback)
}

fn generate_peer_id() -> String {
  let mac = mac_address::get_mac_address()
    .ok()
    .flatten()
    .map(|m| m.to_string())
    .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

  let mut hasher = sha2::Sha256::new();
  hasher.update(format!("{}{}", mac, now_unix_ms()));
  let result = hasher.finalize();
  let hex = hex::encode(result);
  hex.chars().take(16).collect()
}

fn get_local_ip() -> String {
  match local_ip_address::local_ip() {
    Ok(ip) => ip.to_string(),
    Err(_) => "127.0.0.1".to_string(),
  }
}

fn get_hostname() -> String {
  hostname::get()
    .ok()
    .and_then(|h| h.into_string().ok())
    .unwrap_or_else(|| "unknown".to_string())
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

fn now_iso() -> String {
  chrono::Utc::now().to_rfc3339()
}

fn now_unix_ms() -> i64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_millis() as i64
}

fn parse_iso(value: &str) -> Result<i64, ()> {
  let parsed = chrono::DateTime::parse_from_rfc3339(value).map_err(|_| ())?;
  Ok(parsed.timestamp_millis())
}











fn db_path_for(app: &AppHandle) -> Option<PathBuf> {
  app.path().app_data_dir().ok().map(|dir| dir.join("local.db"))
}

fn store_message(app: &AppHandle, message: Value, delivered: bool, is_read: bool) {
  let Some(path) = db_path_for(app) else { return; };
  let Ok(conn) = Connection::open(path) else { return; };

  let message_id = message.get("id").and_then(|v| v.as_str()).unwrap_or("");
  if message_id.is_empty() {
    return;
  }

  let sender_id = message.get("senderId").and_then(|v| v.as_str()).unwrap_or("");
  let receiver_id = message.get("receiverId").and_then(|v| v.as_str()).unwrap_or("");
  let content = message.get("content").and_then(|v| v.as_str()).unwrap_or("");
  let message_type = message.get("type").and_then(|v| v.as_str()).unwrap_or("text");
  let timestamp = message.get("timestamp").and_then(|v| v.as_str()).unwrap_or_else(|| "");
  let delivered_at = if delivered { Some(now_iso()) } else { None };
  let read_at = if is_read { Some(now_iso()) } else { None };

  let _ = conn.execute(
    "INSERT INTO messages (message_id, sender_id, recipient_id, content, message_type, timestamp, is_read, delivered, delivered_at, read_at, synced)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0)",
    params![
      message_id,
      sender_id,
      receiver_id,
      content,
      message_type,
      if timestamp.is_empty() { now_iso() } else { timestamp.to_string() },
      if is_read { 1 } else { 0 },
      if delivered { 1 } else { 0 },
      delivered_at,
      read_at
    ],
  );
}

fn update_message_status(app: &AppHandle, message_id: &str, delivered: bool, is_read: bool) {
  let Some(path) = db_path_for(app) else { return; };
  let Ok(conn) = Connection::open(path) else { return; };

  let delivered_at = if delivered { Some(now_iso()) } else { None };
  let read_at = if is_read { Some(now_iso()) } else { None };

  let _ = conn.execute(
    "UPDATE messages
     SET delivered = CASE WHEN ?1 = 1 THEN 1 ELSE delivered END,
         delivered_at = COALESCE(delivered_at, ?2),
         is_read = CASE WHEN ?3 = 1 THEN 1 ELSE is_read END,
         read_at = COALESCE(read_at, ?4)
     WHERE message_id = ?5",
    params![
      if delivered { 1 } else { 0 },
      delivered_at,
      if is_read { 1 } else { 0 },
      read_at,
      message_id
    ],
  );
}
