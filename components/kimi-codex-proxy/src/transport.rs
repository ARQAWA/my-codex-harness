use crate::{auth::{Auth, Credentials}, request::{self, Mode, Prepared}};
use eventsource_stream::Eventsource;
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use std::{collections::{BTreeMap, HashMap, HashSet}, io::Write, sync::{Arc, Mutex}, time::{Duration, SystemTime, UNIX_EPOCH}};
use tokio::{net::TcpStream, sync::{mpsc, oneshot}, time::timeout};
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, connect_async, tungstenite::{Message, client::IntoClientRequest}};

pub type Ws = WebSocketStream<MaybeTlsStream<TcpStream>>;
// Codex CLI's default OpenAI provider has five stream retries.
const STREAM_MAX_RETRIES: usize = 5;

async fn retry_pause(attempt: usize) {
    let base = 200u64.saturating_mul(1u64 << attempt.saturating_sub(1).min(10));
    let jitter = 900 + (uuid::Uuid::new_v4().as_u128() % 200) as u64;
    tokio::time::sleep(Duration::from_millis(base.saturating_mul(jitter) / 1000)).await;
}

#[derive(Default)]
pub struct Session {
    pub ws: Option<Ws>,
    pub auth_owner: String,
    pub fallback_http: bool,
    pub last: Option<Last>,
    pub turn_state: Option<String>,
    pub thread_id: String,
    pub seen_call_ids: HashSet<String>,
    pub used_wire_ids: HashSet<String>,
}

pub struct Last {
    pub request: Value,
    pub external_native_input: Vec<Value>,
    pub response_id: String,
    pub output: Vec<Value>,
    pub external_input: Vec<Value>,
    pub mode: Mode,
    pub projected_external: Option<Vec<Value>>,
}

pub type DebugLog = Arc<Mutex<std::fs::File>>;

fn record(log: &Option<DebugLog>, kind: &str, value: Value) {
    let Some(log) = log else { return };
    let time_ms = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis();
    if let Ok(mut file) = log.lock() {
        let _ = writeln!(file, "{}", json!({"time_ms":time_ms,"kind":kind,"value":value}));
    }
}

#[derive(Clone)]
pub struct Config { pub backend: String, pub client: reqwest::Client, pub debug: Option<DebugLog> }

fn properties_match(a: &Value, b: &Value) -> bool {
    for key in ["model", "instructions", "tools", "tool_choice", "parallel_tool_calls", "reasoning", "store", "stream", "include", "service_tier", "prompt_cache_key", "text"] {
        if a.get(key) != b.get(key) { return false; }
    }
    true
}

fn projected_output(mode: Mode, output: &[Value], wire_ids: &[String]) -> Option<Vec<Value>> {
    let mut wire_ids = wire_ids.iter();
    if mode == Mode::Responses {
        let mut projected = Vec::new();
        for item in output {
            match item.get("type")?.as_str()? {
                "message" => {
                    let parts = item.get("content")?.as_array()?;
                    let mut joined = String::new();
                    for part in parts {
                        if part.get("type")?.as_str()? != "output_text" { return None; }
                        joined.push_str(part.get("text")?.as_str()?);
                    }
                    if !joined.is_empty() { projected.push(json!({"type":"message","role":"assistant","content":[{"type":"output_text","text":joined,"annotations":[]}]})); }
                },
                "function_call" => projected.push(json!({"type":"function_call","call_id":wire_ids.next()?,"name":item.get("name")?,"arguments":item.get("arguments")?})),
                "reasoning" => {
                    let summary = item.get("summary")?.as_array()?;
                    let mut joined = String::new();
                    for part in summary { if part.get("type")?.as_str()? != "summary_text" { return None; } joined.push_str(part.get("text")?.as_str()?); }
                    let mut v = json!({"type":"reasoning","summary":[{"type":"summary_text","text":joined}]});
                    if let Some(encrypted) = item.get("encrypted_content") { v["encrypted_content"] = encrypted.clone(); }
                    projected.push(v);
                },
                _ => return None,
            }
        }
        Some(projected)
    } else {
        let mut text = String::new();
        let mut reasoning = String::new();
        let mut encrypted = Vec::new();
        let mut calls = Vec::new();
        for item in output {
            match item.get("type")?.as_str()? {
                "message" => for part in item.get("content")?.as_array()? { if part.get("type")?.as_str()? != "output_text" { return None; } text.push_str(part.get("text")?.as_str()?); },
                "function_call" => calls.push(json!({"id":wire_ids.next()?,"type":"function","function":{"name":item.get("name")?,"arguments":item.get("arguments")?}})),
                "reasoning" => {
                    for part in item.get("summary")?.as_array()? { if part.get("type")?.as_str()? != "summary_text" { return None; } reasoning.push_str(part.get("text")?.as_str()?); }
                    if let Some(value) = item.get("encrypted_content").and_then(Value::as_str) { encrypted.push(json!({"type":"encrypted","encrypted":value})); }
                },
                _ => return None,
            }
        }
        let has_reasoning = output.iter().any(|item| item.get("type").and_then(Value::as_str) == Some("reasoning"));
        let mut message = json!({"role":"assistant","content":if text.is_empty() { if has_reasoning && calls.is_empty() {json!("")} else {Value::Null} } else {json!(text)}});
        if has_reasoning { message["reasoning_content"] = json!(reasoning); }
        if !encrypted.is_empty() { message["reasoning_details"] = json!(encrypted); }
        if !calls.is_empty() { message["tool_calls"] = json!(calls); }
        Some(vec![message])
    }
}

