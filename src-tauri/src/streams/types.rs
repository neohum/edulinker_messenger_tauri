//! Durable Streams 타입 정의
//! https://github.com/durable-streams/durable-streams 프로토콜 기반

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 스트림 메시지
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamMessage {
    /// 메시지 고유 ID
    pub id: String,
    /// 스트림 내 오프셋 (순서 보장)
    pub offset: u64,
    /// 메시지 타입
    #[serde(rename = "type")]
    pub msg_type: MessageType,
    /// 메시지 본문
    pub payload: serde_json::Value,
    /// 발신자 ID
    pub sender_id: String,
    /// 수신자 ID (DM의 경우) 또는 채널 ID
    pub recipient_id: String,
    /// 생성 시간
    pub timestamp: String,
}

/// 메시지 타입
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum MessageType {
    /// 텍스트 메시지
    Text,
    /// 파일 메시지 (tus 업로드 참조)
    File,
    /// 이미지 메시지
    Image,
    /// 타이핑 표시
    Typing,
    /// 읽음 확인
    ReadReceipt,
    /// 전달 확인
    DeliveryReceipt,
    /// 시스템 메시지
    System,
    /// 사용자 온라인/오프라인
    Presence,
}

/// 텍스트 메시지 페이로드
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextPayload {
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_to: Option<String>,
}

/// 파일 메시지 페이로드
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilePayload {
    pub upload_id: String,
    pub filename: String,
    pub file_size: u64,
    pub mime_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail_url: Option<String>,
}

/// 타이핑 페이로드
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TypingPayload {
    pub is_typing: bool,
}

/// 읽음 확인 페이로드
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadReceiptPayload {
    pub message_ids: Vec<String>,
    pub read_at: String,
}

/// 전달 확인 페이로드
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeliveryReceiptPayload {
    pub message_ids: Vec<String>,
    pub delivered_at: String,
}

/// Presence 페이로드
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PresencePayload {
    pub user_id: String,
    pub is_online: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_seen: Option<String>,
}

/// 스트림 설정
#[derive(Debug, Clone)]
pub struct StreamConfig {
    /// 스트림 저장 경로
    pub storage_path: String,
    /// 최대 메시지 보관 수
    pub max_messages: usize,
    /// 메시지 보관 기간 (초)
    pub retention_secs: u64,
    /// SSE 하트비트 간격 (초)
    pub heartbeat_secs: u64,
    /// 롱폴 타임아웃 (초)
    pub long_poll_timeout_secs: u64,
}

impl Default for StreamConfig {
    fn default() -> Self {
        Self {
            storage_path: "streams".to_string(),
            max_messages: 10000,
            retention_secs: 7 * 24 * 60 * 60, // 7일
            heartbeat_secs: 30,
            long_poll_timeout_secs: 30,
        }
    }
}

/// 스트림 구독 옵션
#[derive(Debug, Clone, Deserialize)]
pub struct SubscribeOptions {
    /// 시작 오프셋 (없으면 최신부터)
    #[serde(default)]
    pub offset: Option<u64>,
    /// 특정 사용자와의 대화만 필터
    #[serde(default)]
    pub with_user: Option<String>,
    /// 특정 채널만 필터
    #[serde(default)]
    pub channel: Option<String>,
    /// 메시지 타입 필터
    #[serde(default)]
    pub types: Option<Vec<MessageType>>,
}

/// 스트림 에러
#[derive(Debug, thiserror::Error)]
pub enum StreamError {
    #[error("Stream not found: {0}")]
    NotFound(String),

    #[error("Invalid offset: {0}")]
    InvalidOffset(u64),

    #[error("Storage error: {0}")]
    StorageError(String),

    #[error("Serialization error: {0}")]
    SerializationError(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
}

/// SSE 이벤트 형식
#[derive(Debug, Clone, Serialize)]
pub struct SseEvent {
    /// 이벤트 ID (오프셋)
    pub id: String,
    /// 이벤트 타입
    pub event: String,
    /// 데이터
    pub data: String,
}

impl SseEvent {
    pub fn message(msg: &StreamMessage) -> Self {
        Self {
            id: msg.offset.to_string(),
            event: "message".to_string(),
            data: serde_json::to_string(msg).unwrap_or_default(),
        }
    }

    pub fn heartbeat() -> Self {
        Self {
            id: String::new(),
            event: "heartbeat".to_string(),
            data: chrono::Utc::now().to_rfc3339(),
        }
    }

