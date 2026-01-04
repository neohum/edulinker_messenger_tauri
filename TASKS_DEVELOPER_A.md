# Developer A - 백엔드/P2P 전문가 작업 지시서

## 담당 영역
- P2P 네트워크 완성
- IPC 커맨드 연결
- 보안/암호화
- 데이터베이스 최적화

---

## 🔴 Sprint 1 - Week 1-2

### Task A-1: P2P IPC 커맨드 연결 (예상 3일)

#### 목표
현재 `not_implemented`로 stub 처리된 P2P 커맨드들을 실제 구현체와 연결

#### 작업 파일
- `src-tauri/src/main.rs`

#### 상세 작업

**1. P2PState를 Tauri managed state로 등록**

```rust
// main.rs - setup 함수 내에 추가

fn main() {
  tauri::Builder::default()
    // ... 기존 코드 ...
    .setup(|app| {
      // 기존 AppState, ServerManager 등...

      // P2PState 등록
      let p2p_state = P2PState::new(app.handle().clone());
      app.manage(p2p_state);

      Ok(())
    })
}
```

**2. IPC 핸들러 구현**

```rust
// internal-p2p 커맨드들

#[tauri::command]
async fn internal_p2p_start(
    p2p: State<'_, P2PState>,
    user_id: String,
    user_name: String,
    school_id: Option<String>,
    discovery_port: Option<u16>,
) -> Result<Value, String> {
    let port = discovery_port.unwrap_or(41235);
    p2p.internal.start(user_id, user_name, school_id, port).await
}

#[tauri::command]
async fn internal_p2p_stop(p2p: State<'_, P2PState>) -> Result<Value, String> {
    p2p.internal.stop().await
}

#[tauri::command]
async fn internal_p2p_get_peers(p2p: State<'_, P2PState>) -> Result<Value, String> {
    p2p.internal.get_peers().await
}

#[tauri::command]
async fn internal_p2p_send_message(
    p2p: State<'_, P2PState>,
    peer_id: String,
    message: Value,
) -> Result<Value, String> {
    p2p.internal.send_message(&peer_id, message).await
}

#[tauri::command]
async fn internal_p2p_broadcast(
    p2p: State<'_, P2PState>,
    message: Value,
) -> Result<Value, String> {
    p2p.internal.broadcast(message).await
}

#[tauri::command]
async fn internal_p2p_offer_file(
    p2p: State<'_, P2PState>,
    peer_id: String,
    file_path: String,
) -> Result<Value, String> {
    p2p.internal.offer_file(&peer_id, &file_path).await
}

#[tauri::command]
async fn internal_p2p_accept_file(
    p2p: State<'_, P2PState>,
    transfer_id: String,
) -> Result<Value, String> {
    p2p.internal.accept_file(&transfer_id).await
}

#[tauri::command]
async fn internal_p2p_reject_file(
    p2p: State<'_, P2PState>,
    transfer_id: String,
) -> Result<Value, String> {
    p2p.internal.reject_file(&transfer_id).await
}

#[tauri::command]
async fn internal_p2p_get_transfers(p2p: State<'_, P2PState>) -> Result<Value, String> {
    p2p.internal.get_transfers().await
}
```

**3. network-discovery 커맨드들**

```rust
#[tauri::command]
async fn network_discovery_start(
    p2p: State<'_, P2PState>,
    port: Option<u16>,
) -> Result<Value, String> {
    let requested_port = port.unwrap_or(41235);
    let actual_port = p2p.hub.ensure_started(
        requested_port,
        p2p.internal.clone(),
        p2p.discovery.clone(),
    ).await?;

    p2p.discovery.start(actual_port, requested_port).await
}

#[tauri::command]
async fn network_discovery_stop(p2p: State<'_, P2PState>) -> Result<Value, String> {
    p2p.hub.stop().await;
    p2p.discovery.stop().await
}

#[tauri::command]
async fn network_discovery_get_devices(p2p: State<'_, P2PState>) -> Result<Value, String> {
    p2p.discovery.get_devices().await
}
```

**4. invoke_handler에 등록**

