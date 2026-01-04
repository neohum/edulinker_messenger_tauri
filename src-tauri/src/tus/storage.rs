//! tus 파일 스토리지 구현

use super::types::{TusConfig, TusError, TusUpload};
use base64::Engine;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::fs::{self, File, OpenOptions};
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};
use tokio::sync::RwLock;

/// 파일 스토리지 - 업로드 상태 및 파일 관리
pub struct FileStorage {
    config: TusConfig,
    uploads: Arc<RwLock<HashMap<String, TusUpload>>>,
    base_path: PathBuf,
}

impl FileStorage {
    /// 새 스토리지 인스턴스 생성
    pub async fn new(config: TusConfig, app_data_dir: PathBuf) -> Result<Self, TusError> {
        let base_path = app_data_dir.join(&config.upload_dir);

        // 업로드 디렉토리 생성
        fs::create_dir_all(&base_path).await?;
        fs::create_dir_all(base_path.join("partial")).await?;
        fs::create_dir_all(base_path.join("complete")).await?;

        let storage = Self {
            config,
            uploads: Arc::new(RwLock::new(HashMap::new())),
            base_path,
        };

        // 기존 업로드 상태 복구
        storage.recover_uploads().await?;

        Ok(storage)
    }

    /// 기존 업로드 상태 복구
    async fn recover_uploads(&self) -> Result<(), TusError> {
        let meta_dir = self.base_path.join("partial");
        let mut entries = fs::read_dir(&meta_dir).await?;

        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "json") {
                if let Ok(content) = fs::read_to_string(&path).await {
                    if let Ok(upload) = serde_json::from_str::<TusUpload>(&content) {
                        if !upload.is_complete {
                            let mut uploads = self.uploads.write().await;
                            uploads.insert(upload.id.clone(), upload);
                        }
                    }
                }
            }
        }

        Ok(())
    }

    /// 새 업로드 생성
    pub async fn create_upload(
        &self,
        id: String,
        length: u64,
        metadata: HashMap<String, String>,
    ) -> Result<TusUpload, TusError> {
        // 파일 크기 체크
        if length > self.config.max_size {
            return Err(TusError::FileTooLarge {
                size: length,
                max: self.config.max_size,
            });
        }

        let upload = TusUpload::new(id.clone(), length, metadata);

        // 빈 파일 생성
        let file_path = self.partial_path(&id);
        File::create(&file_path).await?;

        // 메타데이터 저장
        self.save_metadata(&upload).await?;

        // 메모리에 저장
        let mut uploads = self.uploads.write().await;
        uploads.insert(id, upload.clone());

        Ok(upload)
    }

    /// 업로드 조회
    pub async fn get_upload(&self, id: &str) -> Result<TusUpload, TusError> {
        let uploads = self.uploads.read().await;
        uploads
            .get(id)
            .cloned()
            .ok_or_else(|| TusError::NotFound(id.to_string()))
    }

    /// 청크 쓰기
    pub async fn write_chunk(
        &self,
        id: &str,
        offset: u64,
        data: &[u8],
        checksum: Option<&str>,
    ) -> Result<u64, TusError> {
        // 업로드 정보 확인
        let upload = {
            let uploads = self.uploads.read().await;
            uploads
                .get(id)
                .cloned()
                .ok_or_else(|| TusError::NotFound(id.to_string()))?
        };

        // 오프셋 검증
        if offset != upload.offset {
            return Err(TusError::InvalidOffset {
                expected: upload.offset,
                actual: offset,
            });
        }

        // 체크섬 검증 (선택사항)
        if let Some(expected_checksum) = checksum {
            let mut hasher = Sha256::new();
            hasher.update(data);
            let actual_checksum = format!(
                "sha256 {}",
                base64::engine::general_purpose::STANDARD.encode(hasher.finalize())
            );
            if actual_checksum != expected_checksum {
                return Err(TusError::ChecksumMismatch);
            }
        }

        // 파일에 쓰기
        let file_path = self.partial_path(id);
        let mut file = OpenOptions::new()
            .write(true)
            .open(&file_path)
            .await?;

        file.seek(std::io::SeekFrom::Start(offset)).await?;
        file.write_all(data).await?;
        file.flush().await?;

        let new_offset = offset + data.len() as u64;

        // 업로드 상태 업데이트
        let is_complete = {
            let mut uploads = self.uploads.write().await;
            if let Some(upload) = uploads.get_mut(id) {
                upload.offset = new_offset;
                upload.updated_at = chrono::Utc::now().to_rfc3339();

                if new_offset >= upload.length {
                    upload.is_complete = true;
                }
                upload.is_complete
            } else {
                false
            }
        };

        // 완료 시 파일 이동
        if is_complete {
            self.finalize_upload(id).await?;
        } else {
            // 메타데이터 저장
            let upload = self.get_upload(id).await?;
            self.save_metadata(&upload).await?;
        }

        Ok(new_offset)
    }

    /// 업로드 완료 처리
    async fn finalize_upload(&self, id: &str) -> Result<String, TusError> {
        let upload = self.get_upload(id).await?;

        let filename = upload
            .filename()
            .cloned()
            .unwrap_or_else(|| format!("{}.bin", id));

        // 안전한 파일명 생성
        let safe_filename = sanitize_filename(&filename);
        let final_path = self.complete_path(&safe_filename);

        // 파일 이동
        let partial_path = self.partial_path(id);
        fs::rename(&partial_path, &final_path).await?;

        // 메타데이터 파일 삭제
        let meta_path = self.meta_path(id);
        let _ = fs::remove_file(&meta_path).await;

        // 업로드 상태 업데이트
        {
            let mut uploads = self.uploads.write().await;
            if let Some(upload) = uploads.get_mut(id) {
                upload.final_path = Some(final_path.to_string_lossy().to_string());
            }
        }

        Ok(final_path.to_string_lossy().to_string())
    }

    /// 업로드 삭제
    pub async fn delete_upload(&self, id: &str) -> Result<(), TusError> {
        // 파일 삭제
        let partial_path = self.partial_path(id);
        let _ = fs::remove_file(&partial_path).await;

        // 메타데이터 삭제
        let meta_path = self.meta_path(id);
        let _ = fs::remove_file(&meta_path).await;

        // 메모리에서 제거
        let mut uploads = self.uploads.write().await;
        uploads.remove(id);

        Ok(())
    }

    /// 만료된 업로드 정리
    pub async fn cleanup_expired(&self) -> Result<usize, TusError> {
        let now = chrono::Utc::now();
        let expiration = chrono::Duration::seconds(self.config.expiration_secs as i64);
        let mut removed = 0;

        let expired_ids: Vec<String> = {
            let uploads = self.uploads.read().await;
            uploads
                .iter()
                .filter_map(|(id, upload)| {
                    if let Ok(updated) = chrono::DateTime::parse_from_rfc3339(&upload.updated_at) {
                        if now.signed_duration_since(updated.with_timezone(&chrono::Utc)) > expiration {
                            return Some(id.clone());
                        }
                    }
                    None
                })
                .collect()
        };

        for id in expired_ids {
            self.delete_upload(&id).await?;
            removed += 1;
        }

        Ok(removed)
    }

    /// 메타데이터 저장
    async fn save_metadata(&self, upload: &TusUpload) -> Result<(), TusError> {
        let meta_path = self.meta_path(&upload.id);
        let content = serde_json::to_string_pretty(upload)
            .map_err(|e| TusError::StorageError(e.to_string()))?;
        fs::write(&meta_path, content).await?;
        Ok(())
    }

    /// 부분 업로드 파일 경로
    fn partial_path(&self, id: &str) -> PathBuf {
        self.base_path.join("partial").join(format!("{}.part", id))
    }

    /// 메타데이터 파일 경로
    fn meta_path(&self, id: &str) -> PathBuf {
        self.base_path.join("partial").join(format!("{}.json", id))
    }

    /// 완료된 파일 경로
    fn complete_path(&self, filename: &str) -> PathBuf {
        self.base_path.join("complete").join(filename)
    }

    /// 완료된 파일 목록 조회
    pub async fn list_complete_files(&self) -> Result<Vec<(String, u64)>, TusError> {
        let complete_dir = self.base_path.join("complete");
        let mut files = Vec::new();

        let mut entries = fs::read_dir(&complete_dir).await?;
        while let Some(entry) = entries.next_entry().await? {
            if let Ok(metadata) = entry.metadata().await {
                if metadata.is_file() {
                    let filename = entry.file_name().to_string_lossy().to_string();
                    files.push((filename, metadata.len()));
                }
            }
        }

        Ok(files)
    }

    /// 설정 조회
    pub fn config(&self) -> &TusConfig {
        &self.config
    }

    /// 활성 업로드 수 조회
    pub async fn active_upload_count(&self) -> usize {
        let uploads = self.uploads.read().await;
        uploads.len()
    }
}

/// 파일명 정규화 (보안)
fn sanitize_filename(filename: &str) -> String {
    let name = std::path::Path::new(filename)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    // 위험한 문자 제거
    name.chars()
        .filter(|c| c.is_alphanumeric() || *c == '.' || *c == '-' || *c == '_' || *c == ' ')
        .collect::<String>()
        .trim()
        .to_string()
}