fn external_suffix<'a>(s: &Session, p: &'a Prepared) -> Option<&'a [Value]> {
    let last = s.last.as_ref()?;
    if last.mode != p.mode { return None; }
    let mut external = last.external_input.clone();
    external.extend(last.projected_external.as_ref()?.clone());
    if p.external_input.len() < external.len() || p.external_input[..external.len()] != external { return None; }
    Some(&p.external_input[external.len()..])
}

// Kimi sends its own reserialized history. Restore the server's completed items
// only after the complete external prefix matches the history we projected.
fn reconstruct_history(s: &Session, p: &mut Prepared) {
    if external_suffix(s, p).is_none() { return; }
    let Some(last) = s.last.as_ref() else { return };
    let Some(projected) = last.projected_external.as_ref() else { return };
    let external = if p.mode == Mode::Chat {
        json!({"model":p.logical["model"],"messages":projected,"stream":true})
    } else {
        json!({"model":p.logical["model"],"input":projected,"stream":true,"store":false})
    };
    let Ok(projected_native) = request::prepare(&external, p.mode) else { return };
    let Some(prior) = last.request.get("input").and_then(Value::as_array) else { return };
    let Some(projected_items) = projected_native.logical.get("input").and_then(Value::as_array) else { return };
    let Some(current) = p.logical.get("input").and_then(Value::as_array) else { return };
    let external_prior = &last.external_native_input;
    let boundary = external_prior.len() + projected_items.len();
    if current.len() < boundary || current[..external_prior.len()] != *external_prior || current[external_prior.len()..boundary] != *projected_items { return; }
    let mut restored = prior.clone();
    restored.extend(last.output.clone());
    let mut suffix = current[boundary..].to_vec();
    // Only the exact projected prefix authorizes translating its tool results.
    // A later ID can change Kimi's normalization of the entire history; then
    // the prefix check above fails and the complete, already paired wire
    // history is sent instead.
    let mut projected_calls = Vec::new();
    if p.mode == Mode::Responses {
        for item in projected {
            if item.get("type").and_then(Value::as_str) == Some("function_call") {
                projected_calls.push(item.get("call_id").and_then(Value::as_str));
            }
        }
    } else {
        for message in projected {
            if let Some(calls) = message.get("tool_calls").and_then(Value::as_array) {
                for call in calls { projected_calls.push(call.get("id").and_then(Value::as_str)); }
            }
        }
    }
    let raw_calls: Vec<_> = last.output.iter().filter(|item| item.get("type").and_then(Value::as_str) == Some("function_call"))
        .map(|item| item.get("call_id").and_then(Value::as_str)).collect();
    if projected_calls.len() != raw_calls.len() || projected_calls.iter().any(Option::is_none) || raw_calls.iter().any(Option::is_none) { return; }
    let mut verified_ids = HashMap::new();
    for (wire, raw) in projected_calls.iter().zip(raw_calls.iter()) {
        if verified_ids.insert(wire.unwrap(), raw.unwrap()).is_some() { return; }
    }
    for item in &mut suffix {
        if item.get("type").and_then(Value::as_str) == Some("function_call_output") {
            let Some(wire) = item.get("call_id").and_then(Value::as_str) else { return };
            if let Some(raw) = verified_ids.get(wire) { item["call_id"] = json!(raw); }
        }
    }
    restored.extend(suffix);
    p.logical["input"] = json!(restored);
}

