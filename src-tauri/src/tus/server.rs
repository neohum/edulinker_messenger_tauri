//! tus HTTP 서버 구현

use super::storage::FileStorage;
use super::types::{TusConfig, TusError, TusEvent, TUS_EXTENSIONS, TUS_VERSION};
use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, HeaderMap, Method, Request, StatusCode},
    response::{IntoResponse, Response},
    routing::{delete, get, head, options, patch, post},
    Router,
};
use base64::Engine;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::broadcast;

/// tus 서버
pub struct TusServer {
    storage: Arc<FileStorage>,
    event_sender: broadcast::Sender<TusEvent>,
}

impl TusServer {
    /// 새 서버 인스턴스 생성
    pub async fn new(
        config: TusConfig,
        app_data_dir: std::path::PathBuf,
    ) -> Result<Self, TusError> {
        let storage = Arc::new(FileStorage::new(config, app_data_dir).await?);
        let (event_sender, _) = broadcast::channel(100);

        Ok(Self {
            storage,
            event_sender,
        })
    }

    /// 이벤트 수신자 생성
    pub fn subscribe(&self) -> broadcast::Receiver<TusEvent> {
        self.event_sender.subscribe()
    }

    /// Axum 라우터 생성
    pub fn router(&self) -> Router {
        let state = AppState {
            storage: self.storage.clone(),
            event_sender: self.event_sender.clone(),
        };

        Router::new()
            .route("/files", options(handle_options))
            .route("/files", post(handle_create))
            .route("/files/:id", head(handle_head))
            .route("/files/:id", patch(handle_patch))
            .route("/files/:id", delete(handle_delete))
            .route("/files/:id", options(handle_options))
            .with_state(state)
    }

    /// 스토리지 참조
    pub fn storage(&self) -> &Arc<FileStorage> {
        &self.storage
    }
}

#[derive(Clone)]
struct AppState {
    storage: Arc<FileStorage>,
    event_sender: broadcast::Sender<TusEvent>,
}

/// tus 공통 헤더 추가
fn tus_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert("Tus-Resumable", TUS_VERSION.parse().unwrap());
    headers.insert("Tus-Version", TUS_VERSION.parse().unwrap());
    headers.insert("Tus-Extension", TUS_EXTENSIONS.join(",").parse().unwrap());
    headers
}

/// OPTIONS 핸들러 - 서버 기능 조회
async fn handle_options(State(state): State<AppState>) -> impl IntoResponse {
    let mut headers = tus_headers();
    headers.insert(
        "Tus-Max-Size",
        state.storage.config().max_size.to_string().parse().unwrap(),
    );
    headers.insert("Access-Control-Allow-Origin", "*".parse().unwrap());
    headers.insert(
        "Access-Control-Allow-Methods",
        "POST, HEAD, PATCH, DELETE, OPTIONS".parse().unwrap(),
    );
    headers.insert(
        "Access-Control-Allow-Headers",
        "Content-Type, Upload-Length, Upload-Metadata, Upload-Offset, Tus-Resumable, Upload-Checksum"
            .parse()
            .unwrap(),
    );
    headers.insert(
        "Access-Control-Expose-Headers",
        "Upload-Offset, Upload-Length, Tus-Version, Tus-Resumable, Tus-Max-Size, Tus-Extension, Location"
            .parse()
            .unwrap(),
    );

    (StatusCode::NO_CONTENT, headers)
}

/// POST 핸들러 - 새 업로드 생성
async fn handle_create(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Result<impl IntoResponse, TusErrorResponse> {
    // Tus-Resumable 헤더 확인
    check_tus_version(&headers)?;

    // Upload-Length 헤더 (필수)
    let length: u64 = headers
        .get("Upload-Length")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse().ok())
        .ok_or(TusError::MissingHeader("Upload-Length".to_string()))?;

    // Upload-Metadata 파싱
    let metadata = parse_metadata(&headers);

    // 업로드 ID 생성
    let upload_id = uuid::Uuid::new_v4().to_string();

    // 업로드 생성
    let upload = state
        .storage
        .create_upload(upload_id.clone(), length, metadata.clone())
        .await?;

    // 이벤트 발송
    let _ = state.event_sender.send(TusEvent::UploadCreated {
        upload_id: upload_id.clone(),
        filename: upload.filename().cloned().unwrap_or_default(),
        total_size: length,
    });

    // creation-with-upload: 본문이 있으면 바로 쓰기
    let mut final_offset = 0u64;
    if !body.is_empty() {
        let checksum = headers
            .get("Upload-Checksum")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        final_offset = state
            .storage
            .write_chunk(&upload_id, 0, &body, checksum.as_deref())
            .await?;

        // 진행률 이벤트
        let _ = state.event_sender.send(TusEvent::UploadProgress {
            upload_id: upload_id.clone(),
            offset: final_offset,
            total_size: length,
            percentage: (final_offset as f64 / length as f64) * 100.0,
        });
    }

    let mut response_headers = tus_headers();
    response_headers.insert(
        "Location",
        format!("/tus/files/{}", upload_id).parse().unwrap(),
    );
    response_headers.insert("Upload-Offset", final_offset.to_string().parse().unwrap());
    response_headers.insert("Access-Control-Allow-Origin", "*".parse().unwrap());
    response_headers.insert(
        "Access-Control-Expose-Headers",
        "Location, Upload-Offset, Tus-Resumable".parse().unwrap(),
    );

    Ok((StatusCode::CREATED, response_headers))
}