    pub fn connected(offset: u64) -> Self {
        Self {
            id: offset.to_string(),
            event: "connected".to_string(),
            data: serde_json::json!({ "offset": offset }).to_string(),
        }
    }

    /// SSE 형식으로 직렬화
    pub fn to_sse_string(&self) -> String {
        let mut result = String::new();
        if !self.id.is_empty() {
            result.push_str(&format!("id: {}\n", self.id));
        }
        result.push_str(&format!("event: {}\n", self.event));
        result.push_str(&format!("data: {}\n\n", self.data));
        result
    }
}

/// Long-poll 응답
#[derive(Debug, Clone, Serialize)]
pub struct LongPollResponse {
    /// 메시지 목록
    pub messages: Vec<StreamMessage>,
    /// 다음 오프셋
    pub next_offset: u64,
    /// 더 많은 메시지가 있는지
    pub has_more: bool,
}

// ============================================
// Durable Streams 프로토콜 확장 타입
// ============================================

/// 스트림 정보 (메타데이터 포함)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamInfo {
    /// 스트림 경로/이름
    pub path: String,
    /// 스트림 모드 (json 또는 bytes)
    pub mode: StreamMode,
    /// 현재 오프셋
    pub current_offset: u64,
    /// 총 바이트 수
    pub total_bytes: u64,
    /// 생성 시간
    pub created_at: String,
    /// 마지막 수정 시간
    pub updated_at: String,
    /// 커스텀 메타데이터
    #[serde(default)]
    pub metadata: HashMap<String, String>,
    /// ETag (버전 관리용)
    pub etag: String,
}

/// 스트림 모드
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum StreamMode {
    /// JSON 메시지 모드 (기본값)
    #[default]
    Json,
    /// 바이트 스트림 모드
    Bytes,
}

/// 스트림 생성 요청
#[derive(Debug, Clone, Deserialize)]
pub struct CreateStreamRequest {
    /// 스트림 모드
    #[serde(default)]
    pub mode: StreamMode,
    /// 메타데이터
    #[serde(default)]
    pub metadata: HashMap<String, String>,
}

/// 스트림 생성 응답
#[derive(Debug, Clone, Serialize)]
pub struct CreateStreamResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<StreamInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// 스트림 삭제 응답
#[derive(Debug, Clone, Serialize)]
pub struct DeleteStreamResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// 범위 요청을 위한 구조체
#[derive(Debug, Clone)]
pub struct OffsetRange {
    /// 시작 오프셋
    pub start: u64,
    /// 끝 오프셋 (None이면 끝까지)
    pub end: Option<u64>,
}

impl OffsetRange {
    /// Range 헤더 파싱 (bytes=start-end 또는 offset=start-end)
    pub fn parse(header: &str) -> Option<Self> {
        let parts: Vec<&str> = header.split('=').collect();
        if parts.len() != 2 {
            return None;
        }

        let range_parts: Vec<&str> = parts[1].split('-').collect();
        if range_parts.is_empty() || range_parts.len() > 2 {
            return None;
        }

        let start = range_parts[0].parse().ok()?;
        let end = if range_parts.len() > 1 && !range_parts[1].is_empty() {
            Some(range_parts[1].parse().ok()?)
        } else {
            None
        };

        Some(Self { start, end })
    }
}

/// 조건부 요청 결과
#[derive(Debug, Clone, PartialEq)]
pub enum ConditionalResult {
    /// 조건 충족 - 요청 진행
    Proceed,
    /// 변경 없음 (304)
    NotModified,
    /// 전제 조건 실패 (412)
    PreconditionFailed,
}

/// 스트림 목록 응답
#[derive(Debug, Clone, Serialize)]
pub struct ListStreamsResponse {
    pub streams: Vec<StreamInfo>,
    pub total: usize,
}

/// 스트림 append 응답
#[derive(Debug, Clone, Serialize)]
pub struct AppendResponse {
    pub success: bool,
    pub offset: u64,
    pub etag: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// 스트림 읽기 응답 (Content-Range 지원)
#[derive(Debug, Clone, Serialize)]
pub struct ReadResponse {
    pub messages: Vec<StreamMessage>,
    pub start_offset: u64,
    pub end_offset: u64,
    pub total_offset: u64,
    pub has_more: bool,
}
