//! Durable Streams HTTP 서버 구현
//! https://github.com/durable-streams/durable-streams 프로토콜 기반

use super::storage::MessageStorage;
use super::types::{
    AppendResponse, ConditionalResult, CreateStreamRequest, CreateStreamResponse,
    DeleteStreamResponse, ListStreamsResponse, LongPollResponse, MessageType, OffsetRange,
    ReadResponse, SseEvent, StreamConfig, StreamError, StreamInfo, StreamMessage, StreamMode,
    SubscribeOptions, TextPayload,
};
use axum::{
    extract::{Path, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Response,
    },
    routing::{delete, get, post, put},
    Json, Router,
};
use futures::stream::{self, Stream};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::convert::Infallible;
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::broadcast;
use tokio::time::{interval, timeout};
use tokio_stream::StreamExt;

/// 스트림 서버
pub struct StreamServer {
    storage: Arc<MessageStorage>,
}

impl StreamServer {
    /// 새 서버 인스턴스 생성
    pub async fn new(
        config: StreamConfig,
        app_data_dir: std::path::PathBuf,
    ) -> Result<Self, StreamError> {
        let storage = Arc::new(MessageStorage::new(config, app_data_dir).await?);

        Ok(Self { storage })
    }

    /// Axum 라우터 생성
    pub fn router(&self) -> Router {
        let state = AppState {
            storage: self.storage.clone(),
        };

        Router::new()
            // ========================================
            // Durable Streams 프로토콜 엔드포인트
            // ========================================
            // 스트림 생성 (PUT /streams/:path)
            .route("/streams/*path", put(handle_create_stream))
            // 스트림 조회 (GET /streams/:path)
            .route("/streams/*path", get(handle_get_stream))
            // 스트림 삭제 (DELETE /streams/:path)
            .route("/streams/*path", delete(handle_delete_stream))
            // 스트림 목록 조회
            .route("/streams", get(handle_list_streams))
            // 스트림 정보 (기본 스트림)
            .route("/info", get(handle_stream_info))
            // ========================================
            // 메시지 엔드포인트
            // ========================================
            // 메시지 전송 (append)
            .route("/messages", post(handle_send_message))
            // 메시지 조회 (범위 지원)
            .route("/messages", get(handle_get_messages_range))
            // 특정 메시지 조회
            .route("/messages/:id", get(handle_get_message))
            // 메시지 삭제
            .route("/messages/:id", delete(handle_delete_message))
            // ========================================
            // 실시간 스트리밍
            // ========================================
            // SSE 스트림 구독
            .route("/stream", get(handle_sse_stream))
            // Long-poll 조회
            .route("/poll", get(handle_long_poll))
            // ========================================
            // 대화 관리
            // ========================================
            // 대화 히스토리 조회
            .route("/conversations/:user_id", get(handle_get_conversation))
            // ========================================
            // 유틸리티
            // ========================================
            // 현재 오프셋 조회
            .route("/offset", get(handle_get_offset))
            // 상태 확인
            .route("/health", get(handle_health))
            .with_state(state)
    }

    /// 스토리지 참조
    pub fn storage(&self) -> &Arc<MessageStorage> {
        &self.storage
    }
}

#[derive(Clone)]
struct AppState {
    storage: Arc<MessageStorage>,
}

/// 메시지 전송 요청
#[derive(Debug, Deserialize)]
struct SendMessageRequest {
    /// 메시지 타입
    #[serde(rename = "type")]
    msg_type: MessageType,
    /// 수신자 ID
    recipient_id: String,
    /// 메시지 페이로드
    payload: serde_json::Value,
}

/// 메시지 전송 응답
#[derive(Debug, Serialize)]
struct SendMessageResponse {
    success: bool,
    message: Option<StreamMessage>,
    error: Option<String>,
}

