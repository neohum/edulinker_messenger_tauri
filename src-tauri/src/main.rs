// Prevent console window in addition to Tauri window in Windows release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod server;
mod streams;
mod tus;
mod internal_p2p;
mod network_discovery;
mod discovery_hub;

use std::sync::Arc;
use std::sync::Mutex as StdMutex;
use tokio::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio_util::sync::CancellationToken;
use tauri_plugin_notification::NotificationExt;

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};

use server::ServerManager;

struct AppState {
  db: StdMutex<Connection>,
}

struct DeviceRegistrationState {
  running: bool,
  user_id: String,
  user_name: String,
  school_id: Option<String>,
  cancel_token: Option<CancellationToken>,
}

struct DeviceRegistrationManager {
  app: AppHandle,
  state: std::sync::Arc<Mutex<DeviceRegistrationState>>,
}

impl DeviceRegistrationManager {
  fn new(app: AppHandle) -> Self {
    Self {
      app,
      state: std::sync::Arc::new(Mutex::new(DeviceRegistrationState {
        running: false,
        user_id: String::new(),
        user_name: String::new(),
        school_id: None,
        cancel_token: None,
      })),
    }
  }

  async fn start(&self, user_id: String, user_name: String, school_id: Option<String>) -> Result<Value, String> {
    let mut state = self.state.lock().await;
    if state.running {
      return Ok(json!({"success": true, "message": "Already running"}));
    }

    state.running = true;
    state.user_id = user_id;
    state.user_name = user_name;
    state.school_id = school_id;

    let token = CancellationToken::new();
    state.cancel_token = Some(token);

    Ok(json!({"success": true, "message": "Device registration started"}))
  }

  async fn stop(&self) -> Result<Value, String> {
    let mut state = self.state.lock().await;
    if !state.running {
      return Ok(json!({"success": true}));
    }

    state.running = false;
    if let Some(token) = state.cancel_token.take() {
      token.cancel();
    }

    Ok(json!({"success": true, "message": "Device registration stopped"}))
  }
}

struct P2PState {
  hub: discovery_hub::DiscoveryHub,
  internal: internal_p2p::InternalP2PManager,
  discovery: network_discovery::NetworkDiscoveryManager,
  device_registration: DeviceRegistrationManager,
}

impl P2PState {
  fn new(app: AppHandle) -> Self {
    Self {
      hub: discovery_hub::DiscoveryHub::new(),
      internal: internal_p2p::InternalP2PManager::new(app.clone()),
      discovery: network_discovery::NetworkDiscoveryManager::new(app.clone()),
      device_registration: DeviceRegistrationManager::new(app),
    }
  }
}
fn now_ms() -> i64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_millis() as i64
}

fn get_api_url() -> String {
  std::env::var("VITE_API_URL").unwrap_or_else(|_| "http://localhost:3000".to_string())
}

