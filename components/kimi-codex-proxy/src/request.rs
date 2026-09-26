use serde_json::{Value, json};

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Mode { Responses, Chat }

pub struct Prepared {
    pub logical: Value,
    pub external_input: Vec<Value>,
    pub cache_key: String,
    pub include_usage: bool,
    pub mode: Mode,
}

fn string<'a>(v: &'a Value, field: &str) -> Result<&'a str, String> {
    v.get(field).and_then(Value::as_str).ok_or_else(|| format!("missing or invalid {field}"))
}
fn arr<'a>(v: &'a Value, field: &str) -> Result<&'a Vec<Value>, String> {
    v.get(field).and_then(Value::as_array).ok_or_else(|| format!("missing or invalid {field}"))
}
fn allowed(v: &Value, fields: &[&str]) -> Result<(), String> {
    let obj=v.as_object().ok_or("request must be JSON object")?;
    for (key,value) in obj {
        if !fields.contains(&key.as_str()) && !value.is_null() && value != &json!({}) && value != &json!([]) {
            return Err(format!("unsupported request field: {key}"));
        }
    }
    Ok(())
}
fn optional_bool(v: &Value, field: &str, expected: bool) -> Result<(), String> {
    if let Some(value) = v.get(field) { if value.as_bool()!=Some(expected) {return Err(format!("{field} must be {expected}"));} }
    Ok(())
}
fn content_piece(p: &Value, role: &str) -> Result<Value, String> {
    let t=string(p,"type")?;
    if role=="assistant" && !["output_text","text"].contains(&t) {return Err("assistant content must be output text".into());}
    match t {
        "input_text" | "output_text" | "text" => {
            allowed(p,&["type","text","annotations"])?;
            if p.get("annotations").is_some_and(|v| v != &json!([]) && !v.is_null()) {return Err("unsupported nonempty text annotations".into());}
            Ok(json!({"type": if role=="assistant" {"output_text"} else {"input_text"},"text":string(p,"text")?}))
        },
        "input_image" | "image_url" => {
            allowed(p,&["type","image_url","detail"])?;
            if let Some(image)=p.get("image_url").filter(|v|v.is_object()) {allowed(image,&["url","detail"])?;}
            let url = p.get("image_url").and_then(Value::as_str).or_else(|| p.pointer("/image_url/url").and_then(Value::as_str)).ok_or("missing image_url")?;
            let outer=p.get("detail").filter(|v|!v.is_null());
            let inner=p.pointer("/image_url/detail").filter(|v|!v.is_null());
            if outer.is_some() && inner.is_some() && outer!=inner {return Err("conflicting image detail".into());}
            let detail=outer.or(inner).map(|v|v.as_str().ok_or("invalid image detail")).transpose()?.unwrap_or("auto");
            if !["auto","low","high","original"].contains(&detail) {return Err("unsupported image detail".into());}
            Ok(json!({"type":"input_image","image_url":url,"detail":detail}))
        },
        "input_audio" | "audio_url" => {
            allowed(p,&["type","audio_url"])?;
            if let Some(audio)=p.get("audio_url").filter(|v|v.is_object()) {allowed(audio,&["url"])?;}
            let url = p.get("audio_url").and_then(Value::as_str).or_else(|| p.pointer("/audio_url/url").and_then(Value::as_str)).ok_or("missing audio_url")?;
            Ok(json!({"type":"input_audio","audio_url":url}))
        },
        "input_file" => {
            allowed(p,&["type","file_data","filename","file_url"])?;
            if p.get("file_data").is_some_and(|v| !v.is_null()) && p.get("file_url").is_some_and(|v| !v.is_null()) {return Err("input_file has both file_data and file_url".into());}
            if let Some(data)=p.get("file_data").and_then(Value::as_str) {
                let file=string(p,"filename")?;
                let media=if file.ends_with(".mp3") {"audio/mpeg"} else if file.ends_with(".wav") {"audio/wav"} else {return Err("only inline mp3/wav files are supported".into())};
                Ok(json!({"type":"input_audio","audio_url":format!("data:{media};base64,{data}")}))
            } else if let Some(url)=p.get("file_url").and_then(Value::as_str) {
                Ok(json!({"type":"input_audio","audio_url":url}))
            } else {Err("unsupported input_file".into())}
        },
        "video_url" => Err("video has no native Codex content item".into()),
        _ => Err(format!("unsupported content type: {t}"))
    }
}
fn content(v: &Value, role: &str) -> Result<Vec<Value>, String> {
    match v {
        Value::String(s) => Ok(vec![json!({"type":if role=="assistant" {"output_text"} else {"input_text"},"text":s})]),
        Value::Null => Ok(vec![]),
        Value::Array(parts) => parts.iter().map(|p| content_piece(p,role)).collect(),
        _ => Err("unsupported message content".into())
    }
}
fn response_item(item: &Value) -> Result<Value, String> {
    let t=item.get("type").and_then(Value::as_str).unwrap_or("message");
    match t {
        "message" => {
            allowed(item,&["type","role","content","id"])?;
            let role=string(item,"role")?;
            if !["system","developer","user","assistant"].contains(&role) {return Err("unsupported message role".into())}
            let mut v=json!({"type":"message","role":role,"content":content(item.get("content").ok_or("missing content")?,role)?});
            if let Some(value)=item.get("id").filter(|v|!v.is_null()) {let id=value.as_str().ok_or("message id must be a string")?; if ["msg_","item_"].iter().any(|p| id.starts_with(p)) {v["id"]=json!(id);} else if !id.is_empty() {return Err("unsupported message id".into());} }
            Ok(v)
        },
        "function_call" => {
            allowed(item,&["type","call_id","name","arguments","id"])?;
            let mut v=json!({"type":"function_call","call_id":string(item,"call_id")?,"name":string(item,"name")?,"arguments":string(item,"arguments")?});
            if let Some(value)=item.get("id").filter(|v|!v.is_null()) {let id=value.as_str().ok_or("function_call id must be a string")?; if id.starts_with("fc_") {v["id"]=json!(id);} else if !id.is_empty() {return Err("unsupported function_call id".into());} }
            Ok(v)
        },
        "function_call_output" => {
            allowed(item,&["type","call_id","output"])?;
            let output=item.get("output").ok_or("missing function output")?;
            let output=if output.is_string() {output.clone()} else if output.is_array() {Value::Array(content(output,"tool")?)} else {return Err("unsupported function output".into())};
            Ok(json!({"type":"function_call_output","call_id":string(item,"call_id")?,"output":output}))
        },
        "reasoning" => {
            allowed(item,&["type","summary","encrypted_content","id"])?;
            if item.get("summary").is_some_and(|v| !v.is_array() && !v.is_null()) {return Err("reasoning summary must be an array".into());}
            let summary=item.get("summary").and_then(Value::as_array).cloned().unwrap_or_default();
            for part in &summary {allowed(part,&["type","text"])?; if string(part,"type")?!="summary_text" {return Err("unsupported reasoning summary type".into());} let _=string(part,"text")?;}
            let mut v=json!({"type":"reasoning","summary":summary});
            if let Some(s)=item.get("encrypted_content") {v["encrypted_content"]=s.clone();}
            if let Some(value)=item.get("id").filter(|v|!v.is_null()) {let id=value.as_str().ok_or("reasoning id must be a string")?; if id.starts_with("rs_") {v["id"]=json!(id);} else if !id.is_empty() {return Err("unsupported reasoning id".into());} }
            Ok(v)
        },
        _ => Err(format!("unsupported input item type: {t}"))
    }
}
fn chat_items(messages: &[Value]) -> Result<(String,Vec<Value>),String> {
    let mut instructions=Vec::new(); let mut input=Vec::new();
    for message in messages {
        let role=string(message,"role")?;
        match role {
            "system"|"developer" => {
                allowed(message,&["role","content"])?;
                let text=message.get("content").and_then(Value::as_str).ok_or("system/developer content must be text")?;
                instructions.push(text.to_owned());
            },
            "user" => {allowed(message,&["role","content"])?; input.push(json!({"type":"message","role":"user","content":content(message.get("content").ok_or("missing content")?,"user")?}));},
            "assistant" => {
                allowed(message,&["role","content","reasoning_content","reasoning_details","tool_calls"])?;
                for field in ["reasoning_content","reasoning_details","tool_calls"] {
                    if let Some(value)=message.get(field).filter(|v|!v.is_null()) {
                        if (field=="reasoning_content" && !value.is_string()) || (field!="reasoning_content" && !value.is_array()) {return Err(format!("invalid assistant {field}"));}
                    }
                }
                let parts=content(message.get("content").unwrap_or(&Value::Null),"assistant")?;
                if !parts.is_empty() { input.push(json!({"type":"message","role":"assistant","content":parts})); }
                if let Some(details)=message.get("reasoning_details").and_then(Value::as_array) {
                    let mut summary=Vec::new();
                    let mut all_summaries=Vec::new();
                    for detail in details {
                        match string(detail,"type")? {
                            "summary" => {allowed(detail,&["type","summary"])?; let text=string(detail,"summary")?; summary.push(json!({"type":"summary_text","text":text})); all_summaries.push(text);},
                            "encrypted" => {allowed(detail,&["type","encrypted"])?; input.push(json!({"type":"reasoning","summary":summary,"encrypted_content":string(detail,"encrypted")?})); summary=Vec::new();},
                            other => return Err(format!("unsupported reasoning detail: {other}")),
                        }
                    }
                    if let Some(text)=message.get("reasoning_content").and_then(Value::as_str) {
                        if !text.is_empty() && all_summaries.concat()!=text { summary.push(json!({"type":"summary_text","text":text})); }
                    }
                    if !summary.is_empty() {input.push(json!({"type":"reasoning","summary":summary}));}
                } else if let Some(s)=message.get("reasoning_content").and_then(Value::as_str) {
                    input.push(json!({"type":"reasoning","summary":[{"type":"summary_text","text":s}]}));
                }
                if let Some(calls)=message.get("tool_calls").and_then(Value::as_array) {
                    for call in calls {
                        allowed(call,&["id","type","function"])?;
                        if string(call,"type")?!="function" {return Err("unsupported tool call type".into());}
                        let function=call.get("function").ok_or("missing function")?;
                        allowed(function,&["name","arguments"])?;
                        input.push(json!({"type":"function_call","call_id":string(call,"id")?,"name":string(function,"name")?,"arguments":string(function,"arguments")?}));
                    }
                }
            },
            "tool" => {allowed(message,&["role","tool_call_id","content"])?; input.push(json!({"type":"function_call_output","call_id":string(message,"tool_call_id")?,"output":message.get("content").and_then(Value::as_str).ok_or("tool output must be text")?}));},
            _=>return Err(format!("unsupported chat role: {role}"))
        }
    }
    Ok((instructions.join("\n\n"),input))
}
fn tools(v:&Value, mode:Mode)->Result<Value,String> {
    let Some(items)=v.get("tools").and_then(Value::as_array) else {return Ok(json!([]))};
    let mut result=Vec::new();
    for item in items {
        if string(item,"type")?!="function" {return Err("only function tools are supported".into());}
        if mode==Mode::Chat {
            allowed(item,&["type","function"])?;
            let f=item.get("function").ok_or("missing function tool")?;
            allowed(f,&["name","description","parameters"])?;
            result.push(json!({"type":"function","name":string(f,"name")?,"description":f.get("description").cloned().unwrap_or(Value::Null),"parameters":f.get("parameters").cloned().unwrap_or(json!({})),"strict":false}));
        } else {result.push(item.clone());}
    }
    Ok(Value::Array(result))
}

