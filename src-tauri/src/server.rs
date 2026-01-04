//! 통합 HTTP 서버 - tus 파일 업로드 + Durable Streams 메시징

use crate::streams::{StreamConfig, StreamServer};
use crate::tus::{TusConfig, TusServer};
use axum::{http::Method, Router};
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use tower_http::cors::{Any, CorsLayer};

/// 통합 서버 상태
pub struct AppServer {
    pub tus_server: Arc<TusServer>,
    pub stream_server: Arc<StreamServer>,
    addr: SocketAddr,
}

impl AppServer {
    /// 새 서버 생성
    pub async fn new(app_data_dir: PathBuf, port: u16) -> Result<Self, String> {
        // tus 서버 생성
        let tus_config = TusConfig::default();
        let tus_server = TusServer::new(tus_config, app_data_dir.clone())
            .await
            .map_err(|e| e.to_string())?;

        // Stream 서버 생성
        let stream_config = StreamConfig::default();
        let stream_server = StreamServer::new(stream_config, app_data_dir)
            .await
            .map_err(|e| e.to_string())?;

        let addr = SocketAddr::from(([127, 0, 0, 1], port));

        Ok(Self {
            tus_server: Arc::new(tus_server),
            stream_server: Arc::new(stream_server),
            addr,
        })
    }

    /// 라우터 생성
    fn router(&self) -> Router {
        // CORS 설정 (Durable Streams 프로토콜 지원)
        let cors = CorsLayer::new()
            .allow_origin(Any)
            .allow_methods([
                Method::GET,
                Method::POST,
                Method::PUT,
                Method::PATCH,
                Method::DELETE,
                Method::OPTIONS,
                Method::HEAD,
            ])
            .allow_headers(Any)
            .expose_headers(Any);

        Router::new()
            .nest("/tus", self.tus_server.router())
            .nest("/api/streams", self.stream_server.router())
            .layer(cors)
    }

    /// 서버 주소 조회
    pub fn addr(&self) -> SocketAddr {
        self.addr
    }

    /// 서버 시작 (백그라운드)
    pub async fn start(self: Arc<Self>) -> Result<(), String> {
        let router = self.router();
        let listener = tokio::net::TcpListener::bind(self.addr)
            .await
            .map_err(|e| e.to_string())?;

        println!("[Server] Starting on http://{}", self.addr);
        println!("[Server] tus endpoint: http://{}/tus/files", self.addr);
        println!(
            "[Server] Streams endpoint: http://{}/api/streams",
            self.addr
        );

        axum::serve(listener, router)
            .await
            .map_err(|e| e.to_string())?;

        Ok(())
    }
}

/// 서버 매니저 (Tauri 상태)
pub struct ServerManager {
    server: RwLock<Option<Arc<AppServer>>>,
    port: u16,
}

impl ServerManager {
    pub fn new(port: u16) -> Self {
        Self {
            server: RwLock::new(None),
            port,
        }
    }

    /// 서버 시작
    pub async fn start(&self, app_data_dir: PathBuf) -> Result<String, String> {
        let mut server_guard = self.server.write().await;

        if server_guard.is_some() {
            return Ok(format!("Server already running on port {}", self.port));
        }

        let server = Arc::new(AppServer::new(app_data_dir, self.port).await?);
        let server_clone = server.clone();

        // 백그라운드에서 서버 실행
        tokio::spawn(async move {
            if let Err(e) = server_clone.start().await {
                eprintln!("[Server] Error: {}", e);
            }
        });

        let addr = server.addr();
        *server_guard = Some(server);

        Ok(format!("Server started on http://{}", addr))
    }

    /// tus 서버 참조
    pub async fn tus_server(&self) -> Option<Arc<TusServer>> {
        let guard = self.server.read().await;
        guard.as_ref().map(|s| s.tus_server.clone())
    }

    /// Stream 서버 참조
    pub async fn stream_server(&self) -> Option<Arc<StreamServer>> {
        let guard = self.server.read().await;
        guard.as_ref().map(|s| s.stream_server.clone())
    }

    /// 포트 조회
    pub fn port(&self) -> u16 {
        self.port
    }
}