```rust
.invoke_handler(tauri::generate_handler![
    // ... 기존 커맨드들 ...

    // P2P 커맨드
    internal_p2p_start,
    internal_p2p_stop,
    internal_p2p_get_peers,
    internal_p2p_send_message,
    internal_p2p_broadcast,
    internal_p2p_offer_file,
    internal_p2p_accept_file,
    internal_p2p_reject_file,
    internal_p2p_get_transfers,

    // Network Discovery 커맨드
    network_discovery_start,
    network_discovery_stop,
    network_discovery_get_devices,
])
```

#### 테스트 방법
```bash
# Rust 컴파일 확인
cd src-tauri && cargo check

# 앱 실행 후 개발자 콘솔에서 테스트
await window.__TAURI__.invoke('internal_p2p_start', {
  userId: 'test-user',
  userName: 'Test User',
  schoolId: 'school-1'
});
```

#### 완료 기준
- [ ] 모든 P2P 커맨드가 실제 구현체와 연결됨
- [ ] 컴파일 에러 없음
- [ ] 기본 start/stop 동작 확인

---

### Task A-2: P2P 메시지 릴레이 완성 (예상 3일)

#### 목표
TCP 기반 메시지 전송/수신 완성 및 프론트엔드 이벤트 발행

#### 작업 파일
- `src-tauri/src/internal_p2p.rs`

#### 상세 작업

**1. 메시지 전송 메서드 완성**

```rust
impl InternalP2PManager {
    pub async fn send_message(&self, peer_id: &str, message: Value) -> Result<Value, String> {
        let state = self.state.lock().await;

        // 피어 찾기
        let peer = state.peers.get(peer_id)
            .ok_or_else(|| format!("Peer not found: {}", peer_id))?;

        // TCP 연결
        let addr = format!("{}:{}", peer.ipAddress, peer.port);
        let mut stream = TcpStream::connect(&addr).await
            .map_err(|e| format!("Connection failed: {}", e))?;

        // 메시지 직렬화 및 전송
        let payload = json!({
            "type": "message",
            "from": state.my_peer_id,
            "data": message,
            "timestamp": chrono::Utc::now().to_rfc3339()
        });

        let bytes = serde_json::to_vec(&payload)
            .map_err(|e| format!("Serialization failed: {}", e))?;

        stream.write_all(&bytes).await
            .map_err(|e| format!("Send failed: {}", e))?;
        stream.write_all(b"\n").await
            .map_err(|e| format!("Send failed: {}", e))?;

        Ok(json!({"success": true, "peerId": peer_id}))
    }
}
```

**2. 메시지 수신 핸들러 개선**

```rust
async fn handle_tcp_connection(&self, mut stream: TcpStream, addr: SocketAddr) {
    let mut reader = BufReader::new(&mut stream);
    let mut line = String::new();

    while reader.read_line(&mut line).await.is_ok() {
        if line.is_empty() {
            break;
        }

        if let Ok(message) = serde_json::from_str::<Value>(&line) {
            self.process_incoming_message(message, &addr).await;
        }

        line.clear();
    }
}

async fn process_incoming_message(&self, message: Value, addr: &SocketAddr) {
    let msg_type = message["type"].as_str().unwrap_or("");

    match msg_type {
        "message" => {
            // 프론트엔드로 이벤트 발행
            let _ = self.app.emit("p2p:message-received", json!({
                "from": message["from"],
                "data": message["data"],
                "timestamp": message["timestamp"]
            }));
        }
        "file-offer" => {
            let _ = self.app.emit("p2p:file-offer", json!({
                "transferId": message["transferId"],
                "from": message["from"],
                "fileName": message["fileName"],
                "fileSize": message["fileSize"]
            }));
        }
        "file-accept" | "file-reject" => {
            self.handle_file_response(&message).await;
        }
        "file-chunk" => {
            self.handle_file_chunk(&message).await;
        }
        _ => {}
    }
}
```

**3. 이벤트 발행 헬퍼 메서드**

