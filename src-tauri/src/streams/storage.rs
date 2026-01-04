//! Durable Streams 메시지 스토리지
//! 다중 스트림 지원 및 메타데이터 관리

use super::types::{
    ConditionalResult, MessageType, OffsetRange, ReadResponse, StreamConfig, StreamError,
    StreamInfo, StreamMessage, StreamMode,
};
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};
use tokio::sync::broadcast;

/// 메시지 스토리지 - SQLite 기반 영속 저장소
pub struct MessageStorage {
    config: StreamConfig,
    db: Arc<Mutex<Connection>>,
    /// 새 메시지 브로드캐스트
    message_tx: broadcast::Sender<StreamMessage>,
    /// 현재 최대 오프셋
    current_offset: Arc<RwLock<u64>>,
    /// 총 바이트 수
    total_bytes: Arc<RwLock<u64>>,
    /// ETag (버전)
    etag: Arc<RwLock<String>>,
}

impl MessageStorage {
    /// 새 스토리지 인스턴스 생성
    pub async fn new(config: StreamConfig, app_data_dir: PathBuf) -> Result<Self, StreamError> {
        let db_path = app_data_dir.join(&config.storage_path).join("messages.db");

        // 디렉토리 생성
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let conn =
            Connection::open(&db_path).map_err(|e| StreamError::StorageError(e.to_string()))?;

        // 테이블 생성 (스트림 메타데이터 테이블 추가)
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                offset INTEGER UNIQUE NOT NULL,
                msg_type TEXT NOT NULL,
                payload TEXT NOT NULL,
                sender_id TEXT NOT NULL,
                recipient_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                byte_size INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS streams (
                path TEXT PRIMARY KEY,
                mode TEXT NOT NULL DEFAULT 'json',
                current_offset INTEGER NOT NULL DEFAULT 0,
                total_bytes INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                metadata TEXT DEFAULT '{}',
                etag TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_messages_offset ON messages(offset);
            CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
            CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id);
            CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
            CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(sender_id, recipient_id);
            "#,
        )
        .map_err(|e| StreamError::StorageError(e.to_string()))?;

        // 현재 최대 오프셋 조회
        let max_offset: u64 = conn
            .query_row("SELECT COALESCE(MAX(offset), 0) FROM messages", [], |row| {
                row.get(0)
            })
            .unwrap_or(0);

        // 총 바이트 수 조회
        let total_bytes: u64 = conn
            .query_row(
                "SELECT COALESCE(SUM(byte_size), 0) FROM messages",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        // ETag 생성
        let etag = Self::generate_etag(max_offset, total_bytes);

        let (message_tx, _) = broadcast::channel(1000);

        Ok(Self {
            config,
            db: Arc::new(Mutex::new(conn)),
            message_tx,
            current_offset: Arc::new(RwLock::new(max_offset)),
            total_bytes: Arc::new(RwLock::new(total_bytes)),
            etag: Arc::new(RwLock::new(etag)),
        })
    }

    /// ETag 생성
    fn generate_etag(offset: u64, bytes: u64) -> String {
        format!("\"{}:{}\"", offset, bytes)
    }

    /// 현재 ETag 조회
    pub async fn etag(&self) -> String {
        self.etag.read().unwrap().clone()
    }

    /// 총 바이트 수 조회
    pub async fn total_bytes(&self) -> u64 {
        *self.total_bytes.read().unwrap()
    }

    /// ETag 검사 (조건부 요청)
    pub async fn check_etag(&self, if_match: Option<&str>, if_none_match: Option<&str>) -> ConditionalResult {
        let current_etag = self.etag.read().unwrap();

        // If-Match 검사 (412 Precondition Failed)
        if let Some(expected) = if_match {
            if expected != "*" && expected != current_etag.as_str() {
                return ConditionalResult::PreconditionFailed;
            }
        }

        // If-None-Match 검사 (304 Not Modified)
        if let Some(expected) = if_none_match {
            if expected == "*" || expected == current_etag.as_str() {
                return ConditionalResult::NotModified;
            }
        }

        ConditionalResult::Proceed
    }

