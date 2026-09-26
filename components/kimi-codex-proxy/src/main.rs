mod auth;
mod request;
mod transport;

use auth::Auth;
use axum::{Json, Router, body::{Body, Bytes}, extract::State, http::{StatusCode, header}, response::{IntoResponse, Response}, routing::post};
use futures_util::stream;
use request::Mode;
use serde_json::{Value, json};
use std::{collections::HashMap, io, path::PathBuf, sync::Arc};
use tokio::sync::{Mutex, mpsc, oneshot};
use transport::{Config, Session};

#[derive(Clone)]
struct App {
    config: Config,
    auth: Arc<Auth>,
    sessions: Arc<Mutex<HashMap<String, Arc<Mutex<Session>>>>>,
}

fn error(status: StatusCode, message: impl Into<String>) -> Response {
    (status, Json(json!({"error":{"message":message.into(),"type":"invalid_request_error"}}))).into_response()
}

async fn responses(State(app): State<App>, Json(body): Json<Value>) -> Response {
    handle(app, body, Mode::Responses).await
}

async fn chat(State(app): State<App>, Json(body): Json<Value>) -> Response {
    handle(app, body, Mode::Chat).await
}

async fn handle(app: App, body: Value, mode: Mode) -> Response {
    let prepared = match request::prepare(&body, mode) { Ok(p) => p, Err(e) => return error(StatusCode::BAD_REQUEST, e) };
    let cred = match app.auth.borrow().await { Ok(c) => c, Err(e) => return error(StatusCode::UNAUTHORIZED, e) };
    let session = {
        let mut sessions = app.sessions.lock().await;
        sessions.entry(prepared.cache_key.clone()).or_insert_with(|| Arc::new(Mutex::new(Session::default()))).clone()
    };
    let (tx, rx) = mpsc::channel::<String>(16);
    let (ready_tx, ready_rx) = oneshot::channel();
    let config = app.config.clone();
    let auth = app.auth.clone();
    tokio::spawn(async move {
        let mut session = session.lock().await;
        if let Err(e) = transport::run(config, &mut session, prepared, auth, cred, tx.clone(), ready_tx).await {
            let frame = if mode == Mode::Responses {
                format!("data: {}\n\n", json!({"type":"error","message":e,"code":"proxy_transport_error"}))
            } else {
                format!("data: {}\n\n", json!({"error":{"message":e,"type":"proxy_transport_error"}}))
            };
            let _ = tx.send(frame).await;
            let _ = tx.send("data: [DONE]\n\n".into()).await;
        }
    });
    match ready_rx.await {
        Ok(Ok(())) => {
            let stream = stream::unfold(rx, |mut rx| async move {
                rx.recv().await.map(|chunk| (Ok::<Bytes,io::Error>(Bytes::from(chunk)), rx))
            });
            let mut response = Body::from_stream(stream).into_response();
            response.headers_mut().insert(header::CONTENT_TYPE, "text/event-stream".parse().unwrap());
            response.headers_mut().insert(header::CACHE_CONTROL, "no-cache".parse().unwrap());
            response
        },
        Ok(Err(e)) => error(StatusCode::BAD_GATEWAY, e),
        Err(_) => error(StatusCode::BAD_GATEWAY, "backend stream could not start"),
    }
}

fn flag(args: &[String], key: &str, default: &str) -> Result<String, String> {
    let mut value = default.to_owned();
    let mut i = 1;
    while i < args.len() {
        if args[i] == key {
            value = args.get(i+1).ok_or_else(|| format!("missing value for {key}"))?.clone();
            i += 2;
        } else if args[i] == "--debug" {
            i += 1;
        } else if ["--listen", "--auth-json", "--backend-base-url"].contains(&args[i].as_str()) {
            i += 2;
        } else { return Err(format!("unknown option: {}", args[i])); }
    }
    Ok(value)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    let listen = flag(&args, "--listen", "127.0.0.1:18080")?;
    let auth_default = format!("{}/.codex/auth.json", std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).unwrap_or_default());
    let auth_path = flag(&args, "--auth-json", &auth_default)?;
    let auth_path = if let Some(tail) = auth_path.strip_prefix("~/") {
        PathBuf::from(std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE"))?).join(tail)
    } else { PathBuf::from(auth_path) };
    let backend = flag(&args, "--backend-base-url", "https://chatgpt.com/backend-api/codex")?;
    let debug = if args.iter().any(|arg| arg == "--debug") {
        let path = std::env::temp_dir().join(format!("kimi-codex-proxy-{}.jsonl", std::process::id()));
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
        let file = options.open(&path)?;
        eprintln!("debug log: {}", path.display());
        Some(Arc::new(std::sync::Mutex::new(file)))
    } else { None };
    let config = Config { backend, client: reqwest::Client::builder().build()?, debug };
    let app = App { config, auth: Arc::new(Auth::new(auth_path)), sessions: Arc::new(Mutex::new(HashMap::new())) };
    let router = Router::new().route("/v1/responses", post(responses)).route("/v1/chat/completions", post(chat)).with_state(app);
    let listener = tokio::net::TcpListener::bind(&listen).await?;
    axum::serve(listener, router).await?;
    Ok(())
}
