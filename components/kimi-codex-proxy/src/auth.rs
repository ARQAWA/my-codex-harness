use base64::Engine;
use serde_json::{Value, json};
use std::{path::PathBuf, time::{Duration, SystemTime, UNIX_EPOCH}};
use tokio::sync::Mutex;

const REFRESH_URL: &str = "https://auth.openai.com/oauth/token";
const CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";

#[derive(Clone)]
pub struct Credentials {
    pub access_token: String,
    pub account_id: String,
    pub revision: String,
}

pub struct Auth {
    path: PathBuf,
    lock: Mutex<()>,
    client: reqwest::Client,
}

impl Auth {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            lock: Mutex::new(()),
            client: reqwest::Client::builder().timeout(Duration::from_secs(30)).build().expect("HTTP client"),
        }
    }

    pub async fn borrow(&self) -> Result<Credentials, String> {
        self.load(None).await
    }

    pub async fn recover_after_401(&self, rejected: &Credentials) -> Result<Credentials, String> {
        let next = self.load(Some(rejected)).await?;
        if next.access_token == rejected.access_token && next.account_id == rejected.account_id {
            return Err("backend rejected refreshed Codex credentials".into());
        }
        Ok(next)
    }

    async fn load(&self, rejected: Option<&Credentials>) -> Result<Credentials, String> {
        let _guard = self.lock.lock().await;
        let bytes = tokio::fs::read(&self.path).await.map_err(|e| format!("read Codex auth JSON: {e}"))?;
        let current_credentials = self.credentials_from_bytes(&bytes).await?;
        let mut doc: Value = serde_json::from_slice(&bytes).map_err(|_| "invalid Codex auth JSON".to_string())?;
        if doc.get("auth_mode").and_then(Value::as_str) != Some("chatgpt") {
            return Err("expected Codex auth_mode chatgpt".into());
        }
        let tokens = doc.get_mut("tokens").and_then(Value::as_object_mut).ok_or("missing ChatGPT tokens")?;
        let mut access = tokens.get("access_token").and_then(Value::as_str).filter(|s| !s.is_empty()).ok_or("missing access token")?.to_owned();
        let changed_since_rejection = rejected.is_some_and(|old| old.access_token != current_credentials.access_token || old.account_id != current_credentials.account_id);
        let expiry = jwt_payload(&access).and_then(|v| v.get("exp").and_then(Value::as_i64));
        let now = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_secs() as i64;
        if !changed_since_rejection && (rejected.is_some() || expiry.is_some_and(|exp| now >= exp - 30)) {
            let refresh = tokens.get("refresh_token").and_then(Value::as_str).filter(|s| !s.is_empty()).ok_or("access token expired without refresh token")?;
            let response = self.client.post(REFRESH_URL).json(&json!({"client_id":CLIENT_ID,"grant_type":"refresh_token","refresh_token":refresh})).send().await.map_err(|_| "token refresh failed".to_string())?;
            if !response.status().is_success() { return Err(format!("token refresh failed (HTTP {})", response.status())); }
            let refreshed: Value = response.json().await.map_err(|_| "invalid token refresh response".to_string())?;
            if refreshed.get("access_token").and_then(Value::as_str).filter(|s| !s.is_empty()).is_none() { return Err("token refresh response missing access token".into()); }
            let latest = tokio::fs::read(&self.path).await.map_err(|e| format!("recheck Codex auth JSON: {e}"))?;
            if latest != bytes { return self.credentials_from_bytes(&latest).await; }
            for key in ["access_token", "refresh_token", "id_token"] {
                if let Some(value) = refreshed.get(key) { tokens.insert(key.to_string(), value.clone()); }
            }
            access = tokens["access_token"].as_str().unwrap().to_owned();
            let data = serde_json::to_vec_pretty(&doc).map_err(|e| e.to_string())?;
            let tmp = self.path.with_extension(format!("json.{}.tmp", uuid::Uuid::new_v4()));
            tokio::fs::write(&tmp, data).await.map_err(|e| format!("write refreshed auth: {e}"))?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                tokio::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o600)).await.map_err(|e| format!("protect refreshed auth: {e}"))?;
            }
            let latest = tokio::fs::read(&self.path).await.map_err(|e| format!("recheck Codex auth JSON: {e}"))?;
            if latest != bytes { let _ = tokio::fs::remove_file(&tmp).await; return self.credentials_from_bytes(&latest).await; }
            tokio::fs::rename(&tmp, &self.path).await.map_err(|e| format!("replace refreshed auth: {e}"))?;
        }
        let tokens = doc.get("tokens").and_then(Value::as_object).unwrap();
        let account_id = tokens.get("account_id").and_then(Value::as_str).map(str::to_owned)
            .or_else(|| ["id_token", "access_token"].iter().find_map(|key| {
                let token = tokens.get(*key)?.as_str()?;
                let p = jwt_payload(token)?;
                p.get("chatgpt_account_id").and_then(Value::as_str).map(str::to_owned)
                    .or_else(|| p.pointer("/https:~1~1api.openai.com~1auth/chatgpt_account_id").and_then(Value::as_str).map(str::to_owned))
            })).unwrap_or_default();
        let metadata = tokio::fs::metadata(&self.path).await.map_err(|e| format!("inspect Codex auth JSON: {e}"))?;
        let modified = metadata.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|t| t.as_nanos()).unwrap_or(0);
        Ok(Credentials {access_token: access, account_id, revision: format!("{modified}:{}", metadata.len())})
    }

    async fn credentials_from_bytes(&self, bytes: &[u8]) -> Result<Credentials, String> {
        let doc: Value = serde_json::from_slice(bytes).map_err(|_| "invalid Codex auth JSON".to_string())?;
        if doc.get("auth_mode").and_then(Value::as_str) != Some("chatgpt") { return Err("expected Codex auth_mode chatgpt".into()); }
        let tokens = doc.get("tokens").and_then(Value::as_object).ok_or("missing ChatGPT tokens")?;
        let access = tokens.get("access_token").and_then(Value::as_str).filter(|s| !s.is_empty()).ok_or("missing access token")?.to_owned();
        let account_id = tokens.get("account_id").and_then(Value::as_str).map(str::to_owned)
            .or_else(|| ["id_token", "access_token"].iter().find_map(|key| {
                let token = tokens.get(*key)?.as_str()?;
                let p = jwt_payload(token)?;
                p.get("chatgpt_account_id").and_then(Value::as_str).map(str::to_owned)
                    .or_else(|| p.pointer("/https:~1~1api.openai.com~1auth/chatgpt_account_id").and_then(Value::as_str).map(str::to_owned))
            })).unwrap_or_default();
        let metadata = tokio::fs::metadata(&self.path).await.map_err(|e| format!("inspect Codex auth JSON: {e}"))?;
        let modified = metadata.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|t| t.as_nanos()).unwrap_or(0);
        Ok(Credentials {access_token: access, account_id, revision: format!("{modified}:{}", metadata.len())})
    }
}

fn jwt_payload(token: &str) -> Option<Value> {
    let part = token.split('.').nth(1)?;
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(part).ok()?;
    serde_json::from_slice(&bytes).ok()
}