/// 메시지 전송 핸들러
async fn handle_send_message(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<SendMessageRequest>,
) -> Result<Json<SendMessageResponse>, StreamErrorResponse> {
    // 발신자 ID 추출 (헤더에서)
    let sender_id = headers
        .get("X-Sender-Id")
        .and_then(|v| v.to_str().ok())
        .ok_or(StreamError::StorageError("Missing X-Sender-Id header".to_string()))?
        .to_string();

    let message = StreamMessage {
        id: uuid::Uuid::new_v4().to_string(),
        offset: 0, // append에서 할당됨
        msg_type: req.msg_type,
        payload: req.payload,
        sender_id,
        recipient_id: req.recipient_id,
        timestamp: chrono::Utc::now().to_rfc3339(),
    };

    let saved = state.storage.append(message).await?;

    Ok(Json(SendMessageResponse {
        success: true,
        message: Some(saved),
        error: None,
    }))
}

/// SSE 스트림 구독 쿼리
#[derive(Debug, Deserialize)]
struct SseQuery {
    /// 시작 오프셋
    #[serde(default)]
    offset: Option<u64>,
    /// 특정 사용자와의 대화만
    #[serde(default)]
    with_user: Option<String>,
}

/// SSE 스트림 핸들러
async fn handle_sse_stream(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<SseQuery>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let user_id = headers
        .get("X-User-Id")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    let start_offset = query.offset.unwrap_or(0);
    let with_user = query.with_user;
    let storage = state.storage.clone();

    // Last-Event-ID 헤더 지원
    let last_event_id = headers
        .get("Last-Event-ID")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u64>().ok());

    let effective_offset = last_event_id.unwrap_or(start_offset);

    let stream = async_stream::stream! {
        // 연결 이벤트
        let current = storage.current_offset().await;
        yield Ok(Event::default()
            .event("connected")
            .id(current.to_string())
            .data(serde_json::json!({ "offset": current }).to_string()));

        // 히스토리 캐치업
        if effective_offset > 0 {
            let messages = if let Some(ref other) = with_user {
                storage.get_conversation(&user_id, other, effective_offset, 100).await
            } else {
                storage.get_user_messages(&user_id, effective_offset, 100).await
            };

            if let Ok(messages) = messages {
                for msg in messages {
                    yield Ok(Event::default()
                        .event("message")
                        .id(msg.offset.to_string())
                        .data(serde_json::to_string(&msg).unwrap_or_default()));
                }
            }
        }

        // 실시간 메시지 구독
        let mut rx = storage.subscribe();
        let mut heartbeat = tokio::time::interval(Duration::from_secs(30));

        loop {
            tokio::select! {
                result = rx.recv() => {
                    match result {
                        Ok(msg) => {
                            // 필터링
                            let should_send = if let Some(ref other) = with_user {
                                (msg.sender_id == user_id && msg.recipient_id == *other) ||
                                (msg.sender_id == *other && msg.recipient_id == user_id)
                            } else {
                                msg.sender_id == user_id || msg.recipient_id == user_id
                            };

                            if should_send {
                                yield Ok(Event::default()
                                    .event("message")
                                    .id(msg.offset.to_string())
                                    .data(serde_json::to_string(&msg).unwrap_or_default()));
                            }
                        }
                        Err(broadcast::error::RecvError::Lagged(_)) => {
                            // 메시지 누락 - 클라이언트에게 리셋 알림
                            yield Ok(Event::default()
                                .event("reset")
                                .data("lagged"));
                        }
                        Err(_) => break,
                    }
                }
                _ = heartbeat.tick() => {
                    yield Ok(Event::default()
                        .event("heartbeat")
                        .data(chrono::Utc::now().to_rfc3339()));
                }
            }
        }
    };

    Sse::new(stream).keep_alive(KeepAlive::default())
}

/// Long-poll 쿼리
#[derive(Debug, Deserialize)]
struct LongPollQuery {
    /// 마지막 오프셋
    offset: u64,
    /// 특정 사용자와의 대화만
    #[serde(default)]
    with_user: Option<String>,
    /// 타임아웃 (초)
    #[serde(default = "default_timeout")]
    timeout_secs: u64,
}