fn continuation(s: &Session, p: &Prepared) -> Option<(String, Vec<Value>)> {
    if s.ws.is_none() || external_suffix(s, p).is_none() { return None; }
    let last = s.last.as_ref()?;
    let request = &p.logical;
    if last.response_id.is_empty() || !properties_match(&last.request, request) { return None; }
    let mut baseline = last.request.get("input")?.as_array()?.clone();
    baseline.extend(last.output.clone());
    let current = request.get("input")?.as_array()?;
    if current.len() < baseline.len() { return None; }
    if !baseline.iter().zip(current).all(|(a,b)| a == b) { return None; }
    Some((last.response_id.clone(), current[baseline.len()..].to_vec()))
}

fn same_turn(s: &Session, p: &Prepared) -> bool {
    let Some(last) = s.last.as_ref() else { return false };
    let Some(suffix) = external_suffix(s, p) else { return false };
    if suffix.is_empty() { return false; }
    let projected = match last.projected_external.as_ref() { Some(v) => v, None => return false };
    let calls: HashSet<&str> = if p.mode == Mode::Responses {
        projected.iter().filter_map(|item| (item.get("type").and_then(Value::as_str) == Some("function_call")).then(|| item.get("call_id").and_then(Value::as_str)).flatten()).collect()
    } else {
        projected.iter().flat_map(|item| item.get("tool_calls").and_then(Value::as_array).into_iter().flatten()).filter_map(|call| call.get("id").and_then(Value::as_str)).collect()
    };
    !calls.is_empty() && suffix.iter().all(|item| {
        let id = if p.mode == Mode::Responses {
            if item.get("type").and_then(Value::as_str) != Some("function_call_output") { return false; }
            item.get("call_id").and_then(Value::as_str)
        } else {
            if item.get("role").and_then(Value::as_str) != Some("tool") { return false; }
            item.get("tool_call_id").and_then(Value::as_str)
        };
        id.is_some_and(|id| calls.contains(id))
    })
}

fn seed_external_call_ids(s: &mut Session, p: &Prepared) {
    for item in &p.external_input {
        if p.mode == Mode::Responses {
            if let Some(id) = item.get("call_id").and_then(Value::as_str) {
                s.used_wire_ids.insert(id.into());
                s.seen_call_ids.insert(id.into());
            }
        } else {
            if let Some(id) = item.get("tool_call_id").and_then(Value::as_str) {
                s.used_wire_ids.insert(id.into());
                s.seen_call_ids.insert(id.into());
            }
            if let Some(calls) = item.get("tool_calls").and_then(Value::as_array) {
                for call in calls {
                    if let Some(id) = call.get("id").and_then(Value::as_str) {
                        s.used_wire_ids.insert(id.into());
                        s.seen_call_ids.insert(id.into());
                    }
                }
            }
        }
    }
}

fn wire_call_id(raw: &str, mode: Mode, used: &HashSet<String>) -> String {
    let raw = if mode == Mode::Responses { raw.split('|').next().unwrap_or(raw) } else { raw };
    let sanitized: String = raw.chars().map(|c| if c.is_ascii_alphanumeric() || c == '_' || c == '-' { c } else { '_' }).take(64).collect();
    let base = if sanitized.is_empty() { "tool_call" } else { &sanitized };
    if !used.contains(base) { return base.into(); }
    let mut n = 2;
    loop {
        let suffix = format!("_{n}");
        let candidate = format!("{}{}", &base[..base.len().min(64-suffix.len())], suffix);
        if !used.contains(&candidate) { return candidate; }
        n += 1;
    }
}

fn headers(c: &Credentials, p: &Prepared, s: &Session, ws: bool) -> Vec<(&'static str, String)> {
    let mut h = vec![
        ("authorization", format!("Bearer {}", c.access_token)),
        ("originator", "kimi-codex-proxy".into()),
        ("session-id", p.cache_key.clone()),
        ("thread-id", s.thread_id.clone()),
        ("x-client-request-id", s.thread_id.clone()),
        ("user-agent", format!("kimi-codex-proxy/0.1.0 ({}; {})", std::env::consts::OS, std::env::consts::ARCH)),
    ];
    if !c.account_id.is_empty() { h.push(("chatgpt-account-id", c.account_id.clone())); }
    if ws { h.push(("openai-beta", "responses_websockets=2026-02-06".into())); }
    else {
        h.push(("accept", "text/event-stream".into()));
        h.push(("content-type", "application/json".into()));
        if let Some(state) = &s.turn_state { h.push(("x-codex-turn-state", state.clone())); }
    }
    h
}