fn init_db(conn: &Connection) -> rusqlite::Result<()> {
  conn.execute_batch(
    "
    CREATE TABLE IF NOT EXISTS auth_store (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      token TEXT,
      user_json TEXT,
      expires_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS offline_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password_hash TEXT,
      name TEXT,
      role TEXT,
      region TEXT,
      school TEXT,
      grade TEXT,
      class_name TEXT,
      classroom TEXT,
      workplace TEXT,
      job_title TEXT,
      admin_duties TEXT,
      extension_number TEXT,
      phone_number TEXT,
      profile_completed INTEGER,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS offline_sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER,
      expires_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS address_book (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      name TEXT,
      email TEXT,
      phone TEXT,
      role TEXT,
      school_id TEXT,
      ip_address TEXT,
      hostname TEXT,
      os TEXT,
      platform TEXT,
      last_seen TEXT,
      is_online INTEGER,
      synced INTEGER,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id TEXT,
      recipient_id TEXT,
      content TEXT,
      message_type TEXT,
      timestamp TEXT,
      is_read INTEGER,
      delivered INTEGER,
      synced INTEGER
    );

    CREATE TABLE IF NOT EXISTS group_messages (
      id TEXT PRIMARY KEY,
      content TEXT,
      message_type TEXT,
      timestamp TEXT,
      sender_id TEXT,
      recipients TEXT,
      is_read INTEGER,
      delivered INTEGER
    );

    CREATE TABLE IF NOT EXISTS device_info (
      device_id TEXT PRIMARY KEY,
      user_id TEXT,
      hostname TEXT,
      ip_address TEXT,
      mac_address TEXT,
      os TEXT,
      platform TEXT,
      installed_at TEXT,
      last_seen TEXT,
      synced INTEGER
    );

    CREATE TABLE IF NOT EXISTS error_report_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      file_name TEXT,
      file_data BLOB,
      mime_type TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS shared_folders (
      id TEXT PRIMARY KEY,
      name TEXT,
      path TEXT,
      encrypted INTEGER,
      password TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS p2p_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT UNIQUE,
      sender_id TEXT,
      recipient_id TEXT,
      content TEXT,
      message_type TEXT,
      timestamp TEXT,
      is_read INTEGER DEFAULT 0,
      delivered INTEGER DEFAULT 0,
      read_at TEXT,
      delivered_at TEXT,
      network_type TEXT DEFAULT 'p2p'
    );

    CREATE TABLE IF NOT EXISTS discovered_devices (
      device_id TEXT PRIMARY KEY,
      hostname TEXT,
      ip_address TEXT,
      mac_address TEXT,
      os TEXT,
      platform TEXT,
      user_id TEXT,
      last_seen TEXT,
      discovery_version TEXT
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_address_book_user_id ON address_book(user_id);
    CREATE INDEX IF NOT EXISTS idx_p2p_messages_sender ON p2p_messages(sender_id);
    CREATE INDEX IF NOT EXISTS idx_p2p_messages_recipient ON p2p_messages(recipient_id);
    CREATE INDEX IF NOT EXISTS idx_p2p_messages_timestamp ON p2p_messages(timestamp);
    ")?;
  ensure_message_columns(conn)?;

  Ok(())
}


fn read_auth(conn: &Connection) -> Option<(String, Value, i64)> {
  let row = conn
    .query_row(
      "SELECT token, user_json, expires_at FROM auth_store WHERE id = 1",
      [],
      |row| {
        let token: String = row.get(0)?;
        let user_json: String = row.get(1)?;
        let expires_at: i64 = row.get(2)?;
        Ok((token, user_json, expires_at))
      },
    )
    .optional()
    .ok()?;

  let (token, user_json, expires_at) = row?;
  let user_value: Value = serde_json::from_str(&user_json).ok()?;
  Some((token, user_value, expires_at))
}

fn write_auth(conn: &Connection, token: &str, user: &Value, expires_at: i64) -> Result<(), String> {
  let user_json = serde_json::to_string(user).map_err(|e| e.to_string())?;
  conn
    .execute(
      "INSERT INTO auth_store (id, token, user_json, expires_at) VALUES (1, ?1, ?2, ?3)
       ON CONFLICT(id) DO UPDATE SET token = excluded.token, user_json = excluded.user_json, expires_at = excluded.expires_at",
      params![token, user_json, expires_at],
    )
    .map_err(|e| e.to_string())?;
  Ok(())
}


fn clear_auth(conn: &Connection) -> Result<(), String> {
  conn.execute("DELETE FROM auth_store", []).map_err(|e| e.to_string())?;
  Ok(())
}


fn db_path_for(app: &AppHandle) -> Result<std::path::PathBuf, String> {
  let base = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("failed to resolve app data dir: {e}"))?;
  std::fs::create_dir_all(&base).map_err(|e| e.to_string())?;
  Ok(base.join("local.db"))
}

fn not_implemented(channel: &str) -> Result<Value, String> {
  Ok(json!({
    "success": false,
    "error": format!("{channel} not implemented")
  }))
}
#[tauri::command]
async fn ipc(app: AppHandle, state: State<'_, AppState>, p2p: State<'_, P2PState>, channel: String, args: Value) -> Result<Value, String> {
  match channel.as_str() {
    "auth:login" => auth_login(state, args).await,
    "auth:register" => auth_register(args).await,
    "auth:logout" => auth_logout(state),
    "auth:get-stored" => auth_get_stored(state),
    "auth:refresh-token" => auth_refresh_token(state).await,
    "auth:check-email" => auth_check_email(state, args),
    "auth:offline-login" => auth_offline_login(state, args),
    "auth:offline-register" => auth_offline_register(state, args),
    "auth:validate-offline-session" => auth_validate_offline_session(state, args),
    "auth:sync-users" => auth_sync_users(state, args),
    "auth:get-offline-users" => auth_get_offline_users(state),
    "auth:seed-teacher-data" => not_implemented(&channel),
    "auth:seed-fake-users" => not_implemented(&channel),
    "auth:get-address-book" => auth_get_address_book(state, args).await,
    "auth:update-user-profile" => auth_update_user_profile(state, args),
    "auth:update-user-profile-offline" => auth_update_user_profile(state, args),
    "auth:seed-demo-data" => auth_seed_demo_data(state),
    "auth:seed-from-json" => not_implemented(&channel),
    "auth:auto-login" => auth_auto_login(state, args),

    "address-book:init-db" => address_book_init(state),
    "address-book:save-entry" => address_book_save_entry(state, args),
    "address-book:get-entry" => address_book_get_entry(state, args),
    "address-book:get-all-entries" => address_book_get_all(state),
    "address-book:get-users" => address_book_get_all(state),
    "address-book:get-entries-by-role" => address_book_get_by_role(state, args),
    "address-book:get-online-entries" => address_book_get_online(state),
    "address-book:delete-entry" => address_book_delete(state, args),
    "address-book:get-unsynced-entries" => address_book_get_unsynced(state),
    "address-book:mark-synced" => address_book_mark_synced(state, args),
    "address-book:update-online-status" => address_book_update_online_status(state, args),
    "address-book:sync-with-server" => address_book_sync_with_server(state, args),
    "address-book:get-stats" => address_book_get_stats(state),

    "messaging:send" => messaging_send(state, args).await,
    "messaging:get-offline" => messaging_get_offline(state, args),
    "messaging:get-unread-offline" => messaging_get_unread(state, args),
    "messaging:mark-read-offline" => messaging_mark_read(state, args),
    "messaging:get-unsynced" => messaging_get_unsynced(state),
    "messaging:mark-synced" => messaging_mark_synced(state, args),
    "messaging:save-offline" => messaging_save_offline(state, args),

    "get-app-version" => get_app_version(app),
    "get-device-info" => get_device_info(),
    "check-database-connection" => check_database_connection(state),
    "check-internal-network-ip" => check_internal_network_ip().await,
    "check-network-status" => check_network_status().await,

    "show-notification" => show_notification(app, args),
    "update-badge-count" => update_badge_count(app, args),

    "window:minimize" => window_minimize(app),
    "window:maximize" => window_maximize(app),
    "window:close" => window_close(app),
    "window:toggle-dev-tools" => window_toggle_devtools(app),

    "device:get-info" => device_get_info(state),
    "device:get-local-devices" => device_get_local_devices(state),

    "error-report-images:save" => error_images_save(state, args),
    "error-report-images:get" => error_images_get(state, args),
    "error-report-images:delete" => error_images_delete(state, args),
    "error-report-images:cleanup" => error_images_cleanup(state),

    "shared-folder:create" => shared_folder_create(app, state, args),
    "shared-folder:list" => shared_folder_list(state),
    "shared-folder:contents" => shared_folder_contents(args),
    "shared-folder:add-file" => shared_folder_add_file(args),
    "shared-folder:remove-file" => shared_folder_remove_file(args),

    "internal-p2p:start" => internal_p2p_start(p2p, args).await,
    "internal-p2p:stop" => internal_p2p_stop(p2p).await,
    "internal-p2p:status" => internal_p2p_status(p2p).await,
    "internal-p2p:get-peers" => internal_p2p_get_peers(p2p).await,
    "internal-p2p:send-message" => internal_p2p_send_message(p2p, args).await,
    "internal-p2p:get-messages" => internal_p2p_get_messages(state, args),
    "internal-p2p:get-unread-count" => internal_p2p_get_unread_count(state, args),
    "internal-p2p:send-read-receipt" => internal_p2p_send_read_receipt(p2p, args).await,
    "internal-p2p:send-typing" => internal_p2p_send_typing(p2p, args).await,
    "internal-p2p:offer-file" => internal_p2p_offer_file(p2p, args).await,
    "internal-p2p:accept-file" => internal_p2p_accept_file(p2p, args).await,
    "internal-p2p:reject-file" => internal_p2p_reject_file(p2p, args).await,
    "internal-p2p:get-file-transfers" => internal_p2p_get_file_transfers(p2p).await,
    "internal-p2p:send-group-message" => internal_p2p_send_group_message(p2p, args).await,
    "internal-p2p:broadcast-group-create" => internal_p2p_broadcast_group_create(p2p, args).await,
    "internal-p2p:broadcast-group-member-change" => internal_p2p_broadcast_group_member_change(p2p, args).await,
    "internal-p2p:send-group-read-receipt" => internal_p2p_send_group_read_receipt(p2p, args).await,
    "internal-p2p:send-group-typing" => internal_p2p_send_group_typing(p2p, args).await,

    "network-discovery:start" => network_discovery_start(p2p).await,
    "network-discovery:stop" => network_discovery_stop(p2p).await,
    "network-discovery:get-devices" => network_discovery_get_devices(p2p).await,
    "network-discovery:save-device" => network_discovery_save_device(state, args),
    "network-discovery:sync-databases" => network_discovery_sync_databases(state),

    "p2p:initiate-transfer" => not_implemented(&channel),
    "p2p:accept-transfer" => not_implemented(&channel),

    "p2p-messaging:send" => p2p_messaging_send(p2p, args).await,

    "p2p:start-device-registration" => p2p_start_device_registration(p2p, args).await,
    "p2p:stop-device-registration" => p2p_stop_device_registration(p2p).await,

    "system:collect-detailed-info" => system_collect_detailed_info(),
    "system:get-info" => system_collect_detailed_info(),

    "monitoring:get-metrics" => not_implemented(&channel),
    "org:save-chart" => not_implemented(&channel),
    "org:get-chart" => not_implemented(&channel),
    "org:sync-remote" => not_implemented(&channel),

    "sendP2PMessage" => not_implemented(&channel),
    "saveGroupMessage" => save_group_message(state, args),

    "settings:get" => settings_get(state, args),
    "settings:set" => settings_set(state, args),
    "settings:get-theme" => settings_get_theme(state),
    "settings:set-theme" => settings_set_theme(state, args),

    // File download
    "file:download" => file_download(app.clone(), state, p2p, args).await,
    "file:download-progress" => file_download_progress(args),
    "file:cancel-download" => file_cancel_download(args),
    "file:create-download-folder" => file_create_download_folder(args),

    _ => Err(format!("unsupported channel: {channel}")),
  }
}
async fn auth_login(state: State<'_, AppState>, args: Value) -> Result<Value, String> {
  let identifier = args
    .get("identifier")
    .and_then(|v| v.as_str())
    .ok_or("missing identifier")?
    .to_string();
  let password = args
    .get("password")
    .and_then(|v| v.as_str())
    .ok_or("missing password")?
    .to_string();
  let remember_me = args
    .get("rememberMe")
    .and_then(|v| v.as_bool())
    .unwrap_or(true);

  let api_url = get_api_url();
  let client = reqwest::Client::new();
  let response = client
    .post(format!("{api_url}/api/auth/login"))
    .json(&json!({"identifier": identifier, "password": password}))
    .send()
    .await
    .map_err(|e| e.to_string())?;

  if !response.status().is_success() {
    let error_body = response.text().await.unwrap_or_default();
    return Ok(json!({"success": false, "error": error_body}));
  }

  let data: Value = response.json().await.map_err(|e| e.to_string())?;
  let success = data.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
  if !success {
    return Ok(json!({"success": false, "error": "Login failed"}));
  }

  let token = data.get("token").cloned().unwrap_or(Value::Null);
  let user = data.get("user").cloned().unwrap_or(Value::Null);
  if let Some(token_str) = token.as_str() {
    let expiration_days = if remember_me { 30 } else { 7 };
    let expires_at = now_ms() + (expiration_days * 24 * 60 * 60 * 1000) as i64;
    let conn = state.db.lock().map_err(|_| "db lock")?;
    write_auth(&conn, token_str, &user, expires_at)?;
  }

  Ok(json!({"success": true, "token": token, "user": user}))
}

async fn auth_register(args: Value) -> Result<Value, String> {
  let api_url = get_api_url();
  let client = reqwest::Client::new();
  let response = client
    .post(format!("{api_url}/api/auth/register"))
    .json(&args)
    .send()
    .await
    .map_err(|e| e.to_string())?;

  let status = response.status();
  let data: Value = response.json().await.unwrap_or(json!({"success": false}));
  if !status.is_success() {
    return Ok(json!({"success": false, "error": data.get("message").cloned().unwrap_or(Value::String("Registration failed".to_string()))}));
  }

  Ok(data)
}

fn auth_logout(state: State<'_, AppState>) -> Result<Value, String> {
  let conn = state.db.lock().map_err(|_| "db lock")?;
  clear_auth(&conn)?;
  Ok(json!({"success": true}))
}

fn auth_get_stored(state: State<'_, AppState>) -> Result<Value, String> {
  let conn = state.db.lock().map_err(|_| "db lock")?;
  if let Some((token, user, _expires_at)) = read_auth(&conn) {
    Ok(json!({"success": true, "token": token, "user": user}))
  } else {
    Ok(json!({"success": false, "error": "No stored authentication"}))
  }
}

async fn auth_refresh_token(state: State<'_, AppState>) -> Result<Value, String> {
  let (token, user) = {
    let conn = state.db.lock().map_err(|_| "db lock")?;
    if let Some((token, user, _expires_at)) = read_auth(&conn) {
      (token, user)
    } else {
      return Ok(json!({"success": false, "error": "No authentication to refresh"}));
    }
  };

  let api_url = get_api_url();
  let client = reqwest::Client::new();
  let response = client
    .get(format!("{api_url}/api/auth/me"))
    .bearer_auth(&token)
    .send()
    .await
    .map_err(|e| e.to_string())?;

  if !response.status().is_success() {
    let conn = state.db.lock().map_err(|_| "db lock")?;
    clear_auth(&conn)?;
    return Ok(json!({"success": false, "error": "Token refresh failed"}));
  }

  let data: Value = response.json().await.map_err(|e| e.to_string())?;
  let user_value = data.get("user").cloned().unwrap_or(user);
  let expires_at = now_ms() + (7 * 24 * 60 * 60 * 1000) as i64;
  let conn = state.db.lock().map_err(|_| "db lock")?;
  write_auth(&conn, &token, &user_value, expires_at)?;

  Ok(json!({"success": true, "user": user_value}))
}
fn auth_check_email(state: State<'_, AppState>, args: Value) -> Result<Value, String> {
  let email = args.as_str().ok_or("missing email")?;
  let conn = state.db.lock().map_err(|_| "db lock")?;
  let existing: Option<i64> = conn
    .query_row(
      "SELECT id FROM offline_users WHERE email = ?1",
      params![email],
      |row| row.get(0),
    )
    .optional()
    .map_err(|e| e.to_string())?;

  Ok(json!({
    "success": true,
    "available": existing.is_none(),
    "message": if existing.is_some() {"Email already in use"} else {"Email available"}
  }))
}

fn auth_offline_register(state: State<'_, AppState>, args: Value) -> Result<Value, String> {
  let email = args.get("email").and_then(|v| v.as_str()).ok_or("missing email")?;
  let password = args.get("password").and_then(|v| v.as_str()).ok_or("missing password")?;
  let name = args.get("name").and_then(|v| v.as_str()).unwrap_or("Offline User");
  let role = args.get("role").and_then(|v| v.as_str()).unwrap_or("USER");
  let region = args.get("region").and_then(|v| v.as_str());
  let school = args.get("school").and_then(|v| v.as_str());

  let password_hash = bcrypt::hash(password, 10).map_err(|e| e.to_string())?;

  let conn = state.db.lock().map_err(|_| "db lock")?;

  // 이메일 중복 시 업데이트, 없으면 삽입 (id는 자동 생성)
  let result = conn.execute(
    "INSERT INTO offline_users (email, password_hash, name, role, region, school, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
     ON CONFLICT(email) DO UPDATE SET password_hash = ?2, name = ?3, role = ?4, region = ?5, school = ?6",
    params![email, password_hash, name, role, region, school, now_ms()],
  );

  match result {
    Ok(_) => {
      // 방금 삽입/업데이트된 사용자 ID 가져오기
      let user_id: i64 = conn.query_row(
        "SELECT id FROM offline_users WHERE email = ?1",
        params![email],
        |row| row.get(0),
      ).map_err(|e| e.to_string())?;

      // 토큰 생성 및 세션 저장
      let token = uuid::Uuid::new_v4().to_string();
      let expires_at = now_ms() + 7 * 24 * 60 * 60 * 1000;
      let _ = conn.execute(
        "INSERT INTO offline_sessions (token, user_id, expires_at) VALUES (?1, ?2, ?3)",
        params![token, user_id, expires_at],
      );

      Ok(json!({
        "success": true,
        "token": token,
        "user": {
          "id": user_id,
          "email": email,
          "name": name,
          "role": role,
          "school": school,
          "region": region,
          "profileCompleted": false
        }
      }))
    },
    Err(err) => Ok(json!({"success": false, "error": err.to_string()})),
  }
}

fn auth_offline_login(state: State<'_, AppState>, args: Value) -> Result<Value, String> {
  let email = args.get("email").and_then(|v| v.as_str()).ok_or("missing email")?;
  let password = args.get("password").and_then(|v| v.as_str()).ok_or("missing password")?;

  let conn = state.db.lock().map_err(|_| "db lock")?;
  let row = conn
    .query_row(
      "SELECT id, email, password_hash, name, role, school FROM offline_users WHERE email = ?1",
      params![email],
      |row| {
        Ok((
          row.get::<_, i64>(0)?,
          row.get::<_, String>(1)?,
          row.get::<_, String>(2)?,
          row.get::<_, String>(3)?,
          row.get::<_, String>(4)?,
          row.get::<_, Option<String>>(5)?,
        ))
      },
    )
    .optional()
    .map_err(|e| e.to_string())?;

  let Some((user_id, email, password_hash, name, role, school)) = row else {
    return Ok(json!({"success": false, "error": "User not found"}));
  };

  let valid = bcrypt::verify(password, &password_hash).map_err(|e| e.to_string())?;
  if !valid {
    return Ok(json!({"success": false, "error": "Invalid credentials"}));
  }

  let token = uuid::Uuid::new_v4().to_string();
  let expires_at = now_ms() + 7 * 24 * 60 * 60 * 1000;
  conn.execute(
    "INSERT INTO offline_sessions (token, user_id, expires_at) VALUES (?1, ?2, ?3)",
    params![token, user_id, expires_at],
  )
  .map_err(|e| e.to_string())?;

  Ok(json!({
    "success": true,
    "token": token,
    "user": {
      "id": user_id,
      "email": email,
      "name": name,
      "role": role,
      "school": school
    }
  }))
}

fn auth_validate_offline_session(state: State<'_, AppState>, args: Value) -> Result<Value, String> {
  let token = args.as_str().ok_or("missing token")?;
  let conn = state.db.lock().map_err(|_| "db lock")?;

  let session = conn
    .query_row(
      "SELECT user_id, expires_at FROM offline_sessions WHERE token = ?1",
      params![token],
      |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
    )
    .optional()
    .map_err(|e| e.to_string())?;

  let Some((user_id, expires_at)) = session else {
    return Ok(json!({"success": false, "error": "Invalid session"}));
  };

  if now_ms() > expires_at {
    conn.execute("DELETE FROM offline_sessions WHERE token = ?1", params![token])
      .map_err(|e| e.to_string())?;
    return Ok(json!({"success": false, "error": "Session expired"}));
  }

  let user = conn
    .query_row(
      "SELECT id, email, name, role, school FROM offline_users WHERE id = ?1",
      params![user_id],
      |row| {
        Ok(json!({
          "id": row.get::<_, i64>(0)?,
          "email": row.get::<_, String>(1)?,
          "name": row.get::<_, String>(2)?,
          "role": row.get::<_, String>(3)?,
          "school": row.get::<_, Option<String>>(4)?
        }))
      },
    )
    .optional()
    .map_err(|e| e.to_string())?;

  Ok(json!({"success": true, "user": user}))
}
fn auth_sync_users(state: State<'_, AppState>, args: Value) -> Result<Value, String> {
  let users = args.as_array().ok_or("missing users")?;
  let conn = state.db.lock().map_err(|_| "db lock")?;

  for user in users {
    let email = user.get("email").and_then(|v| v.as_str()).unwrap_or("");
    if email.is_empty() {
      continue;
    }
    let password_hash = user.get("hashed_password").and_then(|v| v.as_str()).unwrap_or("");
    let role = user.get("role").and_then(|v| v.as_str()).unwrap_or("USER");
    let name = email.split('@').next().unwrap_or("User");

    conn.execute(
      "INSERT INTO offline_users (email, password_hash, name, role, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, role = excluded.role",
      params![email, password_hash, name, role, now_ms()],
    )
    .map_err(|e| e.to_string())?;
  }

  Ok(json!({"success": true}))
}

fn auth_get_offline_users(state: State<'_, AppState>) -> Result<Value, String> {
  let conn = state.db.lock().map_err(|_| "db lock")?;
  let mut stmt = conn
    .prepare(
      "SELECT id, email, name, role, school, grade, class_name, classroom, workplace, job_title, admin_duties, extension_number, phone_number, profile_completed FROM offline_users",
    )
    .map_err(|e| e.to_string())?;

  let users = stmt
    .query_map([], |row| {
      Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "email": row.get::<_, String>(1)?,
        "name": row.get::<_, String>(2)?,
        "role": row.get::<_, String>(3)?,
        "school": row.get::<_, Option<String>>(4)?,
        "grade": row.get::<_, Option<String>>(5)?,
        "class": row.get::<_, Option<String>>(6)?,
        "classroom": row.get::<_, Option<String>>(7)?,
        "workplace": row.get::<_, Option<String>>(8)?,
        "job_title": row.get::<_, Option<String>>(9)?,
        "admin_duties": row.get::<_, Option<String>>(10)?,
        "extension_number": row.get::<_, Option<String>>(11)?,
        "phone_number": row.get::<_, Option<String>>(12)?,
        "profile_completed": row.get::<_, Option<i64>>(13)?.unwrap_or(0) == 1
      }))
    })
    .map_err(|e| e.to_string())?;

  let mut result = Vec::new();
  for user in users {
    result.push(user.map_err(|e| e.to_string())?);
  }

  Ok(json!({"success": true, "users": result}))
}