fn default_timeout() -> u64 {
    30
}

/// Long-poll 핸들러
async fn handle_long_poll(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<LongPollQuery>,
) -> Result<Json<LongPollResponse>, StreamErrorResponse> {
    let user_id = headers
        .get("X-User-Id")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    let timeout_duration = Duration::from_secs(query.timeout_secs.min(60));

    // 먼저 기존 메시지 확인
    let messages = if let Some(ref other) = query.with_user {
        state
            .storage
            .get_conversation(&user_id, other, query.offset, 100)
            .await?
    } else {
        state
            .storage
            .get_user_messages(&user_id, query.offset, 100)
            .await?
    };

    if !messages.is_empty() {
        let next_offset = messages.last().map(|m| m.offset).unwrap_or(query.offset);
        return Ok(Json(LongPollResponse {
            messages,
            next_offset,
            has_more: false,
        }));
    }

    // 새 메시지 대기
    let mut rx = state.storage.subscribe();

    match timeout(timeout_duration, async {
        loop {
            match rx.recv().await {
                Ok(msg) => {
                    let should_include = if let Some(ref other) = query.with_user {
                        (msg.sender_id == user_id && msg.recipient_id == *other)
                            || (msg.sender_id == *other && msg.recipient_id == user_id)
                    } else {
                        msg.sender_id == user_id || msg.recipient_id == user_id
                    };

                    if should_include && msg.offset > query.offset {
                        return Some(msg);
                    }
                }
                Err(_) => return None,
            }
        }
    })
    .await
    {
        Ok(Some(msg)) => {
            let next_offset = msg.offset;
            Ok(Json(LongPollResponse {
                messages: vec![msg],
                next_offset,
                has_more: false,
            }))
        }
        Ok(None) | Err(_) => {
            // 타임아웃 또는 채널 닫힘
            Ok(Json(LongPollResponse {
                messages: vec![],
                next_offset: query.offset,
                has_more: false,
            }))
        }
    }
}

/// 대화 히스토리 조회 쿼리
#[derive(Debug, Deserialize)]
struct ConversationQuery {
    /// 시작 오프셋
    #[serde(default)]
    offset: u64,
    /// 조회 개수
    #[serde(default = "default_limit")]
    limit: usize,
}

fn default_limit() -> usize {
    50
}

/// 대화 히스토리 핸들러
async fn handle_get_conversation(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(other_user_id): Path<String>,
    Query(query): Query<ConversationQuery>,
) -> Result<Json<Vec<StreamMessage>>, StreamErrorResponse> {
    let user_id = headers
        .get("X-User-Id")
        .and_then(|v| v.to_str().ok())
        .ok_or(StreamError::StorageError("Missing X-User-Id header".to_string()))?;

    let messages = state
        .storage
        .get_conversation(user_id, &other_user_id, query.offset, query.limit)
        .await?;

    Ok(Json(messages))
}