```rust
impl InternalP2PManager {
    fn emit_peer_discovered(&self, peer: &PeerInfo) {
        let _ = self.app.emit("p2p:peer-discovered", peer.clone());
    }

    fn emit_peer_disconnected(&self, peer_id: &str) {
        let _ = self.app.emit("p2p:peer-disconnected", json!({
            "peerId": peer_id
        }));
    }

    fn emit_message_received(&self, from: &str, message: &Value) {
        let _ = self.app.emit("p2p:message-received", json!({
            "from": from,
            "message": message
        }));
    }

    fn emit_file_progress(&self, transfer: &FileTransfer) {
        let _ = self.app.emit("p2p:file-progress", transfer.clone());
    }

    fn emit_file_complete(&self, transfer_id: &str) {
        let _ = self.app.emit("p2p:file-complete", json!({
            "transferId": transfer_id
        }));
    }

    fn emit_file_error(&self, transfer_id: &str, error: &str) {
        let _ = self.app.emit("p2p:file-error", json!({
            "transferId": transfer_id,
            "error": error
        }));
    }
}
```

**4. 파일 전송 기능**

```rust
pub async fn offer_file(&self, peer_id: &str, file_path: &str) -> Result<Value, String> {
    let path = PathBuf::from(file_path);
    let metadata = std::fs::metadata(&path)
        .map_err(|e| format!("File not found: {}", e))?;

    let file_name = path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    let transfer_id = uuid::Uuid::new_v4().to_string();
    let file_size = metadata.len();

    // 전송 정보 저장
    let transfer = FileTransfer {
        id: transfer_id.clone(),
        peerId: peer_id.to_string(),
        fileName: file_name.clone(),
        fileSize: file_size,
        progress: 0,
        status: "pending".to_string(),
        direction: "outgoing".to_string(),
        totalChunks: (file_size / CHUNK_SIZE) + 1,
    };

    {
        let mut state = self.state.lock().await;
        state.file_transfers.insert(transfer_id.clone(), transfer.clone());
    }

    // 피어에게 offer 전송
    let offer_message = json!({
        "type": "file-offer",
        "transferId": transfer_id,
        "fileName": file_name,
        "fileSize": file_size
    });

    self.send_message(peer_id, offer_message).await?;

    Ok(json!({
        "success": true,
        "transferId": transfer_id
    }))
}

pub async fn accept_file(&self, transfer_id: &str) -> Result<Value, String> {
    let mut state = self.state.lock().await;

    if let Some(transfer) = state.file_transfers.get_mut(transfer_id) {
        transfer.status = "receiving".to_string();

        // 수락 메시지 전송
        let accept_message = json!({
            "type": "file-accept",
            "transferId": transfer_id
        });

        let peer_id = transfer.peerId.clone();
        drop(state);

        self.send_message(&peer_id, accept_message).await?;

        Ok(json!({"success": true}))
    } else {
        Err("Transfer not found".to_string())
    }
}

pub async fn reject_file(&self, transfer_id: &str) -> Result<Value, String> {
    let mut state = self.state.lock().await;

    if let Some(transfer) = state.file_transfers.get_mut(transfer_id) {
        transfer.status = "rejected".to_string();

        let reject_message = json!({
            "type": "file-reject",
            "transferId": transfer_id
        });

        let peer_id = transfer.peerId.clone();
        drop(state);

        self.send_message(&peer_id, reject_message).await?;

        Ok(json!({"success": true}))
    } else {
        Err("Transfer not found".to_string())
    }
}
```

#### 테스트 방법
1. 두 개의 앱 인스턴스 실행 (다른 포트)
2. 양쪽에서 P2P 시작
3. 피어 발견 확인
4. 메시지 전송 테스트
5. 파일 offer/accept 테스트

#### 완료 기준
- [ ] 피어 간 메시지 전송/수신 동작
- [ ] 모든 이벤트가 프론트엔드로 emit됨
- [ ] 파일 offer/accept/reject 동작
- [ ] 에러 상황 적절히 처리됨

---

### Task A-3: 메시지 암호화 기본 구현 (예상 2일)

#### 작업 파일
- `src-tauri/src/crypto.rs` (신규)
- `src-tauri/Cargo.toml`

#### 상세 작업

**1. 의존성 추가 (Cargo.toml)**

```toml
[dependencies]
aes-gcm = "0.10"
argon2 = "0.5"
rand = "0.8"
base64 = "0.21"
```

**2. crypto.rs 구현**