fn auth_seed_demo_data(state: State<'_, AppState>) -> Result<Value, String> {
  let conn = state.db.lock().map_err(|_| "db lock")?;
  let count: i64 = conn
    .query_row("SELECT COUNT(*) FROM offline_users", [], |row| row.get(0))
    .unwrap_or(0);
  if count > 0 {
    return Ok(json!({"success": true}));
  }

  let demo_users = vec![
    ("teacher@offline.com", "password123", "Offline Teacher", "TEACHER"),
    ("admin@offline.com", "password123", "Offline Admin", "ADMIN"),
  ];

  for (email, password, name, role) in demo_users {
    let password_hash = bcrypt::hash(password, 10).map_err(|e| e.to_string())?;
    conn.execute(
      "INSERT INTO offline_users (email, password_hash, name, role, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
      params![email, password_hash, name, role, now_ms()],
    )
    .map_err(|e| e.to_string())?;
  }

  Ok(json!({"success": true}))
}

fn auth_update_user_profile(state: State<'_, AppState>, args: Value) -> Result<Value, String> {
  let conn = state.db.lock().map_err(|_| "db lock")?;

  // 현재 로그인된 사용자의 ID 가져오기 (args에 userId가 없으면 저장된 인증에서)
  // ID는 정수 또는 문자열일 수 있음
  let user_id_str: String = if let Some(id) = args.get("userId") {
    if let Some(i) = id.as_i64() {
      i.to_string()
    } else if let Some(s) = id.as_str() {
      s.to_string()
    } else {
      return Ok(json!({"success": false, "error": "Invalid userId format"}));
    }
  } else {
    // 저장된 인증에서 사용자 ID 가져오기
    let auth_data = read_auth(&conn);
    if let Some((_, user, _)) = auth_data {
      if let Some(id) = user.get("id") {
        if let Some(i) = id.as_i64() {
          i.to_string()
        } else if let Some(s) = id.as_str() {
          s.to_string()
        } else {
          return Ok(json!({"success": false, "error": "Invalid stored user id format"}));
        }
      } else {
        return Ok(json!({"success": false, "error": "No user id in stored auth"}));
      }
    } else {
      return Ok(json!({"success": false, "error": "No authenticated user found"}));
    }
  };

  // 문자열 ID를 정수로 변환 시도 (offline_users 테이블은 INTEGER id)
  let user_id: i64 = user_id_str.parse().unwrap_or_else(|_| {
    // 문자열 ID인 경우 (예: dev-teacher-1), 해당 email로 사용자 찾기
    -1
  });

  // grade는 숫자 또는 문자열로 올 수 있음
  let grade: Option<i64> = args.get("grade").and_then(|v| {
    v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))
  });

  // 개발 모드 자동 로그인 사용자 (문자열 ID)인 경우 auth_store만 업데이트
  if user_id == -1 {
    // auth_store에서 현재 사용자 정보 가져와서 프로필 정보 추가 후 다시 저장
    if let Some((token, mut user, expires_at)) = read_auth(&conn) {
      // 프로필 정보 업데이트
      if let Some(g) = grade {
        user["grade"] = json!(g);
      }
      if let Some(v) = args.get("class").and_then(|v| v.as_str()) {
        user["class"] = json!(v);
      }
      if let Some(v) = args.get("classroom").and_then(|v| v.as_str()) {
        user["classroom"] = json!(v);
      }
      if let Some(v) = args.get("workplace").and_then(|v| v.as_str()) {
        user["workplace"] = json!(v);
      }
      if let Some(v) = args.get("jobTitle").and_then(|v| v.as_str()) {
        user["jobTitle"] = json!(v);
      }
      if let Some(v) = args.get("adminDuties").and_then(|v| v.as_str()) {
        user["adminDuties"] = json!(v);
      }
      if let Some(v) = args.get("extensionNumber").and_then(|v| v.as_str()) {
        user["extensionNumber"] = json!(v);
      }
      if let Some(v) = args.get("phoneNumber").and_then(|v| v.as_str()) {
        user["phoneNumber"] = json!(v);
      }
      user["profileCompleted"] = json!(args.get("profileCompleted").and_then(|v| v.as_bool()).unwrap_or(true));

      write_auth(&conn, &token, &user, expires_at)?;
      return Ok(json!({"success": true, "user": user}));
    } else {
      return Ok(json!({"success": false, "error": "No authenticated user found"}));
    }
  }

  // 정수 ID인 경우 offline_users 테이블 업데이트
  conn.execute(
    "UPDATE offline_users SET grade = ?1, class_name = ?2, classroom = ?3, workplace = ?4, job_title = ?5, admin_duties = ?6, extension_number = ?7, phone_number = ?8, profile_completed = ?9 WHERE id = ?10",
    params![
      grade,
      args.get("class").and_then(|v| v.as_str()),
      args.get("classroom").and_then(|v| v.as_str()),
      args.get("workplace").and_then(|v| v.as_str()),
      args.get("jobTitle").and_then(|v| v.as_str()),
      args.get("adminDuties").and_then(|v| v.as_str()),
      args.get("extensionNumber").and_then(|v| v.as_str()),
      args.get("phoneNumber").and_then(|v| v.as_str()),
      args.get("profileCompleted").and_then(|v| v.as_bool()).unwrap_or(false) as i64,
      user_id
    ],
  )
  .map_err(|e| e.to_string())?;

  // auth_store도 업데이트
  if let Some((token, mut user, expires_at)) = read_auth(&conn) {
    if let Some(g) = grade {
      user["grade"] = json!(g);
    }
    if let Some(v) = args.get("class").and_then(|v| v.as_str()) {
      user["class"] = json!(v);
    }
    if let Some(v) = args.get("classroom").and_then(|v| v.as_str()) {
      user["classroom"] = json!(v);
    }
    if let Some(v) = args.get("workplace").and_then(|v| v.as_str()) {
      user["workplace"] = json!(v);
    }
    if let Some(v) = args.get("jobTitle").and_then(|v| v.as_str()) {
      user["jobTitle"] = json!(v);
    }
    if let Some(v) = args.get("adminDuties").and_then(|v| v.as_str()) {
      user["adminDuties"] = json!(v);
    }
    if let Some(v) = args.get("extensionNumber").and_then(|v| v.as_str()) {
      user["extensionNumber"] = json!(v);
    }
    if let Some(v) = args.get("phoneNumber").and_then(|v| v.as_str()) {
      user["phoneNumber"] = json!(v);
    }
    user["profileCompleted"] = json!(args.get("profileCompleted").and_then(|v| v.as_bool()).unwrap_or(true));

    write_auth(&conn, &token, &user, expires_at)?;
    return Ok(json!({"success": true, "user": user}));
  }

  Ok(json!({"success": true}))
}

async fn auth_get_address_book(state: State<'_, AppState>, args: Value) -> Result<Value, String> {
  let token = args.as_str().map(|v| v.to_string()).or_else(|| {
    let conn = state.db.lock().ok()?;
    read_auth(&conn).map(|(token, _user, _)| token)
  });

  let Some(token) = token else {
    return Ok(json!({"success": false, "error": "No auth token", "contacts": []}));
  };

  let api_url = get_api_url();
  let client = reqwest::Client::new();
  let response = client
    .get(format!("{api_url}/api/school-admin/messenger?role=TEACHER&messengerEnabled=true&limit=1000"))
    .bearer_auth(token)
    .send()
    .await
    .map_err(|e| e.to_string())?;

  if !response.status().is_success() {
    return Ok(json!({"success": false, "error": "Failed to fetch address book", "contacts": []}));
  }

  let data: Value = response.json().await.map_err(|e| e.to_string())?;
  let contacts = data.get("users").cloned().unwrap_or(Value::Array(vec![]));
  Ok(json!({"success": true, "contacts": contacts}))
}

fn auth_auto_login(state: State<'_, AppState>, args: Value) -> Result<Value, String> {
  let user_type = args.as_str().unwrap_or("teacher");
  let user = match user_type {
    "student" => json!({"id": "dev-student-1", "email": "dev-student@demo.com", "name": "Dev Student", "role": "STUDENT"}),
    "admin" => json!({"id": "dev-admin-1", "email": "dev-admin@demo.com", "name": "Dev Admin", "role": "ADMIN"}),
    _ => json!({"id": "dev-teacher-1", "email": "dev-teacher@demo.com", "name": "Dev Teacher", "role": "TEACHER"}),
  };

  let token = format!("dev-token-{}", now_ms());
  let expires_at = now_ms() + 7 * 24 * 60 * 60 * 1000; // 7 days

  // Save to auth_store
  let conn = state.db.lock().map_err(|_| "db lock")?;
  write_auth(&conn, &token, &user, expires_at)?;

  Ok(json!({"success": true, "token": token, "user": user}))
}
fn address_book_init(_state: State<'_, AppState>) -> Result<Value, String> {
  Ok(json!({"success": true}))
}

fn address_book_save_entry(state: State<'_, AppState>, args: Value) -> Result<Value, String> {
  let conn = state.db.lock().map_err(|_| "db lock")?;
  conn.execute(
    "INSERT INTO address_book (user_id, name, email, phone, role, school_id, ip_address, hostname, os, platform, last_seen, is_online, synced, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
    params![
      args.get("userId").and_then(|v| v.as_str()).or_else(|| args.get("id").and_then(|v| v.as_str())),
      args.get("name").and_then(|v| v.as_str()),
      args.get("email").and_then(|v| v.as_str()),
      args.get("phone").and_then(|v| v.as_str()),
      args.get("role").and_then(|v| v.as_str()),
      args.get("schoolId").and_then(|v| v.as_str()),
      args.get("ipAddress").and_then(|v| v.as_str()),
      args.get("hostname").and_then(|v| v.as_str()),
      args.get("os").and_then(|v| v.as_str()),
      args.get("platform").and_then(|v| v.as_str()),
      args.get("lastSeen").and_then(|v| v.as_str()),
      args.get("isOnline").and_then(|v| v.as_bool()).unwrap_or(false) as i64,
      args.get("synced").and_then(|v| v.as_bool()).unwrap_or(false) as i64,
      args.get("createdAt").and_then(|v| v.as_str()),
      args.get("updatedAt").and_then(|v| v.as_str())
    ],
  )
  .map_err(|e| e.to_string())?;

  Ok(json!({"success": true}))
}

