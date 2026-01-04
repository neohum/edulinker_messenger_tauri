//! tus 프로토콜 타입 정의

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// tus 업로드 정보
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TusUpload {
    /// 고유 업로드 ID
    pub id: String,
    /// 전체 파일 크기
    pub length: u64,
    /// 현재까지 업로드된 바이트
    pub offset: u64,
    /// 업로드 메타데이터 (filename, filetype 등)
    pub metadata: HashMap<String, String>,
    /// 업로드 생성 시간
    pub created_at: String,
    /// 마지막 업데이트 시간
    pub updated_at: String,
    /// 업로드 완료 여부
    pub is_complete: bool,
    /// 최종 파일 경로 (완료 시)
    pub final_path: Option<String>,
}

impl TusUpload {
    pub fn new(id: String, length: u64, metadata: HashMap<String, String>) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id,
            length,
            offset: 0,
            metadata,
            created_at: now.clone(),
            updated_at: now,
            is_complete: false,
            final_path: None,
        }
    }

    pub fn filename(&self) -> Option<&String> {
        self.metadata.get("filename")
    }

    pub fn filetype(&self) -> Option<&String> {
        self.metadata.get("filetype")
    }

    pub fn sender_id(&self) -> Option<&String> {
        self.metadata.get("senderId")
    }

    pub fn recipient_id(&self) -> Option<&String> {
        self.metadata.get("recipientId")
    }
}

/// tus 서버 설정
#[derive(Debug, Clone)]
pub struct TusConfig {
    /// 업로드 저장 디렉토리
    pub upload_dir: String,
    /// 최대 파일 크기 (바이트)
    pub max_size: u64,
    /// 청크 크기 (바이트)
    pub chunk_size: u64,
    /// 업로드 만료 시간 (초)
    pub expiration_secs: u64,
}

impl Default for TusConfig {
    fn default() -> Self {
        Self {
            upload_dir: "uploads".to_string(),
            max_size: 10 * 1024 * 1024 * 1024, // 10GB
            chunk_size: 5 * 1024 * 1024,        // 5MB
            expiration_secs: 24 * 60 * 60,      // 24시간
        }
    }
}

/// tus 프로토콜 버전
pub const TUS_VERSION: &str = "1.0.0";

/// 지원하는 tus 확장
pub const TUS_EXTENSIONS: &[&str] = &[
    "creation",
    "creation-with-upload",
    "termination",
    "checksum",
    "expiration",
];

/// tus 에러 타입
#[derive(Debug, thiserror::Error)]
pub enum TusError {
    #[error("Upload not found: {0}")]
    NotFound(String),

    #[error("Invalid offset: expected {expected}, got {actual}")]
    InvalidOffset { expected: u64, actual: u64 },

    #[error("File too large: {size} exceeds max {max}")]
    FileTooLarge { size: u64, max: u64 },

    #[error("Invalid content type")]
    InvalidContentType,

    #[error("Missing header: {0}")]
    MissingHeader(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("Storage error: {0}")]
    StorageError(String),

    #[error("Checksum mismatch")]
    ChecksumMismatch,
}

/// tus 업로드 이벤트 (프론트엔드로 전송)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum TusEvent {
    #[serde(rename = "upload_created")]
    UploadCreated {
        upload_id: String,
        filename: String,
        total_size: u64,
    },

    #[serde(rename = "upload_progress")]
    UploadProgress {
        upload_id: String,
        offset: u64,
        total_size: u64,
        percentage: f64,
    },

    #[serde(rename = "upload_complete")]
    UploadComplete {
        upload_id: String,
        filename: String,
        file_path: String,
        total_size: u64,
    },

    #[serde(rename = "upload_error")]
    UploadError {
        upload_id: String,
        error: String,
    },
}
