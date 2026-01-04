use serde_json::Value;
use tokio::net::UdpSocket;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

use crate::internal_p2p::InternalP2PManager;
use crate::network_discovery::NetworkDiscoveryManager;

struct DiscoveryHubState {
  port: Option<u16>,
  token: Option<CancellationToken>,
  task: Option<tokio::task::JoinHandle<()>>,
}

#[derive(Clone)]
pub struct DiscoveryHub {
  state: std::sync::Arc<Mutex<DiscoveryHubState>>,
}

impl DiscoveryHub {
  pub fn new() -> Self {
    let state = DiscoveryHubState {
      port: None,
      token: None,
      task: None,
    };

    Self {
      state: std::sync::Arc::new(Mutex::new(state)),
    }
  }

  pub async fn ensure_started(
    &self,
    requested_port: u16,
    internal: InternalP2PManager,
    discovery: NetworkDiscoveryManager,
  ) -> Result<u16, String> {
    let mut state = self.state.lock().await;
    if let Some(port) = state.port {
      return Ok(port);
    }

    let (socket, port) = bind_with_fallback(requested_port, 15).await?;
    let token = CancellationToken::new();
    state.token = Some(token.clone());

    let task = tokio::spawn(async move {
      discovery_loop(socket, token, internal, discovery).await;
    });

    state.task = Some(task);
    state.port = Some(port);

    Ok(port)
  }

  pub async fn stop(&self) {
    let mut state = self.state.lock().await;
    if let Some(token) = state.token.take() {
      token.cancel();
    }
    state.task = None;
    state.port = None;
  }

  pub async fn port(&self) -> Option<u16> {
    let state = self.state.lock().await;
    state.port
  }
}

async fn bind_with_fallback(start_port: u16, attempts: u16) -> Result<(UdpSocket, u16), String> {
  let mut port = start_port;
  let mut remaining = attempts;

  loop {
    match UdpSocket::bind(("0.0.0.0", port)).await {
      Ok(socket) => {
        let _ = socket.set_broadcast(true);
        return Ok((socket, port));
      }
      Err(err) => {
        remaining = remaining.saturating_sub(1);
        if remaining == 0 {
          return Err(format!("failed to bind discovery socket: {err}"));
        }
        port = port.saturating_add(1);
      }
    }
  }
}

async fn discovery_loop(
  socket: UdpSocket,
  token: CancellationToken,
  internal: InternalP2PManager,
  discovery: NetworkDiscoveryManager,
) {
  let mut buf = vec![0u8; 8192];

  loop {
    tokio::select! {
      _ = token.cancelled() => break,
      res = socket.recv_from(&mut buf) => {
        let Ok((len, addr)) = res else { continue; };
        let payload = &buf[..len];
        if let Ok(message) = serde_json::from_slice::<Value>(payload) {
          internal.handle_discovery_message(&message, &addr.ip().to_string()).await;
          discovery.handle_discovery_message(&message).await;
        }
      }
    }
  }
}