fn address_book_get_entry(state: State<'_, AppState>, args: Value) -> Result<Value, String> {
  let user_id = args.as_str().ok_or("missing userId")?;
  let conn = state.db.lock().map_err(|_| "db lock")?;
  let entry = conn
    .query_row(
      "SELECT user_id, name, email, phone, role, school_id, ip_address, hostname, os, platform, last_seen, is_online, synced FROM address_book WHERE user_id = ?1",
      params![user_id],
      |row| {
        Ok(json!({
          "userId": row.get::<_, Option<String>>(0)?,
          "name": row.get::<_, Option<String>>(1)?,
          "email": row.get::<_, Option<String>>(2)?,
          "phone": row.get::<_, Option<String>>(3)?,
          "role": row.get::<_, Option<String>>(4)?,
          "schoolId": row.get::<_, Option<String>>(5)?,
          "ipAddress": row.get::<_, Option<String>>(6)?,
          "hostname": row.get::<_, Option<String>>(7)?,
          "os": row.get::<_, Option<String>>(8)?,
          "platform": row.get::<_, Option<String>>(9)?,
          "lastSeen": row.get::<_, Option<String>>(10)?,
          "isOnline": row.get::<_, Option<i64>>(11)?.unwrap_or(0) == 1,
          "synced": row.get::<_, Option<i64>>(12)?.unwrap_or(0) == 1
        }))
      },
    )
    .optional()
    .map_err(|e| e.to_string())?;

  Ok(json!({"success": true, "data": entry}))
}

fn address_book_get_all(state: State<'_, AppState>) -> Result<Value, String> {
  let conn = state.db.lock().map_err(|_| "db lock")?;
  let mut stmt = conn
    .prepare(
      "SELECT user_id, name, email, phone, role, school_id, ip_address, hostname, os, platform, last_seen, is_online, synced FROM address_book",
    )
    .map_err(|e| e.to_string())?;

  let rows = stmt
    .query_map([], |row| {
      Ok(json!({
        "userId": row.get::<_, Option<String>>(0)?,
        "name": row.get::<_, Option<String>>(1)?,
        "email": row.get::<_, Option<String>>(2)?,
        "phone": row.get::<_, Option<String>>(3)?,
        "role": row.get::<_, Option<String>>(4)?,
        "schoolId": row.get::<_, Option<String>>(5)?,
        "ipAddress": row.get::<_, Option<String>>(6)?,
        "hostname": row.get::<_, Option<String>>(7)?,
        "os": row.get::<_, Option<String>>(8)?,
        "platform": row.get::<_, Option<String>>(9)?,
        "lastSeen": row.get::<_, Option<String>>(10)?,
        "isOnline": row.get::<_, Option<i64>>(11)?.unwrap_or(0) == 1,
        "synced": row.get::<_, Option<i64>>(12)?.unwrap_or(0) == 1
      }))
    })
    .map_err(|e| e.to_string())?;

  let mut entries = Vec::new();
  for row in rows {
    entries.push(row.map_err(|e| e.to_string())?);
  }

  Ok(json!({"success": true, "data": entries}))
}

fn address_book_get_by_role(state: State<'_, AppState>, args: Value) -> Result<Value, String> {
  let role = args.as_str().ok_or("missing role")?;
  let conn = state.db.lock().map_err(|_| "db lock")?;
  let mut stmt = conn
    .prepare(
      "SELECT user_id, name, email, phone, role, school_id, ip_address, hostname, os, platform, last_seen, is_online, synced FROM address_book WHERE role = ?1",
    )
    .map_err(|e| e.to_string())?;

  let rows = stmt
    .query_map(params![role], |row| {
      Ok(json!({
        "userId": row.get::<_, Option<String>>(0)?,
        "name": row.get::<_, Option<String>>(1)?,
        "email": row.get::<_, Option<String>>(2)?,
        "phone": row.get::<_, Option<String>>(3)?,
        "role": row.get::<_, Option<String>>(4)?,
        "schoolId": row.get::<_, Option<String>>(5)?,
        "ipAddress": row.get::<_, Option<String>>(6)?,
        "hostname": row.get::<_, Option<String>>(7)?,
        "os": row.get::<_, Option<String>>(8)?,
        "platform": row.get::<_, Option<String>>(9)?,
        "lastSeen": row.get::<_, Option<String>>(10)?,
        "isOnline": row.get::<_, Option<i64>>(11)?.unwrap_or(0) == 1,
        "synced": row.get::<_, Option<i64>>(12)?.unwrap_or(0) == 1
      }))
    })
    .map_err(|e| e.to_string())?;

  let mut entries = Vec::new();
  for row in rows {
    entries.push(row.map_err(|e| e.to_string())?);
  }

  Ok(json!({"success": true, "data": entries}))
}

fn address_book_get_online(state: State<'_, AppState>) -> Result<Value, String> {
  let conn = state.db.lock().map_err(|_| "db lock")?;
  let mut stmt = conn
    .prepare(
      "SELECT user_id, name, email, phone, role, school_id, ip_address, hostname, os, platform, last_seen, is_online, synced FROM address_book WHERE is_online = 1",
    )
    .map_err(|e| e.to_string())?;

  let rows = stmt
    .query_map([], |row| {
      Ok(json!({
        "userId": row.get::<_, Option<String>>(0)?,
        "name": row.get::<_, Option<String>>(1)?,
        "email": row.get::<_, Option<String>>(2)?,
        "phone": row.get::<_, Option<String>>(3)?,
        "role": row.get::<_, Option<String>>(4)?,
        "schoolId": row.get::<_, Option<String>>(5)?,
        "ipAddress": row.get::<_, Option<String>>(6)?,
        "hostname": row.get::<_, Option<String>>(7)?,
        "os": row.get::<_, Option<String>>(8)?,
        "platform": row.get::<_, Option<String>>(9)?,
        "lastSeen": row.get::<_, Option<String>>(10)?,
        "isOnline": true,
        "synced": row.get::<_, Option<i64>>(12)?.unwrap_or(0) == 1
      }))
    })
    .map_err(|e| e.to_string())?;

  let mut entries = Vec::new();
  for row in rows {
    entries.push(row.map_err(|e| e.to_string())?);
  }

  Ok(json!({"success": true, "data": entries}))
}

fn address_book_delete(state: State<'_, AppState>, args: Value) -> Result<Value, String> {
  let user_id = args.as_str().ok_or("missing userId")?;
  let conn = state.db.lock().map_err(|_| "db lock")?;
  conn
    .execute("DELETE FROM address_book WHERE user_id = ?1", params![user_id])
    .map_err(|e| e.to_string())?;
  Ok(json!({"success": true}))
}

fn address_book_get_unsynced(state: State<'_, AppState>) -> Result<Value, String> {
  let conn = state.db.lock().map_err(|_| "db lock")?;
  let mut stmt = conn
    .prepare(
      "SELECT user_id, name, email, phone, role, school_id, ip_address, hostname, os, platform, last_seen, is_online, synced FROM address_book WHERE synced = 0",
    )
    .map_err(|e| e.to_string())?;

  let rows = stmt
    .query_map([], |row| {
      Ok(json!({
        "userId": row.get::<_, Option<String>>(0)?,
        "name": row.get::<_, Option<String>>(1)?,
        "email": row.get::<_, Option<String>>(2)?,
        "phone": row.get::<_, Option<String>>(3)?,
        "role": row.get::<_, Option<String>>(4)?,
        "schoolId": row.get::<_, Option<String>>(5)?,
        "ipAddress": row.get::<_, Option<String>>(6)?,
        "hostname": row.get::<_, Option<String>>(7)?,
        "os": row.get::<_, Option<String>>(8)?,
        "platform": row.get::<_, Option<String>>(9)?,
        "lastSeen": row.get::<_, Option<String>>(10)?,
        "isOnline": row.get::<_, Option<i64>>(11)?.unwrap_or(0) == 1,
        "synced": false
      }))
    })
    .map_err(|e| e.to_string())?;

  let mut entries = Vec::new();
  for row in rows {
    entries.push(row.map_err(|e| e.to_string())?);
  }

  Ok(json!({"success": true, "data": entries}))
}

fn address_book_mark_synced(state: State<'_, AppState>, args: Value) -> Result<Value, String> {
  let user_id = args.get("userId").and_then(|v| v.as_str()).ok_or("missing userId")?;
  let synced = args.get("synced").and_then(|v| v.as_bool()).unwrap_or(true) as i64;
  let conn = state.db.lock().map_err(|_| "db lock")?;
  conn
    .execute("UPDATE address_book SET synced = ?1 WHERE user_id = ?2", params![synced, user_id])
    .map_err(|e| e.to_string())?;
  Ok(json!({"success": true}))
}

fn address_book_update_online_status(state: State<'_, AppState>, args: Value) -> Result<Value, String> {
  let user_id = args.get("userId").and_then(|v| v.as_str()).ok_or("missing userId")?;
  let is_online = args.get("isOnline").and_then(|v| v.as_bool()).unwrap_or(false) as i64;
  let last_seen = args.get("lastSeen").and_then(|v| v.as_str());
  let conn = state.db.lock().map_err(|_| "db lock")?;
  conn
    .execute(
      "UPDATE address_book SET is_online = ?1, last_seen = ?2 WHERE user_id = ?3",
      params![is_online, last_seen, user_id],
    )
    .map_err(|e| e.to_string())?;
  Ok(json!({"success": true}))
}

fn address_book_sync_with_server(state: State<'_, AppState>, args: Value) -> Result<Value, String> {
  let entries = args.as_array().ok_or("missing serverData")?;
  let conn = state.db.lock().map_err(|_| "db lock")?;

  let mut synced = 0;
  let mut failed = 0;

  for entry in entries {
    let user_id = entry.get("userId").and_then(|v| v.as_str()).unwrap_or("");
    let name = entry.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let email = entry.get("email").and_then(|v| v.as_str()).unwrap_or("");
    let role = entry.get("role").and_then(|v| v.as_str()).unwrap_or("");

    let result = conn.execute(
      "INSERT INTO address_book (user_id, name, email, phone, role, school_id, ip_address, hostname, os, platform, last_seen, is_online, synced, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 1, ?13, ?14)
       ON CONFLICT(user_id) DO UPDATE SET name = excluded.name, email = excluded.email, role = excluded.role, synced = 1",
      params![
        user_id,
        name,
        email,
        entry.get("phone").and_then(|v| v.as_str()),
        role,
        entry.get("schoolId").and_then(|v| v.as_str()),
        entry.get("ipAddress").and_then(|v| v.as_str()),
        entry.get("hostname").and_then(|v| v.as_str()),
        entry.get("os").and_then(|v| v.as_str()),
        entry.get("platform").and_then(|v| v.as_str()),
        entry.get("lastSeen").and_then(|v| v.as_str()),
        entry.get("isOnline").and_then(|v| v.as_bool()).unwrap_or(false) as i64,
        entry.get("createdAt").and_then(|v| v.as_str()),
        entry.get("updatedAt").and_then(|v| v.as_str())
      ],
    );

    if result.is_ok() { synced += 1; } else { failed += 1; }
  }

  Ok(json!({"success": true, "data": {"syncedCount": synced, "failedCount": failed}}))
}

fn address_book_get_stats(state: State<'_, AppState>) -> Result<Value, String> {
  let conn = state.db.lock().map_err(|_| "db lock")?;
  let total: i64 = conn.query_row("SELECT COUNT(*) FROM address_book", [], |row| row.get(0)).unwrap_or(0);
  let online: i64 = conn.query_row("SELECT COUNT(*) FROM address_book WHERE is_online = 1", [], |row| row.get(0)).unwrap_or(0);
  let synced: i64 = conn.query_row("SELECT COUNT(*) FROM address_book WHERE synced = 1", [], |row| row.get(0)).unwrap_or(0);
  Ok(json!({"success": true, "data": {"totalDevices": total, "onlineDevices": online, "syncedDevices": synced}}))
}
async fn messaging_send(state: State<'_, AppState>, args: Value) -> Result<Value, String> {
  let token = {
    let conn = state.db.lock().map_err(|_| "db lock")?;
    read_auth(&conn).map(|(token, _user, _)| token)
  };

  let Some(token) = token else {
    return Ok(json!({"success": false, "error": "No auth token"}));
  };

  let api_url = get_api_url();
  let client = reqwest::Client::new();
  let response = client
    .post(format!("{api_url}/api/messaging/send"))
    .bearer_auth(token)
    .json(&args)
    .send()
    .await
    .map_err(|e| e.to_string())?;

  if !response.status().is_success() {
    return Ok(json!({"success": false, "error": "API error"}));
  }

  let result: Value = response.json().await.unwrap_or(json!({"success": true}));
  Ok(json!({"success": true, "networkType": "api", "result": result}))
}