fn ws_url(base: &str) -> Result<String, String> {
    let scheme = if base.starts_with("https://") { "wss://" } else if base.starts_with("http://") { "ws://" } else { return Err("backend URL must start with http(s)".into()) };
    Ok(format!("{}{}", scheme, &base[base.find("://").unwrap()+3..]).trim_end_matches('/').to_owned() + "/responses")
}

enum ConnectFailure { Retryable(String), Unauthorized, Fatal(String), UpgradeRequired }

enum WsFailure { Retryable(String), Fatal(String) }

fn ws_transport_failure(error: tokio_tungstenite::tungstenite::Error) -> WsFailure {
    use tokio_tungstenite::tungstenite::Error;
    match error {
        Error::ConnectionClosed | Error::AlreadyClosed | Error::Io(_) => WsFailure::Retryable(format!("WS transport: {error}")),
        _ => WsFailure::Fatal(format!("WS transport: {error}")),
    }
}

fn ws_backend_failure(event: &Value) -> WsFailure {
    let message = event.pointer("/error/message").and_then(Value::as_str)
        .or_else(|| event.get("message").and_then(Value::as_str))
        .unwrap_or("backend response failed").to_owned();
    let code = event.pointer("/error/code").and_then(Value::as_str);
    let status = event.get("status").or_else(|| event.get("status_code")).and_then(Value::as_u64);
    if matches!(code, Some("previous_response_not_found" | "websocket_connection_limit_reached"))
        || matches!(status, Some(429 | 500..=599)) {
        WsFailure::Retryable(message)
    } else {
        WsFailure::Fatal(message)
    }
}

async fn connect(s: &mut Session, c: &Credentials, p: &Prepared, cfg: &Config) -> Result<(), ConnectFailure> {
    let mut req = ws_url(&cfg.backend).map_err(ConnectFailure::Fatal)?.into_client_request().map_err(|e| ConnectFailure::Fatal(e.to_string()))?;
    for (name, value) in headers(c, p, s, true) {
        let name = tokio_tungstenite::tungstenite::http::HeaderName::from_bytes(name.as_bytes()).map_err(|e| ConnectFailure::Fatal(e.to_string()))?;
        req.headers_mut().insert(name, value.parse().map_err(|_| ConnectFailure::Fatal("invalid header".into()))?);
    }
    match timeout(Duration::from_secs(15), connect_async(req)).await {
        Ok(Ok((ws, response))) => {
            if s.turn_state.is_none() { s.turn_state = response.headers().get("x-codex-turn-state").and_then(|h| h.to_str().ok()).map(str::to_owned); }
            s.ws = Some(ws); Ok(())
        },
        Ok(Err(tokio_tungstenite::tungstenite::Error::Http(response))) if response.status().as_u16() == 426 => Err(ConnectFailure::UpgradeRequired),
        Ok(Err(tokio_tungstenite::tungstenite::Error::Http(response))) if response.status().as_u16() == 401 => Err(ConnectFailure::Unauthorized),
        Ok(Err(tokio_tungstenite::tungstenite::Error::Http(response))) if response.status().is_server_error() || response.status().as_u16() == 429 => Err(ConnectFailure::Retryable(format!("WS HTTP {}", response.status()))),
        Ok(Err(tokio_tungstenite::tungstenite::Error::Http(response))) => Err(ConnectFailure::Fatal(format!("WS HTTP {}", response.status()))),
        Ok(Err(e)) => match ws_transport_failure(e) {
            WsFailure::Retryable(message) => Err(ConnectFailure::Retryable(message)),
            WsFailure::Fatal(message) => Err(ConnectFailure::Fatal(message)),
        },
        Err(_) => Err(ConnectFailure::Retryable("WS connect timeout".into())),
    }
}

struct Projection {
    debug: Option<DebugLog>,
    mode: Mode,
    include_usage: bool,
    model: String,
    id: String,
    response_id: String,
    output: BTreeMap<usize, Value>,
    chat_tools: BTreeMap<usize, usize>,
    chat_args: BTreeMap<usize, String>,
    chat_wire_ids: BTreeMap<usize, String>,
    assigned_ids: HashSet<String>,
    used_wire_ids: HashSet<String>,
    next_tool: usize,
    terminal: bool,
    completed: bool,
}

