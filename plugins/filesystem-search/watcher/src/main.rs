use interprocess::local_socket::{prelude::*, ListenerOptions};
#[cfg(unix)] use interprocess::local_socket::GenericFilePath;
#[cfg(windows)] use interprocess::local_socket::GenericNamespaced;
use notify::{RecursiveMode, Watcher};
use rusqlite::Connection;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{env, fs, io::{BufRead, BufReader, Write}, path::{Path, PathBuf}, process::{Command, Output}, sync::{Arc, Condvar, Mutex}, thread, time::{Duration, Instant}};

struct State { ready: bool, project: Option<String>, baseline: Option<u64>, error: Option<String>,
    generation: u64, changed: Option<Instant>, indexing: bool, last_result: Option<Value> }
type Shared = Arc<(Mutex<State>, Condvar)>;
fn norm(p: &Path) -> Result<String, String> {
    let s = fs::canonicalize(p).map_err(|e| e.to_string())?.to_string_lossy().into_owned();
    #[cfg(windows)] let s = s.trim_start_matches(r"\\?\").to_lowercase();
    Ok(s)
}
fn contained(root:&Path,path:&Path)->bool {
    match (norm(root),norm(path)) {
        (Ok(root),Ok(path))=>path==root || path.starts_with(&format!("{}{}",root,std::path::MAIN_SEPARATOR)),
        _=>false
    }
}
fn sha(s: &str) -> String { format!("{:x}", Sha256::digest(s.as_bytes())) }
fn run(root: &Path, exe: &str, args: &[&str]) -> Result<Output, String> {
    let mut c = Command::new(exe); c.args(args).current_dir(root);
    if exe == "codebase-memory-mcp" { c.env("CBM_ALLOWED_ROOT", root); }
    c.output().map_err(|e| e.to_string())
}
fn checked(root: &Path, exe: &str, args: &[&str]) -> Result<Output, String> {
    let o = run(root, exe, args)?;
    if o.status.success() { Ok(o) } else { Err(format!("{}: {}", o.status.code().unwrap_or(75), String::from_utf8_lossy(&o.stderr).trim())) }
}
fn cli(root: &Path, tool: &str, args: &[&str]) -> Result<Output, String> {
    let mut a = vec!["cli", tool]; a.extend(args); checked(root, "codebase-memory-mcp", &a)
}
fn identity(root: &Path, root_name: &str) -> Result<Option<String>, String> {
    let mut offset = 0_u64;
    loop {
        let out = cli(root, "list_projects", &["--detail","identity","--format","json","--offset",&offset.to_string()])?;
        let page: Value = serde_json::from_slice(&out.stdout).map_err(|e| e.to_string())?;
        for p in page["projects"].as_array().ok_or("CBM returned invalid project identities")? {
            if let (Some(path), Some(name)) = (p["root_path"].as_str(), p["name"].as_str()) {
                if norm(Path::new(path)).ok().as_deref() == Some(root_name) && !name.is_empty() { return Ok(Some(name.into())); }
            }
        }
        if page["has_more"] != true { return Ok(None); }
        let next = page["next_offset"].as_u64().ok_or("CBM identity pagination did not advance")?;
        if next <= offset { return Err("CBM identity pagination did not advance".into()); } offset = next;
    }
}
fn validate_query(root:&Path,args:&[Value])->Result<(),String>{
    let mut i=0;
    while i<args.len(){
        let token=args[i].as_str().ok_or("CBM arguments must be CLI flags")?;
        if !token.starts_with("--") || token.len()<3{return Err("CBM arguments must be --flag value or --flag=value".into())}
        let (key,value)=match token.split_once('='){Some((k,v))=>(k,Some(v)),None=>(token,None)};
        if ["--project","--repo-path","--root","--args-file","--target-projects","--persistence"].contains(&key){return Err(format!("{key} is controlled by the wrapper or is not a search option"))}
        let value=if let Some(v)=value{v}else{i+=1;args.get(i).and_then(Value::as_str).ok_or(format!("missing value for {key}"))?};
        if ["--file","--file-path","--path"].contains(&key){
            let path=Path::new(value);
            if path.is_absolute() || path.components().any(|c|matches!(c,std::path::Component::ParentDir)) || value.contains('\0'){return Err(format!("invalid scope: {value}"))}
            let real=fs::canonicalize(root.join(path)).map_err(|_|format!("scope does not exist: {value}"))?;
            if !contained(root,&real){return Err(format!("scope escapes root: {value}"))}
        }
        i+=1;
    }
    Ok(())
}
fn refresh(root: &Path, root_name: &str, shared: &Shared) -> Result<Value,String> {
    let (m,cv)=&**shared;
    let (generation,baseline,last_error,last_result)={let mut s=m.lock().map_err(|e|e.to_string())?;while s.indexing{s=cv.wait(s).map_err(|e|e.to_string())?;}s.indexing=true;(s.generation,s.baseline,s.error.clone(),s.last_result.clone())};
    let result=(|| {
        if baseline==Some(generation) && last_error.is_none() { if let Some(result)=last_result { return Ok(result); } }
        let out=cli(root,"index_repository",&["--repo-path",root.to_str().ok_or("invalid root encoding")?,"--mode","full"])?;
        let data:Value=serde_json::from_slice(&out.stdout).map_err(|e|e.to_string())?;
        if data["isError"]==true || !data["error"].is_null() || data["status"]=="error" {return Err(data.to_string())}
        let project=data["project"].as_str().filter(|x|!x.is_empty()).map(str::to_string).or(identity(root,root_name)?).ok_or("CBM index completed without project identity")?;
        let result=json!({"code":0,"stdout":String::from_utf8_lossy(&out.stdout),"stderr":String::from_utf8_lossy(&out.stderr),"project":project,"pid":std::process::id()});
        let mut s=m.lock().map_err(|e|e.to_string())?; s.project=Some(project);s.baseline=Some(generation);s.error=None;
        if generation==s.generation{s.changed=None} s.last_result=Some(result.clone());
        Ok(result)
    })();
    let mut s=m.lock().map_err(|e|e.to_string())?;
    if let Err(e)=&result{s.error=Some(e.clone());eprintln!("CBM_UPDATE_FAILED: {e}")}
    s.indexing=false;cv.notify_all();result
}
fn answer(root:&Path, root_name:&str, shared:&Shared, line:&str)->Value {
    let result=(||->Result<Value,String>{
        let msg:Value=serde_json::from_str(line).map_err(|e|e.to_string())?;
        if msg["root"].as_str()!=Some(root_name){return Err("CBM daemon root mismatch".into())}
        let op=msg["op"].as_str().ok_or("invalid CBM operation")?;
        if !["ready","refresh","query"].contains(&op){return Err("invalid CBM operation".into())}
        let (m,cv)=&**shared;{let mut s=m.lock().map_err(|e|e.to_string())?;while !s.ready{s=cv.wait(s).map_err(|e|e.to_string())?}}
        if op=="refresh"{return refresh(root,root_name,shared)}
        let project={let mut s=m.lock().map_err(|e|e.to_string())?;while s.project.is_none()&&s.indexing{s=cv.wait(s).map_err(|e|e.to_string())?}s.project.clone()};
        let project=match project{Some(p)=>p,None=>{refresh(root,root_name,shared)?;m.lock().map_err(|e|e.to_string())?.project.clone().ok_or("missing CBM project")?}};
        let mut r=json!({"code":0,"stdout":"","stderr":"","project":project,"pid":std::process::id()});
        if op=="query"{
            let tool=msg["tool"].as_str().ok_or("invalid CBM tool")?;
            if !["search_graph","query_graph","trace_path","get_code_snippet","get_file_outline","get_graph_schema","get_architecture","search_code","check_index_coverage"].contains(&tool){return Err("unsupported read-only CBM tool".into())}
            let args=msg["args"].as_array().ok_or("CBM arguments must be CLI flags")?;
            validate_query(root,args)?;
            let mut av=vec!["cli",tool,"--project",project.as_str()];
            for a in args{av.push(a.as_str().ok_or("invalid CBM argument")?)}
            let o=run(root,"codebase-memory-mcp",&av)?;r["code"]=json!(o.status.code().unwrap_or(75));r["stdout"]=json!(String::from_utf8_lossy(&o.stdout).to_string());r["stderr"]=json!(String::from_utf8_lossy(&o.stderr).to_string());
        }
        if let Some(e)=m.lock().map_err(|e|e.to_string())?.error.clone(){r["stderr"]=json!(format!("CBM_INDEX_STALE: {e}\n{}",r["stderr"].as_str().unwrap_or("")))} Ok(r)
    })();
    result.unwrap_or_else(|e|json!({"code":75,"pid":std::process::id(),"project":shared.0.lock().ok().and_then(|s|s.project.clone()),"stdout":"","stderr":format!("CBM_BACKEND_UNAVAILABLE: {e}\n")}))
}
fn serve(mut stream:interprocess::local_socket::Stream,root:PathBuf,name:String,state:Shared){
    let mut line=Vec::new();let result=match BufReader::new(&mut stream).read_until(b'\n',&mut line){Ok(_) if line.last()==Some(&b'\n')=>answer(&root,&name,&state,&String::from_utf8_lossy(&line[..line.len()-1])),_=>json!({"code":75,"pid":std::process::id(),"project":null,"stdout":"","stderr":"CBM_BACKEND_UNAVAILABLE: request ended before newline\n"})};
    let _=stream.write_all(result.to_string().as_bytes());let _=stream.flush();
}
fn main()->Result<(),String>{
    let root_arg=PathBuf::from(env::args().nth(1).ok_or("missing root")?);
    if !root_arg.is_absolute() || !root_arg.is_dir(){return Err("root must be an existing absolute directory".into())}
    let root_name=norm(&root_arg)?;let root=fs::canonicalize(&root_arg).map_err(|e|e.to_string())?;
    let session=PathBuf::from(env::var_os("FSSEARCH_SESSION_ROOT").ok_or("missing session root")?);if norm(&session)?!=root_name{return Err("CBM daemon root mismatch".into())}
    let home=env::var_os("CODEX_HOME").map(PathBuf::from).unwrap_or_else(||PathBuf::from(env::var_os(if cfg!(windows){"USERPROFILE"}else{"HOME"}).unwrap_or_default()).join(".codex"));
    let user_home=PathBuf::from(env::var_os(if cfg!(windows){"USERPROFILE"}else{"HOME"}).unwrap_or_default());
    if norm(&user_home).ok().as_deref()==Some(&root_name) || norm(&home).ok().as_deref()==Some(&root_name) || root.parent().is_none(){return Err("root must be a project directory, not home or filesystem root".into())}
    let dir=home.join("filesystem-search/cbm").join(&sha(&root_name)[..24]);fs::create_dir_all(&dir).map_err(|e|e.to_string())?;
    let owner=Connection::open(dir.join("owner.sqlite")).map_err(|e|e.to_string())?;
    owner.busy_timeout(Duration::from_secs(5)).map_err(|e|e.to_string())?;
    if let Err(e)=owner.execute_batch("BEGIN EXCLUSIVE"){if e.to_string().contains("locked")||e.to_string().contains("busy"){return Ok(())}return Err(e.to_string())}
    let home_name=norm(&home).unwrap_or_else(|_|home.to_string_lossy().into_owned());let key=&sha(&format!("{home_name}\0{root_name}"))[..32];let sock=format!("fssearch-cbm-{key}");
    #[cfg(unix)]let socket=PathBuf::from(format!("/tmp/{sock}.sock"));#[cfg(unix)]if socket.exists(){fs::remove_file(&socket).map_err(|e|e.to_string())?}
    #[cfg(unix)]let name=socket.as_path().to_fs_name::<GenericFilePath>().map_err(|e|e.to_string())?;
    #[cfg(windows)]let name=sock.to_ns_name::<GenericNamespaced>().map_err(|e|e.to_string())?;
    let listener=ListenerOptions::new().name(name).create_sync().map_err(|e|e.to_string())?;
    #[cfg(unix)]{use std::os::unix::fs::PermissionsExt;fs::set_permissions(&socket,fs::Permissions::from_mode(0o600)).map_err(|e|e.to_string())?}
    let state:Shared=Arc::new((Mutex::new(State{ready:false,project:None,baseline:None,error:None,generation:0,changed:None,indexing:false,last_result:None}),Condvar::new()));
    let s=state.clone();let r=root.clone();let rn=root_name.clone();thread::spawn(move||{
        let (m,cv)=&*s;let callback=s.clone();let mut watcher=match notify::recommended_watcher(move|ev:notify::Result<notify::Event>|{if let Ok(mut st)=callback.0.lock(){match ev{Ok(_)=>{st.generation+=1;if st.changed.is_none(){st.changed=Some(Instant::now())}},Err(e)=>{st.error=Some(e.to_string());eprintln!("CBM_WATCH_FAILED: {e}")}}callback.1.notify_all()}}){Ok(w)=>w,Err(e)=>{eprintln!("CBM_WATCH_FAILED: {e}");std::process::exit(75)}};
        if let Err(e)=watcher.watch(&r,RecursiveMode::Recursive){eprintln!("CBM_WATCH_FAILED: {e}");std::process::exit(75)}
        let p=match identity(&r,&rn){Ok(x)=>x,Err(e)=>{eprintln!("CBM_START_FAILED: {e}");std::process::exit(75)}};if let Ok(mut st)=m.lock(){st.project=p;st.ready=true;cv.notify_all()}
        let _watcher=watcher;let _=refresh(&r,&rn,&s);
        loop{thread::sleep(Duration::from_secs(5));if norm(&r).ok().as_deref()!=Some(&rn){std::process::exit(0)}
            let pending=m.lock().map(|st|st.error.is_some()||st.changed.is_some_and(|t|t.elapsed()>=Duration::from_secs(5))).unwrap_or(false);if pending{let _=refresh(&r,&rn,&s);}
        }
    });
    for connection in listener.incoming(){if let Ok(stream)=connection{let(r,n,s)=(root.clone(),root_name.clone(),state.clone());thread::spawn(move||serve(stream,r,n,s));}}
    drop(owner);Ok(())
}