fn messaging_save_offline(state: State<'_, AppState>, args: Value) -> Result<Value, String> {
  let conn = state.db.lock().map_err(|_| "db lock")?;
  let is_read = args.get("isRead").and_then(|v| v.as_bool()).unwrap_or(false) as i64;
  let delivered = args.get("delivered").and_then(|v| v.as_bool()).unwrap_or(false) as i64;

  conn.execute(
    "INSERT INTO messages (message_id, sender_id, recipient_id, content, message_type, timestamp, is_read, delivered, delivered_at, read_at, synced)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0)",
    params![
      args.get("messageId").and_then(|v| v.as_str()),
      args.get("senderId").and_then(|v| v.as_str()),
      args.get("recipientId").and_then(|v| v.as_str()),
      args.get("content").and_then(|v| v.as_str()),
      args.get("type").and_then(|v| v.as_str()).unwrap_or("text"),
      args.get("timestamp").and_then(|v| v.as_str()).unwrap_or_else(|| ""),
      is_read,
      delivered,
      args.get("deliveredAt").and_then(|v| v.as_str()),
      args.get("readAt").and_then(|v| v.as_str())
    ],
  )
  .map_err(|e| e.to_string())?;

  Ok(json!({"success": true}))
}

fn messaging_get_offline(state: State<'_, AppState>, args: Value) -> Result<Value, String> {
  let user_id = args.get("userId").and_then(|v| v.as_str()).ok_or("missing userId")?;
  let other_user_id = args.get("otherUserId").and_then(|v| v.as_str());

  let conn = state.db.lock().map_err(|_| "db lock")?;

  let map_row = |row: &rusqlite::Row| -> rusqlite::Result<Value> {
    Ok(json!({
      "id": row.get::<_, i64>(0)?,
      "messageId": row.get::<_, Option<String>>(1)?,
      "senderId": row.get::<_, Option<String>>(2)?,
      "recipientId": row.get::<_, Option<String>>(3)?,
      "content": row.get::<_, Option<String>>(4)?,
      "messageType": row.get::<_, Option<String>>(5)?,
      "timestamp": row.get::<_, Option<String>>(6)?,
      "isRead": row.get::<_, Option<i64>>(7)?.unwrap_or(0) == 1,
      "delivered": row.get::<_, Option<i64>>(8)?.unwrap_or(0) == 1,
      "readAt": row.get::<_, Option<String>>(9)?,
      "deliveredAt": row.get::<_, Option<String>>(10)?
    }))
  };

  let mut messages = Vec::new();

  if let Some(other) = other_user_id {
    let mut stmt = conn.prepare(
      "SELECT id, message_id, sender_id, recipient_id, content, message_type, timestamp, is_read, delivered, read_at, delivered_at FROM messages
       WHERE (sender_id = ?1 AND recipient_id = ?2) OR (sender_id = ?2 AND recipient_id = ?1)
       ORDER BY timestamp DESC",
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![user_id, other], map_row).map_err(|e| e.to_string())?;
    for row in rows {
      messages.push(row.map_err(|e| e.to_string())?);
    }
  } else {
    let mut stmt = conn.prepare(
      "SELECT id, message_id, sender_id, recipient_id, content, message_type, timestamp, is_read, delivered, read_at, delivered_at FROM messages
       WHERE sender_id = ?1 OR recipient_id = ?1
       ORDER BY timestamp DESC",
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![user_id], map_row).map_err(|e| e.to_string())?;
    for row in rows {
      messages.push(row.map_err(|e| e.to_string())?);
    }
  }

  Ok(json!({"success": true, "messages": messages}))
}

fn messaging_get_unread(state: State<'_, AppState>, args: Value) -> Result<Value, String> {
  let user_id = args.as_str().ok_or("missing userId")?;
  let conn = state.db.lock().map_err(|_| "db lock")?;
  let mut stmt = conn
    .prepare(
      "SELECT id, message_id, sender_id, recipient_id, content, message_type, timestamp FROM messages WHERE recipient_id = ?1 AND is_read = 0",
    )
    .map_err(|e| e.to_string())?;

  let rows = stmt
    .query_map(params![user_id], |row| {
      Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "messageId": row.get::<_, Option<String>>(1)?,
        "senderId": row.get::<_, Option<String>>(2)?,
        "recipientId": row.get::<_, Option<String>>(3)?,
        "content": row.get::<_, Option<String>>(4)?,
        "type": row.get::<_, Option<String>>(5)?,
        "timestamp": row.get::<_, Option<String>>(6)?
      }))
    })
    .map_err(|e| e.to_string())?;

  let mut messages = Vec::new();
  for row in rows {
    messages.push(row.map_err(|e| e.to_string())?);
  }

  Ok(json!({"success": true, "messages": messages}))
}

fn messaging_mark_read(state: State<'_, AppState>, args: Value) -> Result<Value, String> {
  let conn = state.db.lock().map_err(|_| "db lock")?;
  let read_at = chrono::Utc::now().to_rfc3339();

  if let Some(message_id) = args.as_i64() {
    conn
      .execute("UPDATE messages SET is_read = 1, read_at = ?2 WHERE id = ?1", params![message_id, read_at])
      .map_err(|e| e.to_string())?;
    return Ok(json!({"success": true}));
  }

  if let Some(message_id) = args.as_str() {
    conn
      .execute(
        "UPDATE messages SET is_read = 1, read_at = ?2 WHERE message_id = ?1",
        params![message_id, read_at],
      )
      .map_err(|e| e.to_string())?;
    return Ok(json!({"success": true}));
  }

  Err("missing messageId".to_string())
}


fn messaging_mark_synced(state: State<'_, AppState>, args: Value) -> Result<Value, String> {
  let message_ids = args.as_array().ok_or("missing messageIds")?;
  let conn = state.db.lock().map_err(|_| "db lock")?;

  for item in message_ids {
    if let Some(id) = item.as_i64() {
      let _ = conn.execute("UPDATE messages SET synced = 1 WHERE id = ?1", params![id]);
      continue;
    }
    if let Some(id) = item.as_str() {
      let _ = conn.execute("UPDATE messages SET synced = 1 WHERE message_id = ?1", params![id]);
    }
  }

  Ok(json!({"success": true}))
}

fn messaging_get_unsynced(state: State<'_, AppState>) -> Result<Value, String> {
  let conn = state.db.lock().map_err(|_| "db lock")?;
  let mut stmt = conn
    .prepare(
      "SELECT id, sender_id, recipient_id, content, message_type, timestamp FROM messages WHERE synced = 0",
    )
    .map_err(|e| e.to_string())?;

  let rows = stmt
    .query_map([], |row| {
      Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "senderId": row.get::<_, Option<String>>(1)?,
        "recipientId": row.get::<_, Option<String>>(2)?,
        "content": row.get::<_, Option<String>>(3)?,
        "type": row.get::<_, Option<String>>(4)?,
        "timestamp": row.get::<_, Option<String>>(5)?
      }))
    })
    .map_err(|e| e.to_string())?;

  let mut messages = Vec::new();
  for row in rows {
    messages.push(row.map_err(|e| e.to_string())?);
  }

  Ok(json!({"success": true, "messages": messages}))
}
fn get_app_version(app: AppHandle) -> Result<Value, String> {
  Ok(json!(app.package_info().version.to_string()))
}

fn get_device_info() -> Result<Value, String> {
  let hostname = hostname::get().ok().and_then(|h| h.into_string().ok());
  let ip_address = local_ip_address::local_ip().ok().map(|ip| ip.to_string());
  let mac_address = mac_address::get_mac_address().ok().flatten().map(|mac| mac.to_string());
  Ok(json!({
    "macAddress": mac_address.unwrap_or_default(),
    "ipAddress": ip_address.unwrap_or_default(),
    "hostname": hostname.unwrap_or_default()
  }))
}

fn check_database_connection(state: State<'_, AppState>) -> Result<Value, String> {
  let _conn = state.db.lock().map_err(|_| "db lock")?;
  Ok(json!({"success": true}))
}

async fn check_internal_network_ip() -> Result<Value, String> {
  let api_url = get_api_url();
  let ok = reqwest::get(format!("{api_url}/api/health")).await.map(|r| r.status().is_success()).unwrap_or(false);
  let ip = local_ip_address::local_ip().ok().map(|ip| ip.to_string()).unwrap_or_default();
  Ok(json!({"isInternal": ok, "detectedIPs": [ip]}))
}

async fn check_network_status() -> Result<Value, String> {
  let api_url = get_api_url();
  let ok = reqwest::get(format!("{api_url}/api/health")).await.map(|r| r.status().is_success()).unwrap_or(false);
  Ok(json!({"online": ok, "internal": ok, "offline": !ok}))
}

fn show_notification(app: AppHandle, args: Value) -> Result<Value, String> {
  let title = args.get("title").and_then(|v| v.as_str()).unwrap_or("");
  let body = args.get("body").and_then(|v| v.as_str()).unwrap_or("");
  app
    .notification()
    .builder()
    .title(title)
    .body(body)
    .show()
    .map_err(|e| e.to_string())?;
  Ok(json!({"success": true}))
}

fn update_badge_count(_app: AppHandle, _args: Value) -> Result<Value, String> {
  Ok(json!({"success": true}))
}

fn window_minimize(app: AppHandle) -> Result<Value, String> {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.minimize();
  }
  Ok(json!({"success": true}))
}

fn window_maximize(app: AppHandle) -> Result<Value, String> {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.maximize();
  }
  Ok(json!({"success": true}))
}

fn window_close(app: AppHandle) -> Result<Value, String> {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.close();
  }
  Ok(json!({"success": true}))
}

fn window_toggle_devtools(app: AppHandle) -> Result<Value, String> {
  if let Some(window) = app.get_webview_window("main") {
    window.open_devtools();
  }
  Ok(json!({"success": true}))
}

fn device_get_info(state: State<'_, AppState>) -> Result<Value, String> {
  let info = get_device_info()?;
  let conn = state.db.lock().map_err(|_| "db lock")?;
  conn.execute(
    "INSERT INTO device_info (device_id, hostname, ip_address, mac_address, os, platform, installed_at, last_seen, synced)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0)
     ON CONFLICT(device_id) DO UPDATE SET last_seen = excluded.last_seen",
    params![
      format!("device-{}", now_ms()),
      info.get("hostname").and_then(|v| v.as_str()),
      info.get("ipAddress").and_then(|v| v.as_str()),
      info.get("macAddress").and_then(|v| v.as_str()),
      std::env::consts::OS,
      std::env::consts::OS,
      chrono::Utc::now().to_rfc3339(),
      chrono::Utc::now().to_rfc3339()
    ],
  )
  .map_err(|e| e.to_string())?;

  Ok(json!({"success": true, "device": info}))
}

fn device_get_local_devices(state: State<'_, AppState>) -> Result<Value, String> {
  let conn = state.db.lock().map_err(|_| "db lock")?;
  let mut stmt = conn
    .prepare(
      "SELECT device_id, hostname, ip_address, mac_address, os, platform, installed_at, last_seen, synced FROM device_info",
    )
    .map_err(|e| e.to_string())?;

  let rows = stmt
    .query_map([], |row| {
      Ok(json!({
        "id": row.get::<_, Option<String>>(0)?,
        "hostname": row.get::<_, Option<String>>(1)?,
        "ipAddress": row.get::<_, Option<String>>(2)?,
        "macAddress": row.get::<_, Option<String>>(3)?,
        "os": row.get::<_, Option<String>>(4)?,
        "platform": row.get::<_, Option<String>>(5)?,
        "installedAt": row.get::<_, Option<String>>(6)?,
        "lastSeen": row.get::<_, Option<String>>(7)?,
        "synced": row.get::<_, Option<i64>>(8)?.unwrap_or(0) == 1
      }))
    })
    .map_err(|e| e.to_string())?;

  let mut devices = Vec::new();
  for row in rows {
    devices.push(row.map_err(|e| e.to_string())?);
  }

  Ok(json!({"success": true, "devices": devices}))
}
fn error_images_save(state: State<'_, AppState>, args: Value) -> Result<Value, String> {
  let session_id = args.get("sessionId").and_then(|v| v.as_str()).ok_or("missing sessionId")?;
  let file_name = args.get("fileName").and_then(|v| v.as_str()).ok_or("missing fileName")?;
  let file_data = args.get("fileData").and_then(|v| v.as_str()).ok_or("missing fileData")?;
  let mime_type = args.get("mimeType").and_then(|v| v.as_str()).unwrap_or("application/octet-stream");

  let data = base64::decode(file_data).map_err(|e| e.to_string())?;
  let conn = state.db.lock().map_err(|_| "db lock")?;
  conn.execute(
    "INSERT INTO error_report_images (session_id, file_name, file_data, mime_type, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
    params![session_id, file_name, data, mime_type, chrono::Utc::now().to_rfc3339()],
  )
  .map_err(|e| e.to_string())?;

  Ok(json!({"success": true}))
}