impl Projection {
    fn new(p: &Prepared, s: &Session, debug: Option<DebugLog>) -> Self {
        Self { debug, mode: p.mode, include_usage: p.include_usage, model: p.logical["model"].as_str().unwrap_or("").into(), id: format!("chatcmpl-{}", uuid::Uuid::new_v4()), response_id: String::new(), output: BTreeMap::new(), chat_tools: BTreeMap::new(), chat_args: BTreeMap::new(), chat_wire_ids: BTreeMap::new(), assigned_ids: s.seen_call_ids.clone(), used_wire_ids: s.used_wire_ids.clone(), next_tool: 0, terminal: false, completed: false }
    }
    async fn emit(&self, tx: &mpsc::Sender<String>, v: Value) -> Result<(), String> {
        record(&self.debug, "downstream_event", v.clone());
        tx.send(format!("data: {}\n\n", v)).await.map_err(|_| "client disconnected".into())
    }
    async fn chunk(&self, tx: &mpsc::Sender<String>, delta: Value, finish: Option<&str>) -> Result<(), String> {
        self.emit(tx, json!({"id":self.id,"object":"chat.completion.chunk","model":self.model,"choices":[{"index":0,"delta":delta,"finish_reason":finish}]})).await
    }
    async fn process(&mut self, e: Value, tx: &mpsc::Sender<String>, s: &mut Session) -> Result<(), String> {
        record(&self.debug, "upstream_event", e.clone());
        let t = e.get("type").and_then(Value::as_str).unwrap_or("").to_owned();
        if t == "response.created" {
            if let Some(id) = e.pointer("/response/id").and_then(Value::as_str) {
                self.response_id = id.into();
                self.id = id.into();
            }
        }
        if t == "response.metadata" {
            if let Some(headers) = e.get("headers").and_then(Value::as_object) {
                if let Some(state) = headers.iter().find_map(|(key,value)| key.eq_ignore_ascii_case("x-codex-turn-state").then(|| value.as_str()).flatten()) {
                    if s.turn_state.is_none() { s.turn_state = Some(state.into()); }
                }
            }
        }
        if t == "response.output_item.done" {
            if let (Some(index), Some(item)) = (e.get("output_index").and_then(Value::as_u64), e.get("item")) { self.output.insert(index as usize, item.clone()); }
        }
        if t == "response.created" || t == "response.metadata" || t == "response.in_progress" { return Ok(()); }
        if t == "response.completed" || t == "response.incomplete" {
            self.terminal = true;
            self.completed = t == "response.completed";
            if let Some(id) = e.pointer("/response/id").and_then(Value::as_str) { self.response_id = id.into(); }
            if self.mode == Mode::Chat {
                let finish = if t == "response.incomplete" { "length" } else if self.output.values().any(|x| x.get("type").and_then(Value::as_str) == Some("function_call")) { "tool_calls" } else { "stop" };
                self.chunk(tx, json!({}), Some(finish)).await?;
                if self.include_usage {
                    let response = &e["response"];
                    let input = response.pointer("/usage/input_tokens").and_then(Value::as_u64).unwrap_or(0);
                    let output = response.pointer("/usage/output_tokens").and_then(Value::as_u64).unwrap_or(0);
                    self.emit(tx, json!({"id":self.id,"object":"chat.completion.chunk","model":self.model,"choices":[],"usage":{"prompt_tokens":input,"completion_tokens":output,"total_tokens":input+output}})).await?;
                }
            } else { self.emit(tx, e).await?; }
            tx.send("data: [DONE]\n\n".into()).await.map_err(|_| "client disconnected".to_string())?;
            return Ok(());
        }
        if t == "error" || t == "response.failed" {
            self.terminal = true;
            if self.mode == Mode::Responses { self.emit(tx, e).await?; }
            else {
                let message = e.pointer("/error/message").and_then(Value::as_str).or_else(|| e.get("message").and_then(Value::as_str)).unwrap_or("backend response failed");
                self.emit(tx, json!({"error":{"message":message,"type":"proxy_transport_error"}})).await?;
            }
            tx.send("data: [DONE]\n\n".into()).await.map_err(|_| "client disconnected".to_string())?;
            return Ok(());
        }
        if self.mode == Mode::Responses {
            if !t.starts_with("codex.") && !t.is_empty() { self.emit(tx, e).await?; }
            return Ok(());
        }
        match t.as_str() {
            "response.output_text.delta" => if let Some(delta) = e.get("delta").and_then(Value::as_str) { self.chunk(tx, json!({"content":delta}), None).await?; },
            "response.reasoning_summary_text.delta" => if let Some(delta) = e.get("delta").and_then(Value::as_str) { self.chunk(tx, json!({"reasoning_content":delta}), None).await?; },
            "response.output_item.added" => {
                if e.pointer("/item/type").and_then(Value::as_str) == Some("function_call") {
                    let source = e.get("output_index").and_then(Value::as_u64).unwrap_or(0) as usize;
                    let idx = self.next_tool; self.next_tool += 1; self.chat_tools.insert(source, idx);
                    let call = &e["item"];
                    let raw = call.get("call_id").and_then(Value::as_str).ok_or("function call without call_id")?;
                    let mut assigned = raw.to_owned();
                    let mut n = 2;
                    while self.assigned_ids.contains(&assigned) { assigned = format!("{raw}__{n}"); n += 1; }
                    self.assigned_ids.insert(assigned.clone());
                    let wire = wire_call_id(&assigned, self.mode, &self.used_wire_ids);
                    self.used_wire_ids.insert(wire.clone());
                    self.chat_wire_ids.insert(source, wire);
                    self.chat_args.insert(source, call.get("arguments").and_then(Value::as_str).unwrap_or("").into());
                    self.chunk(tx, json!({"tool_calls":[{"index":idx,"id":assigned,"type":"function","function":{"name":call.get("name"),"arguments":call.get("arguments").and_then(Value::as_str).unwrap_or("")}}]}), None).await?;
                }
            },
            "response.function_call_arguments.delta" => {
                let source = e.get("output_index").and_then(Value::as_u64).unwrap_or(0) as usize;
                if let Some(args) = self.chat_args.get_mut(&source) { args.push_str(e.get("delta").and_then(Value::as_str).unwrap_or("")); }
                if let Some(idx) = self.chat_tools.get(&source) { self.chunk(tx, json!({"tool_calls":[{"index":idx,"function":{"arguments":e.get("delta").and_then(Value::as_str).unwrap_or("")}}]}), None).await?; }
            },
            "response.function_call_arguments.done" => {
                let source = e.get("output_index").and_then(Value::as_u64).unwrap_or(0) as usize;
                if let Some(final_args) = e.get("arguments").and_then(Value::as_str) {
                    self.finish_args(source, final_args, tx).await?;
                }
            },
            "response.output_item.done" => {
                if e.pointer("/item/type").and_then(Value::as_str) == Some("function_call") {
                    let source = e.get("output_index").and_then(Value::as_u64).unwrap_or(0) as usize;
                    if let Some(final_args) = e.pointer("/item/arguments").and_then(Value::as_str) { self.finish_args(source, final_args, tx).await?; }
                }
                if e.pointer("/item/type").and_then(Value::as_str) == Some("reasoning") {
                    if let Some(encrypted) = e.pointer("/item/encrypted_content") { self.chunk(tx, json!({"reasoning_details":[{"type":"encrypted","encrypted":encrypted}]}), None).await?; }
                }
            },
            _ => {},
        }
        Ok(())
    }
    async fn finish_args(&mut self, source: usize, final_args: &str, tx: &mpsc::Sender<String>) -> Result<(), String> {
        let Some(args) = self.chat_args.get_mut(&source) else { return Err("function arguments without item".into()) };
        if !final_args.starts_with(args.as_str()) { return Err("function arguments differ from streamed deltas".into()); }
        let suffix = final_args[args.len()..].to_owned();
        *args = final_args.into();
        if !suffix.is_empty() {
            let idx = self.chat_tools.get(&source).ok_or("function tool index missing")?;
            self.chunk(tx, json!({"tool_calls":[{"index":idx,"function":{"arguments":suffix}}]}), None).await?;
        }
        Ok(())
    }
}