    /// 메시지 추가
    pub async fn append(&self, mut message: StreamMessage) -> Result<StreamMessage, StreamError> {
        // 새 오프셋 할당
        let offset = {
            let mut current = self.current_offset.write().unwrap();
            *current += 1;
            *current
        };

        message.offset = offset;

        // 메시지 직렬화 및 바이트 크기 계산
        let msg_type = serde_json::to_string(&message.msg_type)
            .map_err(|e| StreamError::SerializationError(e.to_string()))?;
        let payload = message.payload.to_string();
        let byte_size = payload.len() as u64;

        // DB에 저장
        let db = self.db.lock().unwrap();

        db.execute(
            r#"
            INSERT INTO messages (id, offset, msg_type, payload, sender_id, recipient_id, timestamp, byte_size)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            "#,
            params![
                message.id,
                message.offset,
                msg_type,
                payload,
                message.sender_id,
                message.recipient_id,
                message.timestamp,
                byte_size as i64
            ],
        )
        .map_err(|e| StreamError::StorageError(e.to_string()))?;

        drop(db); // DB 락 해제

        // 총 바이트 수 업데이트
        {
            let mut total = self.total_bytes.write().unwrap();
            *total += byte_size;
        }

        // ETag 업데이트
        {
            let current_offset = *self.current_offset.read().unwrap();
            let total_bytes = *self.total_bytes.read().unwrap();
            let mut etag = self.etag.write().unwrap();
            *etag = Self::generate_etag(current_offset, total_bytes);
        }

        // 브로드캐스트
        let _ = self.message_tx.send(message.clone());

        Ok(message)
    }

    /// 오프셋부터 메시지 조회
    pub async fn get_from_offset(
        &self,
        offset: u64,
        limit: usize,
    ) -> Result<Vec<StreamMessage>, StreamError> {
        let db = self.db.lock().unwrap();

        let mut stmt = db
            .prepare(
                r#"
                SELECT id, offset, msg_type, payload, sender_id, recipient_id, timestamp
                FROM messages
                WHERE offset > ?1
                ORDER BY offset ASC
                LIMIT ?2
                "#,
            )
            .map_err(|e| StreamError::StorageError(e.to_string()))?;

        let messages = stmt
            .query_map(params![offset, limit as i64], |row| {
                let msg_type_str: String = row.get(2)?;
                let payload_str: String = row.get(3)?;

                Ok(StreamMessage {
                    id: row.get(0)?,
                    offset: row.get(1)?,
                    msg_type: serde_json::from_str(&msg_type_str).unwrap_or(MessageType::Text),
                    payload: serde_json::from_str(&payload_str).unwrap_or(serde_json::Value::Null),
                    sender_id: row.get(4)?,
                    recipient_id: row.get(5)?,
                    timestamp: row.get(6)?,
                })
            })
            .map_err(|e| StreamError::StorageError(e.to_string()))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(messages)
    }

    /// 특정 대화의 메시지 조회
    pub async fn get_conversation(
        &self,
        user_id: &str,
        other_user_id: &str,
        from_offset: u64,
        limit: usize,
    ) -> Result<Vec<StreamMessage>, StreamError> {
        let db = self.db.lock().unwrap();

        let mut stmt = db
            .prepare(
                r#"
                SELECT id, offset, msg_type, payload, sender_id, recipient_id, timestamp
                FROM messages
                WHERE offset > ?1
                  AND ((sender_id = ?2 AND recipient_id = ?3) OR (sender_id = ?3 AND recipient_id = ?2))
                ORDER BY offset ASC
                LIMIT ?4
                "#,
            )
            .map_err(|e| StreamError::StorageError(e.to_string()))?;

        let messages = stmt
            .query_map(params![from_offset, user_id, other_user_id, limit as i64], |row| {
                let msg_type_str: String = row.get(2)?;
                let payload_str: String = row.get(3)?;

                Ok(StreamMessage {
                    id: row.get(0)?,
                    offset: row.get(1)?,
                    msg_type: serde_json::from_str(&msg_type_str).unwrap_or(MessageType::Text),
                    payload: serde_json::from_str(&payload_str).unwrap_or(serde_json::Value::Null),
                    sender_id: row.get(4)?,
                    recipient_id: row.get(5)?,
                    timestamp: row.get(6)?,
                })
            })
            .map_err(|e| StreamError::StorageError(e.to_string()))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(messages)
    }

    /// 사용자의 모든 메시지 조회 (발신/수신 모두)
    pub async fn get_user_messages(
        &self,
        user_id: &str,
        from_offset: u64,
        limit: usize,
    ) -> Result<Vec<StreamMessage>, StreamError> {
        let db = self.db.lock().unwrap();

        let mut stmt = db
            .prepare(
                r#"
                SELECT id, offset, msg_type, payload, sender_id, recipient_id, timestamp
                FROM messages
                WHERE offset > ?1
                  AND (sender_id = ?2 OR recipient_id = ?2)
                ORDER BY offset ASC
                LIMIT ?3
                "#,
            )
            .map_err(|e| StreamError::StorageError(e.to_string()))?;

        let messages = stmt
            .query_map(params![from_offset, user_id, limit as i64], |row| {
                let msg_type_str: String = row.get(2)?;
                let payload_str: String = row.get(3)?;

                Ok(StreamMessage {
                    id: row.get(0)?,
                    offset: row.get(1)?,
                    msg_type: serde_json::from_str(&msg_type_str).unwrap_or(MessageType::Text),
                    payload: serde_json::from_str(&payload_str).unwrap_or(serde_json::Value::Null),
                    sender_id: row.get(4)?,
                    recipient_id: row.get(5)?,
                    timestamp: row.get(6)?,
                })
            })
            .map_err(|e| StreamError::StorageError(e.to_string()))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(messages)
    }