fn error_images_get(state: State<'_, AppState>, args: Value) -> Result<Value, String> {
  let session_id = args.as_str().ok_or("missing sessionId")?;
  let conn = state.db.lock().map_err(|_| "db lock")?;
  let mut stmt = conn
    .prepare("SELECT file_name, file_data, mime_type FROM error_report_images WHERE session_id = ?1")
    .map_err(|e| e.to_string())?;

  let rows = stmt
    .query_map(params![session_id], |row| {
      let data: Vec<u8> = row.get(1)?;
      Ok(json!({
        "fileName": row.get::<_, String>(0)?,
        "fileData": base64::encode(data),
        "mimeType": row.get::<_, String>(2)?
      }))
    })
    .map_err(|e| e.to_string())?;

  let mut images = Vec::new();
  for row in rows {
    images.push(row.map_err(|e| e.to_string())?);
  }

  Ok(json!({"success": true, "images": images}))
}

fn error_images_delete(state: State<'_, AppState>, args: Value) -> Result<Value, String> {
  let session_id = args.as_str().ok_or("missing sessionId")?;
  let conn = state.db.lock().map_err(|_| "db lock")?;
  conn.execute("DELETE FROM error_report_images WHERE session_id = ?1", params![session_id])
    .map_err(|e| e.to_string())?;
  Ok(json!({"success": true}))
}

fn error_images_cleanup(state: State<'_, AppState>) -> Result<Value, String> {
  let conn = state.db.lock().map_err(|_| "db lock")?;
  conn.execute("DELETE FROM error_report_images", [])
    .map_err(|e| e.to_string())?;
  Ok(json!({"success": true}))
}

fn shared_folder_create(app: AppHandle, state: State<'_, AppState>, args: Value) -> Result<Value, String> {
  let name = args.get("name").and_then(|v| v.as_str()).ok_or("missing name")?;
  let base = app
    .path()
    .app_data_dir()
    .map_err(|e| e.to_string())?
    .join("shared");
  std::fs::create_dir_all(&base).map_err(|e| e.to_string())?;
  let folder_path = base.join(name);
  std::fs::create_dir_all(&folder_path).map_err(|e| e.to_string())?;

  let id = uuid::Uuid::new_v4().to_string();
  let conn = state.db.lock().map_err(|_| "db lock")?;
  conn.execute(
    "INSERT INTO shared_folders (id, name, path, encrypted, password, created_at) VALUES (?1, ?2, ?3, 0, NULL, ?4)",
    params![id, name, folder_path.to_string_lossy().to_string(), chrono::Utc::now().to_rfc3339()],
  )
  .map_err(|e| e.to_string())?;

  Ok(json!({"success": true, "folder": {"id": id, "name": name, "path": folder_path.to_string_lossy()}}))
}

fn shared_folder_list(state: State<'_, AppState>) -> Result<Value, String> {
  let conn = state.db.lock().map_err(|_| "db lock")?;
  let mut stmt = conn
    .prepare("SELECT id, name, path, encrypted, created_at FROM shared_folders ORDER BY created_at DESC")
    .map_err(|e| e.to_string())?;

  let rows = stmt
    .query_map([], |row| {
      Ok(json!({
        "id": row.get::<_, String>(0)?,
        "name": row.get::<_, String>(1)?,
        "path": row.get::<_, String>(2)?,
        "encrypted": row.get::<_, Option<i64>>(3)?.unwrap_or(0) == 1,
        "createdAt": row.get::<_, String>(4)?
      }))
    })
    .map_err(|e| e.to_string())?;

  let mut folders = Vec::new();
  for row in rows {
    folders.push(row.map_err(|e| e.to_string())?);
  }

  Ok(json!({"success": true, "folders": folders}))
}

fn shared_folder_contents(args: Value) -> Result<Value, String> {
  let folder_path = args.get("path").and_then(|v| v.as_str()).ok_or("missing path")?;
  let entries = std::fs::read_dir(folder_path).map_err(|e| e.to_string())?;
  let mut contents = Vec::new();
  for entry in entries {
    let entry = entry.map_err(|e| e.to_string())?;
    let metadata = entry.metadata().map_err(|e| e.to_string())?;
    contents.push(json!({
      "name": entry.file_name().to_string_lossy(),
      "type": if metadata.is_dir() {"directory"} else {"file"},
      "size": metadata.len(),
      "path": entry.path().to_string_lossy()
    }));
  }
  Ok(json!({"success": true, "contents": contents}))
}

fn shared_folder_add_file(args: Value) -> Result<Value, String> {
  let folder_path = args.get("path").and_then(|v| v.as_str()).ok_or("missing path")?;
  let file_path = args.get("filePath").and_then(|v| v.as_str()).ok_or("missing filePath")?;
  let file_name = std::path::Path::new(file_path)
    .file_name()
    .ok_or("invalid file name")?
    .to_string_lossy()
    .to_string();
  let dest_path = std::path::Path::new(folder_path).join(file_name);
  std::fs::copy(file_path, dest_path).map_err(|e| e.to_string())?;
  Ok(json!({"success": true}))
}

fn shared_folder_remove_file(args: Value) -> Result<Value, String> {
  let file_path = args.get("filePath").and_then(|v| v.as_str()).ok_or("missing filePath")?;
  std::fs::remove_file(file_path).map_err(|e| e.to_string())?;
  Ok(json!({"success": true}))
}

// ============================================
// Internal P2P IPC 핸들러
// ============================================

async fn internal_p2p_start(p2p: State<'_, P2PState>, args: Value) -> Result<Value, String> {
  let user_id = args.get("userId").and_then(|v| v.as_str()).ok_or("missing userId")?.to_string();
  let user_name = args.get("userName").and_then(|v| v.as_str()).unwrap_or("").to_string();
  let school_id = args.get("schoolId").and_then(|v| v.as_str()).map(|s| s.to_string());
  let discovery_port = args.get("discoveryPort").and_then(|v| v.as_u64()).unwrap_or(41235) as u16;
  p2p.internal.start(user_id, user_name, school_id, discovery_port).await
}

async fn internal_p2p_stop(p2p: State<'_, P2PState>) -> Result<Value, String> {
  p2p.internal.stop().await
}

async fn internal_p2p_status(p2p: State<'_, P2PState>) -> Result<Value, String> {
  Ok(p2p.internal.status().await)
}

async fn internal_p2p_get_peers(p2p: State<'_, P2PState>) -> Result<Value, String> {
  Ok(p2p.internal.get_peers().await)
}

async fn internal_p2p_send_message(p2p: State<'_, P2PState>, args: Value) -> Result<Value, String> {
  p2p.internal.send_message(args).await
}

fn internal_p2p_get_messages(state: State<'_, AppState>, args: Value) -> Result<Value, String> {
  let user_id = args.get("userId").and_then(|v| v.as_str()).ok_or("missing userId")?;
  let other_user_id = args.get("otherUserId").and_then(|v| v.as_str());
  let limit = args.get("limit").and_then(|v| v.as_i64()).unwrap_or(50);

  let conn = state.db.lock().map_err(|_| "db lock")?;

  let map_row = |row: &rusqlite::Row| -> rusqlite::Result<Value> {
    Ok(json!({
      "id": row.get::<_, i64>(0)?,
      "messageId": row.get::<_, Option<String>>(1)?,
      "senderId": row.get::<_, Option<String>>(2)?,
      "recipientId": row.get::<_, Option<String>>(3)?,
      "content": row.get::<_, Option<String>>(4)?,
      "type": row.get::<_, Option<String>>(5)?,
      "timestamp": row.get::<_, Option<String>>(6)?,
      "isRead": row.get::<_, Option<i64>>(7)?.unwrap_or(0) == 1,
      "delivered": row.get::<_, Option<i64>>(8)?.unwrap_or(0) == 1,
      "readAt": row.get::<_, Option<String>>(9)?,
      "deliveredAt": row.get::<_, Option<String>>(10)?,
      "networkType": row.get::<_, Option<String>>(11)?
    }))
  };

  let mut messages = Vec::new();

  if let Some(other) = other_user_id {
    let mut stmt = conn.prepare(
      "SELECT id, message_id, sender_id, recipient_id, content, message_type, timestamp, is_read, delivered, read_at, delivered_at, network_type FROM p2p_messages
       WHERE (sender_id = ?1 AND recipient_id = ?2) OR (sender_id = ?2 AND recipient_id = ?1)
       ORDER BY timestamp DESC LIMIT ?3",
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![user_id, other, limit], map_row).map_err(|e| e.to_string())?;
    for row in rows {
      messages.push(row.map_err(|e| e.to_string())?);
    }
  } else {
    let mut stmt = conn.prepare(
      "SELECT id, message_id, sender_id, recipient_id, content, message_type, timestamp, is_read, delivered, read_at, delivered_at, network_type FROM p2p_messages
       WHERE sender_id = ?1 OR recipient_id = ?1
       ORDER BY timestamp DESC LIMIT ?2",
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![user_id, limit], map_row).map_err(|e| e.to_string())?;
    for row in rows {
      messages.push(row.map_err(|e| e.to_string())?);
    }
  }

  Ok(json!({"success": true, "messages": messages}))
}

fn internal_p2p_get_unread_count(state: State<'_, AppState>, args: Value) -> Result<Value, String> {
  let user_id = args.get("userId").and_then(|v| v.as_str()).ok_or("missing userId")?;
  let other_user_id = args.get("otherUserId").and_then(|v| v.as_str());

  let conn = state.db.lock().map_err(|_| "db lock")?;
  let count: i64 = if let Some(other) = other_user_id {
    conn.query_row(
      "SELECT COUNT(*) FROM p2p_messages WHERE recipient_id = ?1 AND sender_id = ?2 AND is_read = 0",
      params![user_id, other],
      |row| row.get(0),
    ).unwrap_or(0)
  } else {
    conn.query_row(
      "SELECT COUNT(*) FROM p2p_messages WHERE recipient_id = ?1 AND is_read = 0",
      params![user_id],
      |row| row.get(0),
    ).unwrap_or(0)
  };

  Ok(json!({"success": true, "count": count}))
}

async fn internal_p2p_send_read_receipt(p2p: State<'_, P2PState>, args: Value) -> Result<Value, String> {
  p2p.internal.send_read_receipt(args).await
}

async fn internal_p2p_send_typing(p2p: State<'_, P2PState>, args: Value) -> Result<Value, String> {
  p2p.internal.send_typing(args).await
}

async fn internal_p2p_offer_file(p2p: State<'_, P2PState>, args: Value) -> Result<Value, String> {
  p2p.internal.offer_file(args).await
}

async fn internal_p2p_accept_file(p2p: State<'_, P2PState>, args: Value) -> Result<Value, String> {
  let transfer_id = args.get("transferId").and_then(|v| v.as_str()).ok_or("missing transferId")?.to_string();
  p2p.internal.accept_file(transfer_id).await
}

async fn internal_p2p_reject_file(p2p: State<'_, P2PState>, args: Value) -> Result<Value, String> {
  let transfer_id = args.get("transferId").and_then(|v| v.as_str()).ok_or("missing transferId")?.to_string();
  p2p.internal.reject_file(transfer_id).await
}

async fn internal_p2p_get_file_transfers(p2p: State<'_, P2PState>) -> Result<Value, String> {
  Ok(p2p.internal.get_file_transfers().await)
}