fn store_last(session: &mut Session, p: &Prepared, external_native_input: &[Value], projection: &Projection) {
    if projection.completed {
        let output: Vec<Value> = projection.output.values().cloned().collect();
        let mut wire_ids = Vec::new();
        for (index, item) in &projection.output {
            if item.get("type").and_then(Value::as_str) != Some("function_call") { continue; }
            if p.mode == Mode::Chat {
                let Some(wire) = projection.chat_wire_ids.get(index) else { return };
                wire_ids.push(wire.clone());
                continue;
            }
            let Some(raw) = item.get("call_id").and_then(Value::as_str) else { continue };
            let mut assigned = raw.to_owned();
            let mut n = 2;
            while session.seen_call_ids.contains(&assigned) {
                assigned = format!("{raw}__{n}"); n += 1;
            }
            session.seen_call_ids.insert(assigned.clone());
            let wire = wire_call_id(&assigned, p.mode, &session.used_wire_ids);
            session.used_wire_ids.insert(wire.clone());
            wire_ids.push(wire);
        }
        if p.mode == Mode::Chat {
            session.seen_call_ids = projection.assigned_ids.clone();
            session.used_wire_ids = projection.used_wire_ids.clone();
        }
        let projected_external = projected_output(p.mode, &output, &wire_ids);
        session.last = Some(Last { request: p.logical.clone(), external_native_input: external_native_input.to_vec(), response_id: projection.response_id.clone(), output, external_input: p.external_input.clone(), mode: p.mode, projected_external });
    }
}