pub fn prepare(v: &Value,mode: Mode) -> Result<Prepared,String> {
    let model=string(v,"model")?;
    if model.is_empty() {return Err("model is empty".into());}
    optional_bool(v,"stream",true)?;
    if mode==Mode::Responses { optional_bool(v,"store",false)?; }
    if let Some(include)=v.get("include") {
        let values=include.as_array().ok_or("include must be an array")?;
        if values.iter().any(|x|x.as_str()!=Some("reasoning.encrypted_content")) {return Err("unsupported include value".into());}
    }
    if let Some(options)=v.get("stream_options") {allowed(options,&["include_usage"])?;}
    let (instructions,input,external_input)=if mode==Mode::Responses {
        allowed(v,&["model","instructions","input","tools","tool_choice","parallel_tool_calls","reasoning","reasoning_effort","include","text","prompt_cache_key","store","stream","max_output_tokens","service_tier"])?;
        let raw=arr(v,"input")?.clone();
        let input=raw.iter().map(response_item).collect::<Result<Vec<_>,_>>()?;
        (v.get("instructions").and_then(Value::as_str).unwrap_or("").to_owned(),input,raw)
    } else {
        allowed(v,&["model","messages","tools","tool_choice","parallel_tool_calls","reasoning_effort","response_format","prompt_cache_key","stream","stream_options","max_tokens","max_completion_tokens","service_tier"])?;
        let messages=arr(v,"messages")?.clone();
        let (instructions,input)=chat_items(&messages)?;
        (instructions,input,messages)
    };
    let text=if mode==Mode::Chat {
        if let Some(format)=v.get("response_format") {
            allowed(format,&["type","json_schema"])?;
            match string(format,"type")? {
                "text" => None,
                "json_schema" => {
                    let schema=format.get("json_schema").ok_or("missing json_schema")?;
                    allowed(schema,&["name","schema","strict"])?;
                    Some(json!({"format":{"type":"json_schema","name":string(schema,"name")?,"schema":schema.get("schema").ok_or("missing schema")?,"strict":schema.get("strict").and_then(Value::as_bool).unwrap_or(false)}}))
                },
                _ => return Err("unsupported response_format".into()),
            }
        } else {None}
    } else {
        if let Some(text)=v.get("text") {
            allowed(text,&["format"])?;
            if let Some(format)=text.get("format") {allowed(format,&["type","name","schema","strict"])?;}
        }
        v.get("text").cloned()
    };
    let reasoning=v.get("reasoning").cloned().or_else(||v.get("reasoning_effort").and_then(Value::as_str).map(|s|json!({"effort":s,"summary":"auto"})));
    let cache_key=v.get("prompt_cache_key").and_then(Value::as_str).map(str::to_owned).unwrap_or_else(||uuid::Uuid::new_v4().to_string());
    let include_usage=v.pointer("/stream_options/include_usage").and_then(Value::as_bool)==Some(true);
    let mut logical=json!({"model":if model=="gpt-6-luna-fast" {"gpt-6-luna"} else {model},"instructions":instructions,"input":input,"tools":tools(v,mode)?,"tool_choice":"auto","parallel_tool_calls":v.get("parallel_tool_calls").and_then(Value::as_bool).unwrap_or(true),"reasoning":reasoning,"store":false,"stream":true,"include":["reasoning.encrypted_content"],"prompt_cache_key":cache_key});
    if let Some(t)=text {logical["text"]=t;}
    if let Some(t)=v.get("service_tier") {logical["service_tier"]=t.clone();}
    if model=="gpt-6-luna-fast" {logical["service_tier"]=json!("priority");}
    if let Some(choice)=v.get("tool_choice") {if choice.as_str()!=Some("auto") {return Err("non-auto tool_choice is unsupported".into());}}
    Ok(Prepared{logical,external_input,cache_key,include_usage,mode})
}