async fn internal_p2p_send_group_message(p2p: State<'_, P2PState>, args: Value) -> Result<Value, String> {
  p2p.internal.send_group_message(args).await
}

async fn internal_p2p_broadcast_group_create(p2p: State<'_, P2PState>, args: Value) -> Result<Value, String> {
  p2p.internal.broadcast_group_create(args).await
}

async fn internal_p2p_broadcast_group_member_change(p2p: State<'_, P2PState>, args: Value) -> Result<Value, String> {
  p2p.internal.broadcast_group_member_change(args).await
}

async fn internal_p2p_send_group_read_receipt(p2p: State<'_, P2PState>, args: Value) -> Result<Value, String> {
  p2p.internal.send_group_read_receipt(args).await
}

async fn internal_p2p_send_group_typing(p2p: State<'_, P2PState>, args: Value) -> Result<Value, String> {
  p2p.internal.send_group_typing(args).await
}

// ============================================
// Network Discovery IPC 핸들러
// ============================================

async fn network_discovery_start(p2p: State<'_, P2PState>) -> Result<Value, String> {
  let port = 41236u16;
  let requested_port = 41236u16;
  p2p.discovery.start(port, requested_port).await
}

async fn network_discovery_stop(p2p: State<'_, P2PState>) -> Result<Value, String> {
  p2p.discovery.stop().await
}

async fn network_discovery_get_devices(p2p: State<'_, P2PState>) -> Result<Value, String> {
  Ok(p2p.discovery.get_devices().await)
}

fn network_discovery_save_device(state: State<'_, AppState>, args: Value) -> Result<Value, String> {
  let conn = state.db.lock().map_err(|_| "db lock")?;
  conn.execute(
    "INSERT OR REPLACE INTO discovered_devices (device_id, hostname, ip_address, mac_address, os, platform, user_id, last_seen, discovery_version)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
    params![
      args.get("deviceId").and_then(|v| v.as_str()),
      args.get("hostname").and_then(|v| v.as_str()),
      args.get("ipAddress").and_then(|v| v.as_str()),
      args.get("macAddress").and_then(|v| v.as_str()),
      args.get("os").and_then(|v| v.as_str()),
      args.get("platform").and_then(|v| v.as_str()),
      args.get("userId").and_then(|v| v.as_str()),
      args.get("lastSeen").and_then(|v| v.as_str()),
      args.get("discoveryVersion").and_then(|v| v.as_str())
    ],
  )
  .map_err(|e| e.to_string())?;

  Ok(json!({"success": true}))
}

fn network_discovery_sync_databases(state: State<'_, AppState>) -> Result<Value, String> {
  let conn = state.db.lock().map_err(|_| "db lock")?;
  let mut stmt = conn
    .prepare(
      "SELECT device_id, hostname, ip_address, mac_address, os, platform, user_id, last_seen, discovery_version FROM discovered_devices",
    )
    .map_err(|e| e.to_string())?;

  let rows = stmt
    .query_map([], |row| {
      Ok(json!({
        "deviceId": row.get::<_, Option<String>>(0)?,
        "hostname": row.get::<_, Option<String>>(1)?,
        "ipAddress": row.get::<_, Option<String>>(2)?,
        "macAddress": row.get::<_, Option<String>>(3)?,
        "os": row.get::<_, Option<String>>(4)?,
        "platform": row.get::<_, Option<String>>(5)?,
        "userId": row.get::<_, Option<String>>(6)?,
        "lastSeen": row.get::<_, Option<String>>(7)?,
        "discoveryVersion": row.get::<_, Option<String>>(8)?
      }))
    })
    .map_err(|e| e.to_string())?;

  let mut devices = Vec::new();
  for row in rows {
    devices.push(row.map_err(|e| e.to_string())?);
  }

  Ok(json!({"success": true, "devices": devices}))
}

// ============================================
// P2P Messaging IPC 핸들러
// ============================================

async fn p2p_messaging_send(p2p: State<'_, P2PState>, args: Value) -> Result<Value, String> {
  p2p.internal.send_message(args).await
}

async fn p2p_start_device_registration(p2p: State<'_, P2PState>, args: Value) -> Result<Value, String> {
  let user_id = args.get("userId").and_then(|v| v.as_str()).ok_or("missing userId")?.to_string();
  let user_name = args.get("userName").and_then(|v| v.as_str()).unwrap_or("").to_string();
  let school_id = args.get("schoolId").and_then(|v| v.as_str()).map(|s| s.to_string());
  p2p.device_registration.start(user_id, user_name, school_id).await
}

async fn p2p_stop_device_registration(p2p: State<'_, P2PState>) -> Result<Value, String> {
  p2p.device_registration.stop().await
}

fn system_collect_detailed_info() -> Result<Value, String> {
  let hostname = hostname::get().ok().and_then(|h| h.into_string().ok()).unwrap_or_default();
  let ip_address = local_ip_address::local_ip().ok().map(|ip| ip.to_string()).unwrap_or_default();
  Ok(json!({
    "hostname": hostname,
    "platform": std::env::consts::OS,
    "arch": std::env::consts::ARCH,
    "ipAddress": ip_address,
    "collectedAt": chrono::Utc::now().to_rfc3339()
  }))
}

fn save_group_message(state: State<'_, AppState>, args: Value) -> Result<Value, String> {
  let conn = state.db.lock().map_err(|_| "db lock")?;
  conn.execute(
    "INSERT OR REPLACE INTO group_messages (id, content, message_type, timestamp, sender_id, recipients, is_read, delivered)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
    params![
      args.get("id").and_then(|v| v.as_str()),
      args.get("content").and_then(|v| v.as_str()),
      args.get("type").and_then(|v| v.as_str()),
      args.get("timestamp").and_then(|v| v.as_str()),
      args.get("senderId").and_then(|v| v.as_str()),
      args.get("recipients").map(|v| v.to_string()),
      args.get("isRead").and_then(|v| v.as_bool()).unwrap_or(false) as i64,
      args.get("delivered").and_then(|v| v.as_bool()).unwrap_or(false) as i64
    ],
  )
  .map_err(|e| e.to_string())?;

  Ok(json!({"success": true}))
}

// ============================================
// tus 파일 업로드 관련 IPC 핸들러
// ============================================

#[tauri::command]
async fn tus_get_endpoint(server: State<'_, Arc<ServerManager>>) -> Result<Value, String> {
    let port = server.port();
    Ok(json!({
        "success": true,
        "endpoint": format!("http://127.0.0.1:{}/tus/files", port)
    }))
}

#[tauri::command]
async fn tus_get_upload_status(
    server: State<'_, Arc<ServerManager>>,
    upload_id: String,
) -> Result<Value, String> {
    if let Some(tus) = server.tus_server().await {
        match tus.storage().get_upload(&upload_id).await {
            Ok(upload) => Ok(json!({
                "success": true,
                "upload": {
                    "id": upload.id,
                    "offset": upload.offset,
                    "length": upload.length,
                    "isComplete": upload.is_complete,
                    "filename": upload.filename(),
                    "finalPath": upload.final_path
                }
            })),
            Err(e) => Ok(json!({"success": false, "error": e.to_string()})),
        }
    } else {
        Ok(json!({"success": false, "error": "Server not running"}))
    }
}

// ============================================
// Durable Streams 메시징 관련 IPC 핸들러
// ============================================

#[tauri::command]
async fn streams_get_endpoint(server: State<'_, Arc<ServerManager>>) -> Result<Value, String> {
    let port = server.port();
    Ok(json!({
        "success": true,
        "endpoint": format!("http://127.0.0.1:{}/api/streams", port),
        "sseEndpoint": format!("http://127.0.0.1:{}/api/streams/stream", port),
        "pollEndpoint": format!("http://127.0.0.1:{}/api/streams/poll", port)
    }))
}

#[tauri::command]
async fn streams_send_message(
    server: State<'_, Arc<ServerManager>>,
    sender_id: String,
    recipient_id: String,
    content: String,
    msg_type: Option<String>,
) -> Result<Value, String> {
    if let Some(stream_server) = server.stream_server().await {
        let message = streams::StreamMessage {
            id: uuid::Uuid::new_v4().to_string(),
            offset: 0,
            msg_type: match msg_type.as_deref() {
                Some("file") => streams::MessageType::File,
                Some("image") => streams::MessageType::Image,
                Some("typing") => streams::MessageType::Typing,
                Some("read_receipt") => streams::MessageType::ReadReceipt,
                Some("delivery_receipt") => streams::MessageType::DeliveryReceipt,
                _ => streams::MessageType::Text,
            },
            payload: json!({ "content": content }),
            sender_id,
            recipient_id,
            timestamp: chrono::Utc::now().to_rfc3339(),
        };

        match stream_server.storage().append(message).await {
            Ok(saved) => Ok(json!({
                "success": true,
                "message": {
                    "id": saved.id,
                    "offset": saved.offset,
                    "timestamp": saved.timestamp
                }
            })),
            Err(e) => Ok(json!({"success": false, "error": e.to_string()})),
        }
    } else {
        Ok(json!({"success": false, "error": "Server not running"}))
    }
}

#[tauri::command]
async fn streams_get_messages(
    server: State<'_, Arc<ServerManager>>,
    user_id: String,
    other_user_id: Option<String>,
    from_offset: Option<u64>,
    limit: Option<usize>,
) -> Result<Value, String> {
    if let Some(stream_server) = server.stream_server().await {
        let offset = from_offset.unwrap_or(0);
        let lim = limit.unwrap_or(50);

        let messages = if let Some(other) = other_user_id {
            stream_server
                .storage()
                .get_conversation(&user_id, &other, offset, lim)
                .await
        } else {
            stream_server
                .storage()
                .get_user_messages(&user_id, offset, lim)
                .await
        };

        match messages {
            Ok(msgs) => {
                let next_offset = msgs.last().map(|m| m.offset).unwrap_or(offset);
                Ok(json!({
                    "success": true,
                    "messages": msgs,
                    "nextOffset": next_offset
                }))
            }
            Err(e) => Ok(json!({"success": false, "error": e.to_string()})),
        }
    } else {
        Ok(json!({"success": false, "error": "Server not running"}))
    }
}

#[tauri::command]
async fn streams_get_current_offset(
    server: State<'_, Arc<ServerManager>>,
) -> Result<Value, String> {
    if let Some(stream_server) = server.stream_server().await {
        let offset = stream_server.storage().current_offset().await;
        Ok(json!({"success": true, "offset": offset}))
    } else {
        Ok(json!({"success": false, "error": "Server not running"}))
    }
}

#[tauri::command]
async fn streams_get_info(server: State<'_, Arc<ServerManager>>) -> Result<Value, String> {
    if let Some(stream_server) = server.stream_server().await {
        let info = stream_server.storage().get_stream_info().await;
        Ok(json!({
            "success": true,
            "info": {
                "path": info.path,
                "mode": format!("{:?}", info.mode).to_lowercase(),
                "currentOffset": info.current_offset,
                "totalBytes": info.total_bytes,
                "createdAt": info.created_at,
                "updatedAt": info.updated_at,
                "etag": info.etag
            }
        }))
    } else {
        Ok(json!({"success": false, "error": "Server not running"}))
    }
}

#[tauri::command]
async fn streams_delete_message(
    server: State<'_, Arc<ServerManager>>,
    message_id: String,
) -> Result<Value, String> {
    if let Some(stream_server) = server.stream_server().await {
        match stream_server.storage().delete_message(&message_id).await {
            Ok(deleted) => Ok(json!({"success": deleted})),
            Err(e) => Ok(json!({"success": false, "error": e.to_string()})),
        }
    } else {
        Ok(json!({"success": false, "error": "Server not running"}))
    }
}

#[tauri::command]
async fn streams_health_check(server: State<'_, Arc<ServerManager>>) -> Result<Value, String> {
    if let Some(stream_server) = server.stream_server().await {
        let storage = stream_server.storage();
        let count = storage.message_count().await.unwrap_or(0);
        let offset = storage.current_offset().await;
        let total_bytes = storage.total_bytes().await;
        let etag = storage.etag().await;

        Ok(json!({
            "success": true,
            "health": {
                "status": "ok",
                "messageCount": count,
                "currentOffset": offset,
                "totalBytes": total_bytes,
                "etag": etag
            }
        }))
    } else {
        Ok(json!({"success": false, "error": "Server not running"}))
    }
}