async fn read_ws(session: &mut Session, projection: &mut Projection, tx: &mpsc::Sender<String>, ready: &mut Option<oneshot::Sender<Result<(), String>>>) -> Result<(), WsFailure> {
    loop {
        let msg = {
            let ws = session.ws.as_mut().ok_or_else(|| WsFailure::Fatal("WS not connected".into()))?;
            timeout(Duration::from_secs(300), ws.next()).await.map_err(|_| WsFailure::Retryable("WS idle timeout".into()))?
        };
        match msg {
            Some(Ok(Message::Text(data))) => {
                let v: Value = serde_json::from_str(&data).map_err(|e| WsFailure::Fatal(format!("invalid WS response JSON: {e}")))?;
                let kind = v.get("type").and_then(Value::as_str).unwrap_or("");
                if ready.is_some() && (kind == "error" || kind == "response.failed") {
                    let failure = ws_backend_failure(&v);
                    if let WsFailure::Fatal(message) = &failure { let _ = ready.take().unwrap().send(Err(message.clone())); }
                    return Err(failure);
                }
                if ready.is_some() && !kind.starts_with("codex.") && !["response.metadata", "response.created", "response.in_progress"].contains(&kind) { let _ = ready.take().unwrap().send(Ok(())); }
                projection.process(v, tx, session).await.map_err(WsFailure::Fatal)?;
                if projection.terminal { return Ok(()); }
            },
            Some(Ok(Message::Ping(data))) => { session.ws.as_mut().unwrap().send(Message::Pong(data)).await.map_err(ws_transport_failure)?; },
            Some(Ok(Message::Close(_))) | None => return Err(WsFailure::Retryable("WS closed before response.completed".into())),
            Some(Err(e)) => return Err(ws_transport_failure(e)),
            _ => {},
        }
    }
}