/// HEAD 핸들러 - 업로드 상태 조회
async fn handle_head(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, TusErrorResponse> {
    check_tus_version(&headers)?;

    let upload = state.storage.get_upload(&id).await?;

    let mut response_headers = tus_headers();
    response_headers.insert("Upload-Offset", upload.offset.to_string().parse().unwrap());
    response_headers.insert("Upload-Length", upload.length.to_string().parse().unwrap());
    response_headers.insert("Cache-Control", "no-store".parse().unwrap());
    response_headers.insert("Access-Control-Allow-Origin", "*".parse().unwrap());
    response_headers.insert(
        "Access-Control-Expose-Headers",
        "Upload-Offset, Upload-Length, Tus-Resumable".parse().unwrap(),
    );

    Ok((StatusCode::OK, response_headers))
}

/// PATCH 핸들러 - 청크 업로드
async fn handle_patch(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Result<impl IntoResponse, TusErrorResponse> {
    check_tus_version(&headers)?;

    // Content-Type 확인
    let content_type = headers
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok());

    if content_type != Some("application/offset+octet-stream") {
        return Err(TusError::InvalidContentType.into());
    }

    // Upload-Offset 헤더 (필수)
    let offset: u64 = headers
        .get("Upload-Offset")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse().ok())
        .ok_or(TusError::MissingHeader("Upload-Offset".to_string()))?;

    let checksum = headers
        .get("Upload-Checksum")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    // 업로드 정보 조회 (길이 확인용)
    let upload = state.storage.get_upload(&id).await?;
    let total_size = upload.length;

    // 청크 쓰기
    let new_offset = state
        .storage
        .write_chunk(&id, offset, &body, checksum.as_deref())
        .await?;

    // 진행률 이벤트
    let percentage = (new_offset as f64 / total_size as f64) * 100.0;
    let _ = state.event_sender.send(TusEvent::UploadProgress {
        upload_id: id.clone(),
        offset: new_offset,
        total_size,
        percentage,
    });

    // 완료 확인
    if new_offset >= total_size {
        let upload = state.storage.get_upload(&id).await?;
        let _ = state.event_sender.send(TusEvent::UploadComplete {
            upload_id: id.clone(),
            filename: upload.filename().cloned().unwrap_or_default(),
            file_path: upload.final_path.unwrap_or_default(),
            total_size,
        });
    }

    let mut response_headers = tus_headers();
    response_headers.insert("Upload-Offset", new_offset.to_string().parse().unwrap());
    response_headers.insert("Access-Control-Allow-Origin", "*".parse().unwrap());
    response_headers.insert(
        "Access-Control-Expose-Headers",
        "Upload-Offset, Tus-Resumable".parse().unwrap(),
    );

    Ok((StatusCode::NO_CONTENT, response_headers))
}

/// DELETE 핸들러 - 업로드 삭제
async fn handle_delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, TusErrorResponse> {
    check_tus_version(&headers)?;

    state.storage.delete_upload(&id).await?;

    let mut response_headers = tus_headers();
    response_headers.insert("Access-Control-Allow-Origin", "*".parse().unwrap());

    Ok((StatusCode::NO_CONTENT, response_headers))
}

/// Tus-Resumable 버전 확인
fn check_tus_version(headers: &HeaderMap) -> Result<(), TusError> {
    let version = headers
        .get("Tus-Resumable")
        .and_then(|v| v.to_str().ok());

    match version {
        Some(TUS_VERSION) => Ok(()),
        Some(_) => Err(TusError::MissingHeader(
            "Unsupported Tus-Resumable version".to_string(),
        )),
        None => Err(TusError::MissingHeader("Tus-Resumable".to_string())),
    }
}

/// Upload-Metadata 헤더 파싱
fn parse_metadata(headers: &HeaderMap) -> HashMap<String, String> {
    let mut metadata = HashMap::new();

    if let Some(header_value) = headers.get("Upload-Metadata") {
        if let Ok(value) = header_value.to_str() {
            for pair in value.split(',') {
                let parts: Vec<&str> = pair.trim().splitn(2, ' ').collect();
                if parts.len() == 2 {
                    let key = parts[0].to_string();
                    // Base64 디코딩
                    if let Ok(decoded) =
                        base64::engine::general_purpose::STANDARD.decode(parts[1])
                    {
                        if let Ok(value) = String::from_utf8(decoded) {
                            metadata.insert(key, value);
                        }
                    }
                }
            }
        }
    }

    metadata
}

/// tus 에러 응답
struct TusErrorResponse(TusError);

impl From<TusError> for TusErrorResponse {
    fn from(err: TusError) -> Self {
        Self(err)
    }
}

impl IntoResponse for TusErrorResponse {
    fn into_response(self) -> Response {
        let (status, message) = match &self.0 {
            TusError::NotFound(_) => (StatusCode::NOT_FOUND, self.0.to_string()),
            TusError::InvalidOffset { .. } => (StatusCode::CONFLICT, self.0.to_string()),
            TusError::FileTooLarge { .. } => (StatusCode::PAYLOAD_TOO_LARGE, self.0.to_string()),
            TusError::InvalidContentType => (StatusCode::UNSUPPORTED_MEDIA_TYPE, self.0.to_string()),
            TusError::MissingHeader(_) => (StatusCode::BAD_REQUEST, self.0.to_string()),
            TusError::ChecksumMismatch => (StatusCode::EXPECTATION_FAILED, self.0.to_string()),
            _ => (StatusCode::INTERNAL_SERVER_ERROR, self.0.to_string()),
        };

        let mut headers = tus_headers();
        headers.insert("Access-Control-Allow-Origin", "*".parse().unwrap());

        (status, headers, message).into_response()
    }
}