```rust
use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use argon2::{Argon2, PasswordHasher};
use rand::RngCore;

pub struct CryptoError(pub String);

impl From<String> for CryptoError {
    fn from(s: String) -> Self {
        CryptoError(s)
    }
}

pub struct MessageCrypto;

impl MessageCrypto {
    /// AES-256-GCM으로 암호화
    pub fn encrypt(plaintext: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, CryptoError> {
        let cipher = Aes256Gcm::new_from_slice(key)
            .map_err(|e| CryptoError(e.to_string()))?;

        // 12바이트 nonce 생성
        let mut nonce_bytes = [0u8; 12];
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = cipher.encrypt(nonce, plaintext)
            .map_err(|e| CryptoError(e.to_string()))?;

        // nonce + ciphertext 반환
        let mut result = nonce_bytes.to_vec();
        result.extend(ciphertext);

        Ok(result)
    }

    /// AES-256-GCM으로 복호화
    pub fn decrypt(ciphertext: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, CryptoError> {
        if ciphertext.len() < 12 {
            return Err(CryptoError("Ciphertext too short".to_string()));
        }

        let cipher = Aes256Gcm::new_from_slice(key)
            .map_err(|e| CryptoError(e.to_string()))?;

        let nonce = Nonce::from_slice(&ciphertext[..12]);
        let encrypted_data = &ciphertext[12..];

        cipher.decrypt(nonce, encrypted_data)
            .map_err(|e| CryptoError(e.to_string()))
    }

    /// 랜덤 키 생성
    pub fn generate_key() -> [u8; 32] {
        let mut key = [0u8; 32];
        OsRng.fill_bytes(&mut key);
        key
    }

    /// 패스워드로부터 키 파생
    pub fn derive_key(password: &str, salt: &[u8]) -> Result<[u8; 32], CryptoError> {
        let argon2 = Argon2::default();
        let mut output = [0u8; 32];

        argon2.hash_password_into(password.as_bytes(), salt, &mut output)
            .map_err(|e| CryptoError(e.to_string()))?;

        Ok(output)
    }

    /// Base64 인코딩
    pub fn to_base64(data: &[u8]) -> String {
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, data)
    }

    /// Base64 디코딩
    pub fn from_base64(data: &str) -> Result<Vec<u8>, CryptoError> {
        base64::Engine::decode(&base64::engine::general_purpose::STANDARD, data)
            .map_err(|e| CryptoError(e.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt() {
        let key = MessageCrypto::generate_key();
        let plaintext = b"Hello, World!";

        let encrypted = MessageCrypto::encrypt(plaintext, &key).unwrap();
        let decrypted = MessageCrypto::decrypt(&encrypted, &key).unwrap();

        assert_eq!(plaintext.to_vec(), decrypted);
    }

    #[test]
    fn test_key_derivation() {
        let salt = [0u8; 16];
        let key1 = MessageCrypto::derive_key("password", &salt).unwrap();
        let key2 = MessageCrypto::derive_key("password", &salt).unwrap();

        assert_eq!(key1, key2);
    }
}
```

**3. main.rs에 모듈 추가**

```rust
mod crypto;

use crypto::MessageCrypto;
```

**4. 암호화 IPC 커맨드**

```rust
#[tauri::command]
fn crypto_encrypt(plaintext: String, key: String) -> Result<String, String> {
    let key_bytes = MessageCrypto::from_base64(&key)
        .map_err(|e| e.0)?;

    if key_bytes.len() != 32 {
        return Err("Key must be 32 bytes".to_string());
    }

    let mut key_array = [0u8; 32];
    key_array.copy_from_slice(&key_bytes);

    let encrypted = MessageCrypto::encrypt(plaintext.as_bytes(), &key_array)
        .map_err(|e| e.0)?;

    Ok(MessageCrypto::to_base64(&encrypted))
}

#[tauri::command]
fn crypto_decrypt(ciphertext: String, key: String) -> Result<String, String> {
    let key_bytes = MessageCrypto::from_base64(&key)
        .map_err(|e| e.0)?;
    let ciphertext_bytes = MessageCrypto::from_base64(&ciphertext)
        .map_err(|e| e.0)?;

    if key_bytes.len() != 32 {
        return Err("Key must be 32 bytes".to_string());
    }

    let mut key_array = [0u8; 32];
    key_array.copy_from_slice(&key_bytes);

    let decrypted = MessageCrypto::decrypt(&ciphertext_bytes, &key_array)
        .map_err(|e| e.0)?;

    String::from_utf8(decrypted)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn crypto_generate_key() -> String {
    let key = MessageCrypto::generate_key();
    MessageCrypto::to_base64(&key)
}

#[tauri::command]
fn crypto_derive_key(password: String, salt: String) -> Result<String, String> {
    let salt_bytes = MessageCrypto::from_base64(&salt)
        .map_err(|e| e.0)?;

    let key = MessageCrypto::derive_key(&password, &salt_bytes)
        .map_err(|e| e.0)?;

    Ok(MessageCrypto::to_base64(&key))
}
```