/// 메시지 조회 핸들러
async fn handle_get_message(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Option<StreamMessage>>, StreamErrorResponse> {
    let message = state.storage.get_by_id(&id).await?;
    Ok(Json(message))
}

/// 현재 오프셋 조회 핸들러
async fn handle_get_offset(State(state): State<AppState>) -> Json<serde_json::Value> {
    let offset = state.storage.current_offset().await;
    Json(serde_json::json!({ "offset": offset }))
}

/// 상태 확인 핸들러
async fn handle_health(State(state): State<AppState>) -> Json<serde_json::Value> {
    let count = state.storage.message_count().await.unwrap_or(0);
    let offset = state.storage.current_offset().await;
    let etag = state.storage.etag().await;
    let total_bytes = state.storage.total_bytes().await;

    Json(serde_json::json!({
        "status": "ok",
        "message_count": count,
        "current_offset": offset,
        "total_bytes": total_bytes,
        "etag": etag
    }))
}

// ============================================
// Durable Streams 프로토콜 핸들러
// ============================================

/// 스트림 생성 핸들러 (PUT /streams/:path)
async fn handle_create_stream(
    State(state): State<AppState>,
    Path(path): Path<String>,
    headers: HeaderMap,
    body: Option<Json<CreateStreamRequest>>,
) -> Result<(StatusCode, Json<CreateStreamResponse>), StreamErrorResponse> {
    // If-None-Match: * 로 이미 존재하는 경우 방지
    if let Some(if_none_match) = headers.get("If-None-Match").and_then(|v| v.to_str().ok()) {
        if if_none_match == "*" {
            // 스트림이 이미 존재하는지 확인
            if let Ok(Some(_)) = state.storage.get_stream(&path).await {
                return Ok((
                    StatusCode::PRECONDITION_FAILED,
                    Json(CreateStreamResponse {
                        success: false,
                        stream: None,
                        error: Some("Stream already exists".to_string()),
                    }),
                ));
            }
        }
    }

    let req = body.map(|b| b.0).unwrap_or(CreateStreamRequest {
        mode: StreamMode::Json,
        metadata: HashMap::new(),
    });

    match state
        .storage
        .create_stream(&path, req.mode, req.metadata)
        .await
    {
        Ok(stream) => Ok((
            StatusCode::CREATED,
            Json(CreateStreamResponse {
                success: true,
                stream: Some(stream),
                error: None,
            }),
        )),
        Err(e) => Ok((
            StatusCode::CONFLICT,
            Json(CreateStreamResponse {
                success: false,
                stream: None,
                error: Some(e.to_string()),
            }),
        )),
    }
}

/// 스트림 조회 핸들러 (GET /streams/:path)
async fn handle_get_stream(
    State(state): State<AppState>,
    Path(path): Path<String>,
    headers: HeaderMap,
) -> Result<Response, StreamErrorResponse> {
    // ETag 조건부 요청 확인
    let if_none_match = headers
        .get("If-None-Match")
        .and_then(|v| v.to_str().ok());

    match state.storage.get_stream(&path).await? {
        Some(stream) => {
            // 304 Not Modified 확인
            if let Some(expected_etag) = if_none_match {
                if expected_etag == stream.etag {
                    return Ok(StatusCode::NOT_MODIFIED.into_response());
                }
            }

            let mut response = Json(stream.clone()).into_response();
            response.headers_mut().insert(
                header::ETAG,
                stream.etag.parse().unwrap_or_else(|_| "".parse().unwrap()),
            );
            Ok(response)
        }
        None => Err(StreamError::NotFound(path).into()),
    }
}

/// 스트림 삭제 핸들러 (DELETE /streams/:path)
async fn handle_delete_stream(
    State(state): State<AppState>,
    Path(path): Path<String>,
    headers: HeaderMap,
) -> Result<Json<DeleteStreamResponse>, StreamErrorResponse> {
    // If-Match 조건부 요청 확인
    if let Some(if_match) = headers.get("If-Match").and_then(|v| v.to_str().ok()) {
        if let Ok(Some(stream)) = state.storage.get_stream(&path).await {
            if if_match != "*" && if_match != stream.etag {
                return Ok(Json(DeleteStreamResponse {
                    success: false,
                    error: Some("ETag mismatch".to_string()),
                }));
            }
        }
    }

    match state.storage.delete_stream(&path).await {
        Ok(true) => Ok(Json(DeleteStreamResponse {
            success: true,
            error: None,
        })),
        Ok(false) => Ok(Json(DeleteStreamResponse {
            success: false,
            error: Some("Stream not found".to_string()),
        })),
        Err(e) => Ok(Json(DeleteStreamResponse {
            success: false,
            error: Some(e.to_string()),
        })),
    }
}

/// 스트림 목록 조회 핸들러
async fn handle_list_streams(
    State(state): State<AppState>,
) -> Result<Json<ListStreamsResponse>, StreamErrorResponse> {
    let streams = state.storage.list_streams().await?;
    Ok(Json(ListStreamsResponse {
        total: streams.len(),
        streams,
    }))
}

/// 기본 스트림 정보 핸들러
async fn handle_stream_info(State(state): State<AppState>) -> Response {
    let info = state.storage.get_stream_info().await;
    let etag = info.etag.clone();

    let mut response = Json(info).into_response();
    if let Ok(etag_value) = etag.parse() {
        response.headers_mut().insert(header::ETAG, etag_value);
    }
    response
}

/// 메시지 범위 조회 쿼리
#[derive(Debug, Deserialize)]
struct MessagesRangeQuery {
    /// 시작 오프셋
    #[serde(default)]
    offset: u64,
    /// 조회 개수
    #[serde(default = "default_limit")]
    limit: usize,
}

/// 메시지 범위 조회 핸들러 (Content-Range 지원)
async fn handle_get_messages_range(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<MessagesRangeQuery>,
) -> Result<Response, StreamErrorResponse> {
    // ETag 조건부 요청 확인
    let if_none_match = headers.get("If-None-Match").and_then(|v| v.to_str().ok());
    let if_match = headers.get("If-Match").and_then(|v| v.to_str().ok());

    let check_result = state.storage.check_etag(if_match, if_none_match).await;
    match check_result {
        ConditionalResult::NotModified => {
            return Ok(StatusCode::NOT_MODIFIED.into_response());
        }
        ConditionalResult::PreconditionFailed => {
            return Ok(StatusCode::PRECONDITION_FAILED.into_response());
        }
        ConditionalResult::Proceed => {}
    }

    // Range 헤더 파싱
    let range = headers
        .get("Range")
        .and_then(|v| v.to_str().ok())
        .and_then(OffsetRange::parse)
        .unwrap_or(OffsetRange {
            start: query.offset,
            end: None,
        });

    let response_data = state.storage.get_range(&range, query.limit).await?;
    let etag = state.storage.etag().await;

    // Content-Range 헤더 생성
    let content_range = format!(
        "offsets {}-{}/{}",
        response_data.start_offset, response_data.end_offset, response_data.total_offset
    );

    let status = if response_data.has_more {
        StatusCode::PARTIAL_CONTENT
    } else {
        StatusCode::OK
    };

    let mut response = (status, Json(response_data)).into_response();

    if let Ok(range_value) = content_range.parse() {
        response
            .headers_mut()
            .insert(header::CONTENT_RANGE, range_value);
    }
    if let Ok(etag_value) = etag.parse() {
        response.headers_mut().insert(header::ETAG, etag_value);
    }

    Ok(response)
}

/// 메시지 삭제 핸들러
async fn handle_delete_message(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<DeleteStreamResponse>, StreamErrorResponse> {
    match state.storage.delete_message(&id).await {
        Ok(true) => Ok(Json(DeleteStreamResponse {
            success: true,
            error: None,
        })),
        Ok(false) => Ok(Json(DeleteStreamResponse {
            success: false,
            error: Some("Message not found".to_string()),
        })),
        Err(e) => Ok(Json(DeleteStreamResponse {
            success: false,
            error: Some(e.to_string()),
        })),
    }
}

/// 스트림 에러 응답
struct StreamErrorResponse(StreamError);

impl From<StreamError> for StreamErrorResponse {
    fn from(err: StreamError) -> Self {
        Self(err)
    }
}

impl IntoResponse for StreamErrorResponse {
    fn into_response(self) -> Response {
        let (status, message) = match &self.0 {
            StreamError::NotFound(_) => (StatusCode::NOT_FOUND, self.0.to_string()),
            StreamError::InvalidOffset(_) => (StatusCode::BAD_REQUEST, self.0.to_string()),
            _ => (StatusCode::INTERNAL_SERVER_ERROR, self.0.to_string()),
        };

        (
            status,
            Json(serde_json::json!({
                "success": false,
                "error": message
            })),
        )
            .into_response()
    }
}