// ============================================
// 파일 정보 가져오기 (드래그 앤 드롭용)
// ============================================

#[tauri::command]
async fn get_file_info(path: String) -> Result<Value, String> {
    use std::fs;
    use std::path::Path;

    let path = Path::new(&path);

    if !path.exists() {
        return Err("File or folder does not exist".to_string());
    }

    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    let is_dir = metadata.is_dir();
    let size = metadata.len();

    // 폴더인 경우 내부 모든 파일의 총 크기 계산 및 하위 항목 목록
    let (total_size, children) = if is_dir {
        let total = calculate_folder_size(path);
        let children_list = get_folder_children(path);
        (total, Some(children_list))
    } else {
        (size, None)
    };

    Ok(json!({
        "is_dir": is_dir,
        "size": size,
        "total_size": total_size,
        "children": children
    }))
}

fn get_folder_children(path: &std::path::Path) -> Vec<Value> {
    use std::fs;

    let mut children: Vec<Value> = Vec::new();

    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            let name = entry_path.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            let is_dir = entry_path.is_dir();
            let size = if is_dir {
                calculate_folder_size(&entry_path)
            } else {
                fs::metadata(&entry_path).map(|m| m.len()).unwrap_or(0)
            };

            // 하위 폴더의 경우 재귀적으로 children 가져오기 (1단계만)
            let sub_children = if is_dir {
                Some(get_folder_children_shallow(&entry_path))
            } else {
                None
            };

            children.push(json!({
                "name": name,
                "path": entry_path.to_string_lossy().to_string(),
                "is_dir": is_dir,
                "size": size,
                "children": sub_children
            }));
        }
    }

    // 폴더를 먼저, 그 다음 파일 (이름순 정렬)
    children.sort_by(|a, b| {
        let a_is_dir = a.get("is_dir").and_then(|v| v.as_bool()).unwrap_or(false);
        let b_is_dir = b.get("is_dir").and_then(|v| v.as_bool()).unwrap_or(false);
        let a_name = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let b_name = b.get("name").and_then(|v| v.as_str()).unwrap_or("");

        match (a_is_dir, b_is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a_name.cmp(b_name),
        }
    });

    children
}

fn get_folder_children_shallow(path: &std::path::Path) -> Vec<Value> {
    use std::fs;

    let mut children: Vec<Value> = Vec::new();

    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            let name = entry_path.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            let is_dir = entry_path.is_dir();
            let size = if is_dir {
                0 // shallow에서는 폴더 크기 계산 안함
            } else {
                fs::metadata(&entry_path).map(|m| m.len()).unwrap_or(0)
            };

            children.push(json!({
                "name": name,
                "path": entry_path.to_string_lossy().to_string(),
                "is_dir": is_dir,
                "size": size,
                "children": null
            }));
        }
    }

    children
}

fn calculate_folder_size(path: &std::path::Path) -> u64 {
    use std::fs;

    let mut total: u64 = 0;

    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_file() {
                if let Ok(metadata) = fs::metadata(&entry_path) {
                    total += metadata.len();
                }
            } else if entry_path.is_dir() {
                total += calculate_folder_size(&entry_path);
            }
        }
    }

    total
}

// ============================================
// 폴더 열기 명령
// ============================================

#[tauri::command]
fn open_folder(path: String) -> Result<Value, String> {
    use std::process::Command;

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    Ok(json!({ "success": true }))
}

// ============================================
// Main 함수
// ============================================

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_os::init())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .setup(|app| {
      // 데이터베이스 초기화
      let db_path = db_path_for(&app.handle())?;
      let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
      init_db(&conn).map_err(|e| e.to_string())?;
      app.manage(AppState { db: StdMutex::new(conn) });
      app.manage(P2PState::new(app.handle().clone()));

      // 서버 매니저 생성 및 시작
      let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

      let server_manager = Arc::new(ServerManager::new(41234));

      // 비동기 서버 시작
      let server_clone = server_manager.clone();
      let data_dir_clone = app_data_dir.clone();
      tauri::async_runtime::spawn(async move {
        match server_clone.start(data_dir_clone).await {
          Ok(msg) => println!("{}", msg),
          Err(e) => eprintln!("[Server] Failed to start: {}", e),
        }
      });

      app.manage(server_manager);

      println!("[Edulinker] App initialized with tus + Durable Streams server on port 41234");
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      ipc,
      // tus 파일 업로드
      tus_get_endpoint,
      tus_get_upload_status,
      // Durable Streams 메시징
      streams_get_endpoint,
      streams_send_message,
      streams_get_messages,
      streams_get_current_offset,
      streams_get_info,
      streams_delete_message,
      streams_health_check,
      // 파일 정보 가져오기
      get_file_info,
      // 폴더 열기
      open_folder,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}





fn ensure_message_columns(conn: &Connection) -> rusqlite::Result<()> {
  let mut stmt = conn.prepare("PRAGMA table_info(messages)")?;
  let column_iter = stmt.query_map([], |row| row.get::<_, String>(1))?;

  let mut columns = Vec::new();
  for col in column_iter {
    columns.push(col?);
  }

  if !columns.iter().any(|c| c == "message_id") {
    conn.execute("ALTER TABLE messages ADD COLUMN message_id TEXT", [])?;
  }
  if !columns.iter().any(|c| c == "read_at") {
    conn.execute("ALTER TABLE messages ADD COLUMN read_at TEXT", [])?;
  }
  if !columns.iter().any(|c| c == "delivered_at") {
    conn.execute("ALTER TABLE messages ADD COLUMN delivered_at TEXT", [])?;
  }

  Ok(())
}

// Settings functions
fn settings_get(state: State<'_, AppState>, args: Value) -> Result<Value, String> {
  let key = args
    .get("key")
    .and_then(|v| v.as_str())
    .ok_or("missing key")?;

  let conn = state.db.lock().map_err(|e| e.to_string())?;
  let result: Option<String> = conn
    .query_row(
      "SELECT value FROM app_settings WHERE key = ?1",
      params![key],
      |row| row.get(0),
    )
    .optional()
    .map_err(|e| e.to_string())?;

  Ok(json!({
    "success": true,
    "value": result
  }))
}

fn settings_set(state: State<'_, AppState>, args: Value) -> Result<Value, String> {
  let key = args
    .get("key")
    .and_then(|v| v.as_str())
    .ok_or("missing key")?;
  let value = args
    .get("value")
    .and_then(|v| v.as_str())
    .ok_or("missing value")?;

  let conn = state.db.lock().map_err(|e| e.to_string())?;
  let now = chrono::Utc::now().to_rfc3339();

  conn.execute(
    "INSERT INTO app_settings (key, value, updated_at) VALUES (?1, ?2, ?3)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    params![key, value, now],
  ).map_err(|e| e.to_string())?;

  Ok(json!({
    "success": true
  }))
}

fn settings_get_theme(state: State<'_, AppState>) -> Result<Value, String> {
  let conn = state.db.lock().map_err(|e| e.to_string())?;
  let result: Option<String> = conn
    .query_row(
      "SELECT value FROM app_settings WHERE key = 'theme'",
      [],
      |row| row.get(0),
    )
    .optional()
    .map_err(|e| e.to_string())?;

  Ok(json!({
    "success": true,
    "themeId": result.unwrap_or_else(|| "blue".to_string())
  }))
}

fn settings_set_theme(state: State<'_, AppState>, args: Value) -> Result<Value, String> {
  let theme_id = args
    .get("themeId")
    .and_then(|v| v.as_str())
    .ok_or("missing themeId")?;

  let conn = state.db.lock().map_err(|e| e.to_string())?;
  let now = chrono::Utc::now().to_rfc3339();

  conn.execute(
    "INSERT INTO app_settings (key, value, updated_at) VALUES ('theme', ?1, ?2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    params![theme_id, now],
  ).map_err(|e| e.to_string())?;

  Ok(json!({
    "success": true,
    "themeId": theme_id
  }))
}

// ============================================
// File Download Functions
// ============================================

async fn file_download(
  app: AppHandle,
  state: State<'_, AppState>,
  p2p: State<'_, P2PState>,
  args: Value,
) -> Result<Value, String> {
  let upload_id = args
    .get("uploadId")
    .and_then(|v| v.as_str())
    .ok_or("missing uploadId")?
    .to_string();
  let file_name = args
    .get("fileName")
    .and_then(|v| v.as_str())
    .ok_or("missing fileName")?
    .to_string();
  let peer_id = args
    .get("peerId")
    .and_then(|v| v.as_str())
    .map(|s| s.to_string());

  // 다운로드 경로 가져오기
  let download_path = {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let result: Option<String> = conn
      .query_row(
        "SELECT value FROM app_settings WHERE key = 'downloadPath'",
        [],
        |row| row.get(0),
      )
      .optional()
      .map_err(|e| e.to_string())?;

    match result {
      Some(path) => path,
      None => {
        // 기본 다운로드 경로 사용
        dirs::download_dir()
          .map(|p| p.to_string_lossy().to_string())
          .unwrap_or_else(|| ".".to_string())
      }
    }
  };

  let file_path = std::path::Path::new(&download_path).join(&file_name);
  let file_path_str = file_path.to_string_lossy().to_string();

  // P2P를 통한 다운로드 시도 (향후 구현)
  // TODO: P2P 파일 전송 프로토콜 구현 필요
  let _peer_id = peer_id; // 사용하지 않는 변수 경고 방지
  let _p2p = p2p; // 사용하지 않는 변수 경고 방지

  // Durable Stream을 통한 다운로드 시도
  // TUS 서버에서 파일 다운로드
  let tus_storage_path = app
    .path()
    .app_data_dir()
    .map(|p| p.join("tus_uploads"))
    .map_err(|e| e.to_string())?;

  let source_path = tus_storage_path.join(&upload_id);
  if source_path.exists() {
    // 로컬 TUS 스토리지에서 복사
    tokio::fs::copy(&source_path, &file_path)
      .await
      .map_err(|e| format!("Failed to copy file: {}", e))?;

    let _ = app.emit("file:download-complete", json!({
      "uploadId": upload_id,
      "filePath": file_path_str
    }));

    return Ok(json!({
      "success": true,
      "filePath": file_path_str,
      "method": "local"
    }));
  }

  // 원격 서버에서 다운로드 (스트림 서버 사용)
  let stream_url = format!("http://localhost:9877/streams/{}/download", upload_id);

  let client = reqwest::Client::new();
  let response = client
    .get(&stream_url)
    .send()
    .await
    .map_err(|e| format!("Stream download request failed: {}", e))?;

  if !response.status().is_success() {
    return Err(format!("Stream download failed: {}", response.status()));
  }

  let bytes = response
    .bytes()
    .await
    .map_err(|e| format!("Failed to read response: {}", e))?;

  tokio::fs::write(&file_path, &bytes)
    .await
    .map_err(|e| format!("Failed to write file: {}", e))?;

  let _ = app.emit("file:download-complete", json!({
    "uploadId": upload_id,
    "filePath": file_path_str
  }));

  Ok(json!({
    "success": true,
    "filePath": file_path_str,
    "method": "stream"
  }))
}

fn file_download_progress(args: Value) -> Result<Value, String> {
  let upload_id = args
    .get("uploadId")
    .and_then(|v| v.as_str())
    .ok_or("missing uploadId")?;

  // TODO: 실제 다운로드 진행 상태 추적
  Ok(json!({
    "success": true,
    "uploadId": upload_id,
    "progress": 0,
    "status": "unknown"
  }))
}

fn file_cancel_download(args: Value) -> Result<Value, String> {
  let upload_id = args
    .get("uploadId")
    .and_then(|v| v.as_str())
    .ok_or("missing uploadId")?;

  // TODO: 다운로드 취소 로직
  Ok(json!({
    "success": true,
    "uploadId": upload_id
  }))
}

fn file_create_download_folder(args: Value) -> Result<Value, String> {
  let parent_path = args
    .get("parentPath")
    .and_then(|v| v.as_str())
    .ok_or("missing parentPath")?;

  // edulinker_file 폴더 경로 생성
  let download_folder = std::path::Path::new(parent_path).join("edulinker_file");
  let folder_path = download_folder.to_string_lossy().to_string();

  // 폴더가 없으면 생성
  if !download_folder.exists() {
    std::fs::create_dir_all(&download_folder)
      .map_err(|e| format!("폴더 생성 실패: {}", e))?;
  }

  Ok(json!({
    "success": true,
    "path": folder_path
  }))
}