    /// 메시지 ID로 조회
    pub async fn get_by_id(&self, id: &str) -> Result<Option<StreamMessage>, StreamError> {
        let db = self.db.lock().unwrap();

        let result = db
            .query_row(
                r#"
                SELECT id, offset, msg_type, payload, sender_id, recipient_id, timestamp
                FROM messages
                WHERE id = ?1
                "#,
                params![id],
                |row| {
                    let msg_type_str: String = row.get(2)?;
                    let payload_str: String = row.get(3)?;

                    Ok(StreamMessage {
                        id: row.get(0)?,
                        offset: row.get(1)?,
                        msg_type: serde_json::from_str(&msg_type_str).unwrap_or(MessageType::Text),
                        payload: serde_json::from_str(&payload_str)
                            .unwrap_or(serde_json::Value::Null),
                        sender_id: row.get(4)?,
                        recipient_id: row.get(5)?,
                        timestamp: row.get(6)?,
                    })
                },
            )
            .optional()
            .map_err(|e| StreamError::StorageError(e.to_string()))?;

        Ok(result)
    }

    /// 현재 오프셋 조회
    pub async fn current_offset(&self) -> u64 {
        *self.current_offset.read().unwrap()
    }

    /// 새 메시지 구독
    pub fn subscribe(&self) -> broadcast::Receiver<StreamMessage> {
        self.message_tx.subscribe()
    }

    /// 오래된 메시지 정리
    pub async fn cleanup_old_messages(&self) -> Result<usize, StreamError> {
        let retention = chrono::Duration::seconds(self.config.retention_secs as i64);
        let cutoff = chrono::Utc::now() - retention;
        let cutoff_str = cutoff.to_rfc3339();

        let db = self.db.lock().unwrap();
        let deleted = db
            .execute(
                "DELETE FROM messages WHERE timestamp < ?1",
                params![cutoff_str],
            )
            .map_err(|e| StreamError::StorageError(e.to_string()))?;

        Ok(deleted)
    }

    /// 메시지 수 조회
    pub async fn message_count(&self) -> Result<usize, StreamError> {
        let db = self.db.lock().unwrap();
        let count: i64 = db
            .query_row("SELECT COUNT(*) FROM messages", [], |row| row.get(0))
            .map_err(|e| StreamError::StorageError(e.to_string()))?;
        Ok(count as usize)
    }

    /// 설정 조회
    pub fn config(&self) -> &StreamConfig {
        &self.config
    }

    // ============================================
    // 스트림 관리 메서드 (Durable Streams 프로토콜)
    // ============================================

    /// 스트림 생성
    pub async fn create_stream(
        &self,
        path: &str,
        mode: StreamMode,
        metadata: HashMap<String, String>,
    ) -> Result<StreamInfo, StreamError> {
        let db = self.db.lock().unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        let etag = Self::generate_etag(0, 0);
        let metadata_json =
            serde_json::to_string(&metadata).unwrap_or_else(|_| "{}".to_string());
        let mode_str = match mode {
            StreamMode::Json => "json",
            StreamMode::Bytes => "bytes",
        };

        db.execute(
            r#"
            INSERT INTO streams (path, mode, current_offset, total_bytes, created_at, updated_at, metadata, etag)
            VALUES (?1, ?2, 0, 0, ?3, ?3, ?4, ?5)
            "#,
            params![path, mode_str, now, metadata_json, etag],
        )
        .map_err(|e| StreamError::StorageError(e.to_string()))?;

        Ok(StreamInfo {
            path: path.to_string(),
            mode,
            current_offset: 0,
            total_bytes: 0,
            created_at: now.clone(),
            updated_at: now,
            metadata,
            etag,
        })
    }

    /// 스트림 조회
    pub async fn get_stream(&self, path: &str) -> Result<Option<StreamInfo>, StreamError> {
        let db = self.db.lock().unwrap();

        let result = db
            .query_row(
                r#"
                SELECT path, mode, current_offset, total_bytes, created_at, updated_at, metadata, etag
                FROM streams WHERE path = ?1
                "#,
                params![path],
                |row| {
                    let mode_str: String = row.get(1)?;
                    let metadata_str: String = row.get(6)?;

                    Ok(StreamInfo {
                        path: row.get(0)?,
                        mode: if mode_str == "bytes" {
                            StreamMode::Bytes
                        } else {
                            StreamMode::Json
                        },
                        current_offset: row.get(2)?,
                        total_bytes: row.get(3)?,
                        created_at: row.get(4)?,
                        updated_at: row.get(5)?,
                        metadata: serde_json::from_str(&metadata_str).unwrap_or_default(),
                        etag: row.get(7)?,
                    })
                },
            )
            .optional()
            .map_err(|e| StreamError::StorageError(e.to_string()))?;

        Ok(result)
    }