pub async fn run(cfg: Config, session: &mut Session, mut p: Prepared, auth: Arc<Auth>, mut cred: Credentials, tx: mpsc::Sender<String>, ready: oneshot::Sender<Result<(), String>>) -> Result<(), String> {
    record(&cfg.debug, "incoming_request", json!({"mode":if p.mode==Mode::Responses {"responses"} else {"chat"},"external_input":p.external_input,"logical":p.logical}));
    let owner = format!("{}:{}:{}", cred.account_id, cred.revision, cred.access_token);
    if session.auth_owner != owner { session.ws = None; session.last = None; session.turn_state = None; session.fallback_http = false; session.seen_call_ids.clear(); session.used_wire_ids.clear(); session.auth_owner = owner; }
    if session.thread_id.is_empty() { session.thread_id = uuid::Uuid::new_v4().to_string(); }
    if !same_turn(session, &p) { session.turn_state = None; }
    seed_external_call_ids(session, &p);
    let external_native_input = p.logical.get("input").and_then(Value::as_array).cloned().ok_or("native input missing")?;
    let external_prefix_match = external_suffix(session, &p).is_some();
    reconstruct_history(session, &mut p);
    record(&cfg.debug, "history", json!({"external_prefix_match":external_prefix_match,"same_turn":session.turn_state.is_some(),"logical_input":p.logical["input"],"previous_response_id":session.last.as_ref().map(|last| &last.response_id)}));
    let mut projection = Projection::new(&p, session, cfg.debug.clone());
    let mut ready = Some(ready);
    let mut attempt = 0;
    let mut auth_retried = false;
    loop {
        attempt += 1;
        if !session.fallback_http {
            if session.ws.is_none() {
                match connect(session, &cred, &p, &cfg).await {
                    Ok(()) => {},
                    Err(ConnectFailure::UpgradeRequired) => { session.fallback_http = true; },
                    Err(ConnectFailure::Unauthorized) if !auth_retried => {
                        auth_retried = true;
                        cred = auth.recover_after_401(&cred).await?;
                        session.auth_owner = format!("{}:{}:{}", cred.account_id, cred.revision, cred.access_token);
                        session.last = None; session.turn_state = None; session.ws = None;
                        continue;
                    },
                    Err(ConnectFailure::Unauthorized) => return Err("backend WS unauthorized".into()),
                    Err(ConnectFailure::Retryable(err)) => {
                        if attempt <= STREAM_MAX_RETRIES { retry_pause(attempt).await; continue; }
                        let _ = err;
                        session.fallback_http = true;
                    },
                    Err(ConnectFailure::Fatal(err)) => return Err(err),
                }
            }
            if session.ws.is_some() {
                let mut body = p.logical.clone();
                if let Some((id, delta)) = continuation(session, &p) { body["previous_response_id"] = json!(id); body["input"] = json!(delta); }
                if let Some(state) = &session.turn_state { body["client_metadata"] = json!({"x-codex-turn-state":state}); }
                body["type"] = json!("response.create");
                record(&cfg.debug, "upstream_request_ws", body.clone());
                match session.ws.as_mut().unwrap().send(Message::Text(body.to_string().into())).await {
                    Ok(()) => {
                        match read_ws(session, &mut projection, &tx, &mut ready).await {
                            Ok(()) => { store_last(session, &p, &external_native_input, &projection); return Ok(()); },
                            Err(failure) => {
                                session.ws = None; session.last = None;
                                let err = match failure { WsFailure::Retryable(err) => err, WsFailure::Fatal(err) => return Err(err) };
                                if ready.is_none() { return Err(err); }
                                if attempt <= STREAM_MAX_RETRIES { retry_pause(attempt).await; continue; }
                                session.fallback_http = true;
                            },
                        }
                    },
                    Err(error) => {
                        session.ws = None; session.last = None;
                        let err = match ws_transport_failure(error) { WsFailure::Retryable(err) => err, WsFailure::Fatal(err) => return Err(err) };
                        if attempt <= STREAM_MAX_RETRIES { retry_pause(attempt).await; continue; }
                        let _ = err;
                        session.fallback_http = true;
                    },
                }
            }
        }
        let url = format!("{}/responses", cfg.backend.trim_end_matches('/'));
        record(&cfg.debug, "upstream_request_http", p.logical.clone());
        let mut req = cfg.client.post(url);
        for (k,v) in headers(&cred, &p, session, false) { req = req.header(k,v); }
        let response = req.json(&p.logical).send().await.map_err(|e| format!("HTTP transport: {e}"))?;
        if response.status().as_u16() == 401 && !auth_retried {
            auth_retried = true;
            cred = auth.recover_after_401(&cred).await?;
            session.auth_owner = format!("{}:{}:{}", cred.account_id, cred.revision, cred.access_token);
            session.ws = None; session.last = None; session.turn_state = None;
            continue;
        }
        if !response.status().is_success() {
            let err = format!("backend HTTP {}", response.status());
            if let Some(r) = ready.take() { let _ = r.send(Err(err.clone())); }
            return Err(err);
        }
        if session.turn_state.is_none() { session.turn_state = response.headers().get("x-codex-turn-state").and_then(|h| h.to_str().ok()).map(str::to_owned); }
        let mut stream = response.bytes_stream().eventsource();
        loop {
            let event = timeout(Duration::from_secs(300), stream.next()).await.map_err(|_| "HTTP SSE idle timeout".to_string())?;
            match event {
                Some(Ok(event)) => {
                    let v: Value = match serde_json::from_str(&event.data) { Ok(v) => v, Err(_) => continue };
                    let kind = v.get("type").and_then(Value::as_str).unwrap_or("");
                    if ready.is_some() && (kind == "error" || kind == "response.failed") {
                        let message = v.pointer("/error/message").and_then(Value::as_str).or_else(|| v.get("message").and_then(Value::as_str)).unwrap_or("backend response failed").to_owned();
                        let _ = ready.take().unwrap().send(Err(message.clone()));
                        return Err(message);
                    }
                    if ready.is_some() && !kind.starts_with("codex.") && !["response.metadata", "response.created", "response.in_progress"].contains(&kind) { let _ = ready.take().unwrap().send(Ok(())); }
                    projection.process(v, &tx, session).await?;
                    if projection.terminal { store_last(session, &p, &external_native_input, &projection); return Ok(()); }
                },
                Some(Err(e)) => return Err(format!("HTTP SSE: {e}")),
                None => return Err("HTTP SSE ended before response.completed".into()),
            }
        }
    }
}