#### 완료 기준
- [ ] 암호화/복호화 동작
- [ ] 키 생성 및 파생 동작
- [ ] 단위 테스트 통과
- [ ] IPC 커맨드 동작

---

### Task A-4: 데이터베이스 마이그레이션 시스템 (예상 2일)

#### 작업 파일
- `src-tauri/src/migrations.rs` (신규)

#### 상세 작업

```rust
use rusqlite::{params, Connection};

pub struct MigrationManager;

impl MigrationManager {
    /// 마이그레이션 실행
    pub fn run_migrations(conn: &Connection) -> Result<(), String> {
        // 마이그레이션 테이블 생성
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL
            )",
            [],
        ).map_err(|e| e.to_string())?;

        let current_version = Self::get_current_version(conn);

        for (version, migration) in MIGRATIONS.iter().enumerate() {
            let version = version as u32 + 1;
            if version > current_version {
                Self::apply_migration(conn, version, migration)?;
            }
        }

        Ok(())
    }

    fn get_current_version(conn: &Connection) -> u32 {
        conn.query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get(0),
        ).unwrap_or(0)
    }

    fn apply_migration(conn: &Connection, version: u32, sql: &str) -> Result<(), String> {
        conn.execute_batch(sql)
            .map_err(|e| format!("Migration {} failed: {}", version, e))?;

        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, datetime('now'))",
            params![version],
        ).map_err(|e| e.to_string())?;

        println!("[Migration] Applied version {}", version);
        Ok(())
    }
}

const MIGRATIONS: &[&str] = &[
    // v1: 암호화 키 테이블
    r#"
        CREATE TABLE IF NOT EXISTS encryption_keys (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            peer_id TEXT,
            key_type TEXT NOT NULL,
            public_key TEXT,
            private_key_encrypted TEXT,
            created_at TEXT NOT NULL,
            expires_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_encryption_keys_user ON encryption_keys(user_id);
    "#,

    // v2: 메시지 전문 검색
    r#"
        CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
            content,
            sender_id,
            recipient_id,
            content='messages',
            content_rowid='id'
        );

        CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
            INSERT INTO messages_fts(rowid, content, sender_id, recipient_id)
            VALUES (new.id, new.content, new.sender_id, new.recipient_id);
        END;
    "#,

    // v3: 설정 테이블
    r#"
        CREATE TABLE IF NOT EXISTS user_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
    "#,
];
```

#### main.rs에서 사용

```rust
mod migrations;

fn init_db(conn: &Connection) -> rusqlite::Result<()> {
    // 기존 테이블 생성...

    // 마이그레이션 실행
    migrations::MigrationManager::run_migrations(conn)
        .map_err(|e| rusqlite::Error::InvalidParameterName(e))?;

    Ok(())
}
```

---

## 📋 체크리스트

### Week 1
- [ ] Task A-1: P2P IPC 커맨드 연결
- [ ] Task A-2 시작: P2P 메시지 릴레이

### Week 2
- [ ] Task A-2 완료: P2P 메시지 릴레이
- [ ] Task A-3: 암호화 구현
- [ ] Task A-4: 마이그레이션 시스템

### 코드 리뷰 요청
- P2P 커맨드 연결 완료 시
- 암호화 모듈 완료 시

### 질문/블로커 발생 시
- Slack #dev-backend 채널 사용
- 긴급: 직접 연락

---

*작성일: 2026-01-03*