    /// 스트림 목록 조회
    pub async fn list_streams(&self) -> Result<Vec<StreamInfo>, StreamError> {
        let db = self.db.lock().unwrap();

        let mut stmt = db
            .prepare(
                r#"
                SELECT path, mode, current_offset, total_bytes, created_at, updated_at, metadata, etag
                FROM streams ORDER BY created_at DESC
                "#,
            )
            .map_err(|e| StreamError::StorageError(e.to_string()))?;

        let streams = stmt
            .query_map([], |row| {
                let mode_str: String = row.get(1)?;
                let metadata_str: String = row.get(6)?;

                Ok(StreamInfo {
                    path: row.get(0)?,
                    mode: if mode_str == "bytes" {
                        StreamMode::Bytes
                    } else {
                        StreamMode::Json
                    },
                    current_offset: row.get(2)?,
                    total_bytes: row.get(3)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                    metadata: serde_json::from_str(&metadata_str).unwrap_or_default(),
                    etag: row.get(7)?,
                })
            })
            .map_err(|e| StreamError::StorageError(e.to_string()))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(streams)
    }

    /// 스트림 삭제
    pub async fn delete_stream(&self, path: &str) -> Result<bool, StreamError> {
        let db = self.db.lock().unwrap();

        let deleted = db
            .execute("DELETE FROM streams WHERE path = ?1", params![path])
            .map_err(|e| StreamError::StorageError(e.to_string()))?;

        Ok(deleted > 0)
    }

    /// 스트림 메타데이터 업데이트
    pub async fn update_stream_metadata(
        &self,
        path: &str,
        metadata: HashMap<String, String>,
    ) -> Result<Option<StreamInfo>, StreamError> {
        let db = self.db.lock().unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        let metadata_json =
            serde_json::to_string(&metadata).unwrap_or_else(|_| "{}".to_string());

        let updated = db
            .execute(
                "UPDATE streams SET metadata = ?1, updated_at = ?2 WHERE path = ?3",
                params![metadata_json, now, path],
            )
            .map_err(|e| StreamError::StorageError(e.to_string()))?;

        if updated == 0 {
            return Ok(None);
        }

        drop(db);
        self.get_stream(path).await
    }

    /// 범위 기반 메시지 읽기 (Content-Range 지원)
    pub async fn get_range(
        &self,
        range: &OffsetRange,
        limit: usize,
    ) -> Result<ReadResponse, StreamError> {
        let current = self.current_offset().await;
        let end_offset = range.end.unwrap_or(current).min(current);

        let messages = self.get_from_offset(range.start, limit).await?;

        let actual_end = messages.last().map(|m| m.offset).unwrap_or(range.start);
        let has_more = actual_end < end_offset;

        Ok(ReadResponse {
            messages,
            start_offset: range.start,
            end_offset: actual_end,
            total_offset: current,
            has_more,
        })
    }

    /// 스트림 정보 조회 (기본 스트림)
    pub async fn get_stream_info(&self) -> StreamInfo {
        let current_offset = self.current_offset().await;
        let total_bytes = self.total_bytes().await;
        let etag = self.etag().await;

        StreamInfo {
            path: "default".to_string(),
            mode: StreamMode::Json,
            current_offset,
            total_bytes,
            created_at: String::new(),
            updated_at: chrono::Utc::now().to_rfc3339(),
            metadata: HashMap::new(),
            etag,
        }
    }

    /// 메시지 삭제 (특정 ID)
    pub async fn delete_message(&self, id: &str) -> Result<bool, StreamError> {
        let db = self.db.lock().unwrap();

        // 먼저 메시지 바이트 크기 조회
        let byte_size: Option<i64> = db
            .query_row(
                "SELECT byte_size FROM messages WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| StreamError::StorageError(e.to_string()))?
            .flatten();

        if byte_size.is_none() {
            return Ok(false);
        }

        let deleted = db
            .execute("DELETE FROM messages WHERE id = ?1", params![id])
            .map_err(|e| StreamError::StorageError(e.to_string()))?;

        drop(db);

        if deleted > 0 {
            // 총 바이트 수 업데이트
            if let Some(size) = byte_size {
                let mut total = self.total_bytes.write().unwrap();
                *total = total.saturating_sub(size as u64);
            }

            // ETag 업데이트
            let current_offset = *self.current_offset.read().unwrap();
            let total_bytes = *self.total_bytes.read().unwrap();
            let mut etag = self.etag.write().unwrap();
            *etag = Self::generate_etag(current_offset, total_bytes);
        }

        Ok(deleted > 0)
    }
}
