use crate::{
    core::{clock, Core, CATALOG},
    engine::{Engine, Event},
};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::{
        mpsc::{self, Receiver, SyncSender},
        Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case", deny_unknown_fields)]
pub enum Command {
    Start {
        config: Value,
    },
    Play {},
    Pause {},
    Stop {},
    Configure {
        settings: Value,
    },
    Seek {
        #[serde(rename = "positionMs")]
        position_ms: f64,
    },
    Next {},
    Previous {},
    TaskSave {
        task: Value,
    },
    TaskDelete {
        id: String,
    },
    TaskEnable {
        id: String,
        enabled: bool,
    },
    TaskPlay {
        id: String,
    },
    Preferences {
        #[serde(rename = "careMode")]
        care_mode: bool,
        #[serde(rename = "closeToBackground")]
        close_to_background: bool,
    },
    ExportDiagnostics {},
}
impl Command {
    fn value(self) -> Value {
        match self {
            Self::Start { config } => json!({"type":"start","config":config}),
            Self::Configure { settings } => json!({"type":"configure","settings":settings}),
            Self::Play {} => json!({"type":"play"}),
            Self::Pause {} => json!({"type":"pause"}),
            Self::Stop {} => json!({"type":"stop"}),
            Self::Seek { position_ms } => json!({"type":"seek","positionMs":position_ms}),
            Self::Next {} => json!({"type":"next"}),
            Self::Previous {} => json!({"type":"previous"}),
            Self::TaskSave { task } => json!({"type":"task-save","task":task}),
            Self::TaskDelete { id } => json!({"type":"task-delete","id":id}),
            Self::TaskEnable { id, enabled } => {
                json!({"type":"task-enable","id":id,"enabled":enabled})
            }
            Self::TaskPlay { id } => json!({"type":"task-play","id":id}),
            Self::Preferences {
                care_mode,
                close_to_background,
            } => {
                json!({"type":"preferences","careMode":care_mode,"closeToBackground":close_to_background})
            }
            Self::ExportDiagnostics {} => json!({"type":"export-diagnostics"}),
        }
    }
}
struct Request {
    event: Value,
    reply: mpsc::Sender<Result<Value, String>>,
}

/// OS/tray inputs, never deserializable from WebView IPC.
pub enum RemoteAction {
    Play,
    Pause,
    Toggle,
    Stop,
    Next,
    Previous,
    SeekTo(f64),
    SeekBy(f64),
}
pub struct Host {
    sender: Option<SyncSender<Request>>,
    snapshot: Arc<Mutex<Value>>,
    worker: Option<thread::JoinHandle<()>>,
}
impl Host {
    pub fn spawn(data_dir: PathBuf, null_output: bool) -> Result<Self, String> {
        Self::spawn_with_runtime(
            data_dir,
            null_output,
            crate::runtime::RuntimePaths::development()?,
        )
    }
    pub fn spawn_with_runtime(
        data_dir: PathBuf,
        null_output: bool,
        runtime: crate::runtime::RuntimePaths,
    ) -> Result<Self, String> {
        let (sender, receiver) = mpsc::sync_channel(32);
        let snapshot = Arc::new(Mutex::new(json!({})));
        let shared = snapshot.clone();
        let (ready_tx, ready_rx) = mpsc::channel();
        let worker = thread::Builder::new()
            .name("starlight-playback".into())
            .spawn(
                move || match Actor::with_runtime(data_dir, null_output, runtime) {
                    Ok(mut actor) => {
                        actor.publish(&shared);
                        let _ = ready_tx.send(Ok(()));
                        actor.run(receiver, shared);
                    }
                    Err(e) => {
                        let _ = ready_tx.send(Err(e));
                    }
                },
            )
            .map_err(|e| e.to_string())?;
        ready_rx.recv().map_err(|e| e.to_string())??;
        Ok(Self {
            sender: Some(sender),
            snapshot,
            worker: Some(worker),
        })
    }
    pub fn snapshot(&self) -> Value {
        self.snapshot
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }
    pub fn command(&self, command: Command) -> Result<Value, String> {
        let event = command.value();
        self.submit(event)
    }
    pub fn remote(&self, action: RemoteAction) -> Result<Value, String> {
        let (name, position) = match action {
            RemoteAction::Play => ("play", 0.0),
            RemoteAction::Pause => ("pause", 0.0),
            RemoteAction::Toggle => ("toggle", 0.0),
            RemoteAction::Stop => ("stop", 0.0),
            RemoteAction::Next => ("next", 0.0),
            RemoteAction::Previous => ("previous", 0.0),
            RemoteAction::SeekTo(ms) => ("seek-to", ms),
            RemoteAction::SeekBy(ms) => ("seek-by", ms),
        };
        self.submit(json!({"type":"remote","action":name,"positionMs":position}))
    }
    fn submit(&self, event: Value) -> Result<Value, String> {
        if event.to_string().len() > 4096 {
            return Err("Command too large".into());
        }
        let (reply, rx) = mpsc::channel();
        self.sender
            .as_ref()
            .ok_or("Player closed")?
            .try_send(Request { event, reply })
            .map_err(|_| "Player busy or closed; command not queued".to_owned())?;
        // Called in Tauri spawn_blocking, not on the UI thread. No ambiguous timeout/retry.
        rx.recv().map_err(|e| e.to_string())?
    }
}
impl Drop for Host {
    fn drop(&mut self) {
        // Close the channel before joining; release the data lock and audio handle deterministically.
        self.sender.take();
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

pub fn persist(file: &Path, state: &Value) -> Result<(), String> {
    let temporary = file.with_extension("pending");
    let mut output = File::create(&temporary).map_err(|e| e.to_string())?;
    output
        .write_all(state.to_string().as_bytes())
        .map_err(|e| e.to_string())?;
    output.sync_all().map_err(|e| e.to_string())?;
    drop(output);
    fs::rename(temporary, file).map_err(|e| e.to_string())?;
    Ok(())
}

struct Actor {
    core: Core,
    engine: Engine,
    state: Value,
    catalog: Vec<Value>,
    data_file: PathBuf,
    log: File,
    started: Instant,
    _data_lock: File,
    entries: HashMap<i64, u64>,
    active_entry: Option<i64>,
    verified: HashSet<String>,
    asset_dir: PathBuf,
    last_sample: Instant,
    last_trace: Instant,
    task_book: Value,
    desktop_file: PathBuf,
    preferences: Value,
    recent_logs: VecDeque<Value>,
    last_schedule: Instant,
    last_wall: i64,
    last_midnight: i64,
    expected_playing: bool,
    retry_at: Option<Instant>,
    retry_attempt: usize,
    last_motion: Instant,
    last_position: f64,
    healthy_since: Option<Instant>,
    log_bytes: u64,
}
impl Actor {
    #[cfg(test)]
    fn new(data_dir: PathBuf, null_output: bool) -> Result<Self, String> {
        Self::with_runtime(
            data_dir,
            null_output,
            crate::runtime::RuntimePaths::development()?,
        )
    }
    fn with_runtime(
        data_dir: PathBuf,
        null_output: bool,
        runtime: crate::runtime::RuntimePaths,
    ) -> Result<Self, String> {
        fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
        let data_lock = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(data_dir.join("playback.lock"))
            .map_err(|e| e.to_string())?;
        data_lock
            .try_lock()
            .map_err(|_| "This playback data directory is already in use".to_owned())?;
        let data_file = data_dir.join("playback-v1.json");
        let core = Core::new()?;
        let state = if data_file.exists() {
            if fs::metadata(&data_file).map_err(|e| e.to_string())?.len() > 4 * 1024 * 1024 {
                return Err("Saved state too large; retained for diagnosis".into());
            }
            let bytes = fs::read(&data_file).map_err(|e| e.to_string())?;
            core.call(
                "restore",
                &serde_json::from_slice(&bytes).map_err(|e| e.to_string())?,
            )?
        } else {
            // Match a fresh mobile installation; test scenarios pass their own config.
            let catalog: Vec<Value> = serde_json::from_str(CATALOG).map_err(|e| e.to_string())?;
            let first = catalog.first().ok_or("Empty track catalog")?;
            core.call(
                "initial",
                &json!({"trackId":first["id"],"repeatCount":1,"mode":"repeat-one","sync":true}),
            )?
        };
        let desktop_file = data_dir.join("desktop-v1.json");
        let (task_book, preferences) = if desktop_file.exists() {
            if fs::metadata(&desktop_file)
                .map_err(|e| e.to_string())?
                .len()
                > 4 * 1024 * 1024
            {
                return Err("Desktop settings too large; retained for diagnosis".into());
            }
            let saved: Value =
                serde_json::from_slice(&fs::read(&desktop_file).map_err(|e| e.to_string())?)
                    .map_err(|e| e.to_string())?;
            if saved["version"] != 1
                || !saved["preferences"]["careMode"].is_boolean()
                || !saved["preferences"]["closeToBackground"].is_boolean()
            {
                return Err("Invalid desktop settings; retained for diagnosis".into());
            }
            (
                core.call("tasks-restore", &saved["tasks"])?,
                saved["preferences"].clone(),
            )
        } else {
            (
                core.call("tasks-initial", &json!({}))?,
                json!({"careMode":false,"closeToBackground":true,"initialized":false}),
            )
        };
        let log_path = data_dir.join("playback.jsonl");
        if fs::metadata(&log_path).is_ok_and(|m| m.len() > 20 * 1024 * 1024) {
            // Preserve a bounded previous log. These are application-owned diagnostic files.
            fs::rename(&log_path, data_dir.join("playback.previous.jsonl"))
                .map_err(|e| e.to_string())?;
        }
        let log = OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_path)
            .map_err(|e| e.to_string())?;
        let log_bytes = log.metadata().map_err(|e| e.to_string())?.len();
        let engine = Engine::new(&runtime.library, null_output)?;
        let asset_dir = runtime.audio;
        let mut actor = Self {
            core,
            engine,
            state,
            catalog: serde_json::from_str(CATALOG).map_err(|e| e.to_string())?,
            data_file,
            log,
            started: Instant::now(),
            _data_lock: data_lock,
            entries: HashMap::new(),
            active_entry: None,
            verified: HashSet::new(),
            asset_dir,
            last_sample: Instant::now(),
            last_trace: Instant::now(),
            task_book,
            desktop_file,
            preferences,
            recent_logs: VecDeque::new(),
            last_schedule: Instant::now(),
            last_wall: clock()["nowMs"].as_i64().unwrap_or(0),
            last_midnight: clock()["midnightMs"].as_i64().unwrap_or(0),
            expected_playing: false,
            retry_at: None,
            retry_attempt: 0,
            last_motion: Instant::now(),
            last_position: 0.0,
            healthy_since: None,
            log_bytes,
        };
        actor.trace(
            "host-start",
            json!({"nullOutput":null_output,"restored":actor.state}),
        );
        Ok(actor)
    }
    fn generation(&self) -> u64 {
        self.state["generation"].as_u64().unwrap_or(0)
    }
    fn trace(&mut self, kind: &str, data: Value) {
        let record = json!({"kind":kind,"clock":clock(),"monotonicMs":self.started.elapsed().as_secs_f64()*1000.0,
            "generation":self.generation(),"trackId":self.state["config"]["trackId"],"data":data});
        self.recent_logs.push_back(record.clone());
        if self.recent_logs.len() > 30 {
            self.recent_logs.pop_front();
        }
        // Runtime rotation, not only on the next launch. Two bounded app-owned files.
        if self.log_bytes >= 20 * 1024 * 1024 {
            if let Err(e) = self.rotate_log() {
                eprintln!("Diagnostic rotation failed: {e}");
            }
        }
        if let Err(e) = writeln!(self.log, "{record}") {
            eprintln!("Diagnostic write failed: {e}");
        } else {
            self.log_bytes += record.to_string().len() as u64 + 1;
        }
    }
    fn rotate_log(&mut self) -> Result<(), String> {
        let directory = self.data_file.parent().ok_or("No data directory")?;
        self.log.flush().map_err(|e| e.to_string())?;
        // Copy then truncate the open file: also works on Windows where renaming
        // an open file is not always permitted.
        fs::copy(
            directory.join("playback.jsonl"),
            directory.join("playback.previous.jsonl"),
        )
        .map_err(|e| e.to_string())?;
        self.log.set_len(0).map_err(|e| e.to_string())?;
        self.log_bytes = 0;
        Ok(())
    }
    fn save_desktop(&self, tasks: &Value, preferences: &Value) -> Result<(), String> {
        persist(
            &self.desktop_file,
            &json!({"version":1,"tasks":tasks,"preferences":preferences}),
        )
    }
    fn task_event(&self, id: &str) -> Result<Value, String> {
        let task = self.task_book["tasks"]
            .as_array()
            .ok_or("Invalid tasks")?
            .iter()
            .find(|t| t["id"] == id)
            .ok_or("任务不存在")?;
        Ok(json!({"type":"start","config":self.core.call("task-config", task)?}))
    }
    fn export_diagnostics(&mut self) -> Result<Value, String> {
        let directory = self.data_file.parent().ok_or("No data directory")?;
        let exports = directory.join("exports");
        fs::create_dir_all(&exports).map_err(|e| e.to_string())?;
        let name = format!(
            "Starlight-diagnostics-{}.txt",
            chrono::Local::now().format("%Y%m%d-%H%M%S-%f")
        );
        let path = exports.join(name);
        let mut output = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(|e| e.to_string())?;
        writeln!(output, "星光播放器 · 桌面诊断\n版本: {}\n平台: {} {}\n时间: {}\n状态: {}\n任务: {}\n设置: {}\n",
            env!("CARGO_PKG_VERSION"), std::env::consts::OS, std::env::consts::ARCH,
            clock(), self.state, self.task_book, self.preferences).map_err(|e| e.to_string())?;
        self.log.flush().map_err(|e| e.to_string())?;
        for file in ["playback.previous.jsonl", "playback.jsonl"] {
            let source = directory.join(file);
            if source.exists() {
                writeln!(output, "\n--- {file} ---").map_err(|e| e.to_string())?;
                std::io::copy(
                    &mut File::open(source).map_err(|e| e.to_string())?,
                    &mut output,
                )
                .map_err(|e| e.to_string())?;
            }
        }
        output.sync_all().map_err(|e| e.to_string())?;
        self.trace("diagnostics-exported", json!({"filename":path.file_name()}));
        Ok(json!({"path":path}))
    }
    fn dispatch(&mut self, mut event: Value) -> Result<Value, String> {
        if event["type"] == "remote" {
            let action = event["action"].as_str().ok_or("Invalid remote action")?;
            self.trace("remote-command", event.clone());
            if self.preferences["careMode"] == true
                && !["play", "pause", "toggle"].contains(&action)
            {
                return Err("关怀模式下系统媒体控制仅支持播放/暂停".into());
            }
            event = match action {
                "toggle" => json!({"type":if self.expected_playing { "pause" } else { "play" }}),
                "seek-to" | "seek-by" => {
                    if self.state["config"]["sync"] == true {
                        return Err("同步模式不可拖动进度".into());
                    }
                    let amount = event["positionMs"].as_f64().ok_or("Invalid seek")?;
                    let target = if action == "seek-by" {
                        let duration = self
                            .catalog
                            .iter()
                            .find(|t| t["id"] == self.state["config"]["trackId"])
                            .and_then(|t| t["durationMs"].as_f64())
                            .ok_or("Unknown track")?;
                        (self.state["positionMs"].as_f64().unwrap_or(0.0) + amount)
                            .clamp(0.0, duration)
                    } else {
                        amount
                    };
                    json!({"type":"seek","positionMs":target})
                }
                "play" | "pause" | "stop" | "next" | "previous" => json!({"type":action}),
                _ => return Err("Unsupported remote action".into()),
            };
        }
        match event["type"].as_str().unwrap_or("") {
            "export-diagnostics" => return self.export_diagnostics(),
            "task-save" | "task-delete" | "task-enable" => {
                let tasks = self.core.call(
                    "tasks-edit",
                    &json!({"book":self.task_book,"edit":event,"nowMs":clock()["nowMs"]}),
                )?;
                self.save_desktop(&tasks, &self.preferences)?;
                self.task_book = tasks;
                self.trace("task-edited", event);
                return Ok(self.task_book.clone());
            }
            "preferences" => {
                let prefs = json!({"careMode":event["careMode"],
                    "closeToBackground":event["closeToBackground"],"initialized":true});
                self.save_desktop(&self.task_book, &prefs)?;
                self.preferences = prefs;
                return Ok(self.preferences.clone());
            }
            "task-play" => {
                event = self.task_event(event["id"].as_str().ok_or("Invalid task ID")?)?;
                self.trace("task-manual", event.clone());
            }
            "next" | "previous" => {
                let offset = if event["type"] == "next" {
                    1
                } else {
                    self.catalog.len() - 1
                };
                let index = self
                    .catalog
                    .iter()
                    .position(|t| t["id"] == self.state["config"]["trackId"])
                    .ok_or("Unknown active track")?;
                let mut config = self.state["config"].clone();
                config["trackId"] =
                    self.catalog[(index + offset) % self.catalog.len()]["id"].clone();
                event = json!({"type":"start","config":config});
            }
            _ => {}
        }
        // Validate before changing intent or any native state.
        self.core.call(
            "transition",
            &json!({"state":self.state,"event":event,"clock":clock()}),
        )?;
        match event["type"].as_str().unwrap_or("") {
            "pause" | "stop" => {
                self.expected_playing = false;
                self.retry_at = None;
            }
            "start" | "play" => {
                self.expected_playing = true;
                self.retry_at = None;
                self.retry_attempt = 0;
                self.last_motion = Instant::now();
            }
            _ => {}
        }
        if let Err(e) = self.apply(event) {
            self.fail(e.clone());
            return Err(e);
        }
        Ok(self.state.clone())
    }
    fn audio_path(&mut self, id: &str) -> Result<PathBuf, String> {
        let track = self
            .catalog
            .iter()
            .find(|t| t["id"] == id)
            .ok_or("Unknown asset ID")?;
        let filename = track["audioUrl"].as_str().ok_or("Invalid catalog")?;
        let path = self
            .asset_dir
            .join(filename)
            .canonicalize()
            .map_err(|e| e.to_string())?;
        if !path.starts_with(&self.asset_dir) {
            return Err("Asset outside approved directory".into());
        }
        if !self.verified.contains(id) {
            let hash = format!(
                "{:x}",
                Sha256::digest(fs::read(&path).map_err(|e| e.to_string())?)
            );
            if track["sha256"] != hash {
                return Err("Asset hash changed; regenerate verified catalog".into());
            }
            self.verified.insert(id.into());
        }
        Ok(path)
    }
    fn apply(&mut self, event: Value) -> Result<(), String> {
        let transition = self.core.call(
            "transition",
            &json!({"state":self.state,"event":event,"clock":clock()}),
        )?;
        let next = transition["state"].clone();
        let effects = transition["effects"]
            .as_array()
            .ok_or("Invalid core effects")?
            .clone();
        // User seek must succeed before its new counting eligibility is durable.
        for effect in &effects {
            if effect["type"] == "seek" {
                self.engine
                    .seek(effect["positionMs"].as_f64().ok_or("Invalid seek effect")?)?;
            }
        }
        if next != self.state {
            persist(&self.data_file, &next)?;
        }
        self.state = next;
        if self.state["status"] == "complete" || self.state["status"] == "idle" {
            self.expected_playing = false;
            self.retry_at = None;
        }
        if self.state["status"] == "error" {
            self.schedule_retry();
        }
        self.trace(
            "transition",
            json!({"event":event,"effects":effects,"state":self.state}),
        );
        for effect in effects {
            match effect["type"].as_str().unwrap_or("") {
                "load" => {
                    let path =
                        self.audio_path(effect["trackId"].as_str().ok_or("Invalid asset ID")?)?;
                    self.engine.stop()?;
                    // Single-entry baseline: superseded events are discarded before a new load.
                    while self.engine.event(0.0).is_some() {}
                    self.entries.clear();
                    self.active_entry = None;
                    let entry = self.engine.load(&path)?;
                    self.entries.insert(entry, self.generation());
                    self.last_motion = Instant::now();
                    self.last_position = 0.0;
                    self.trace("load-requested", json!({"entry":entry}));
                }
                "seek-play" => {
                    let target = effect["positionMs"].as_f64().ok_or("Invalid seek effect")?;
                    self.engine.seek(target)?;
                    self.engine.pause(false)?;
                    self.apply(json!({"type":"started","generation":effect["generation"],
                        "positionMs":target,"eligible":effect["eligible"]}))?;
                }
                "pause" => self.engine.pause(true)?,
                "resume" => self.engine.pause(false)?,
                "stop" => self.engine.stop()?,
                "seek" => {}
                _ => return Err("Unknown effect".into()),
            }
        }
        Ok(())
    }
    fn fail(&mut self, error: String) {
        self.healthy_since = None;
        let _ = self.engine.stop();
        self.state["status"] = json!("error");
        self.state["eligible"] = json!(false);
        self.state["error"] = json!(error);
        let _ = persist(&self.data_file, &self.state);
        self.trace("failure", json!({"message":error}));
        self.schedule_retry();
    }
    fn schedule_retry(&mut self) {
        self.healthy_since = None;
        if !self.expected_playing || self.retry_at.is_some() {
            return;
        }
        if self.retry_attempt >= 3 {
            self.expected_playing = false;
            self.trace("recovery-exhausted", json!({}));
            return;
        }
        let delay = [1500, 3000, 6000][self.retry_attempt];
        self.retry_at = Some(Instant::now() + Duration::from_millis(delay));
        self.trace(
            "recovery-scheduled",
            json!({"attempt":self.retry_attempt + 1,"delayMs":delay}),
        );
    }
    fn observe_position(&mut self, position: f64) {
        if !position.is_finite() {
            return;
        }
        self.state["positionMs"] = json!((position * 1000.0).max(0.0));
        if (position - self.last_position).abs() > 0.05 {
            self.last_motion = Instant::now();
            self.last_position = position;
            if self.state["status"] == "playing" && self.retry_at.is_none() {
                let since = self.healthy_since.get_or_insert_with(Instant::now);
                if since.elapsed() >= Duration::from_secs(10) {
                    self.retry_attempt = 0;
                }
            }
        }
    }
    fn tick_recovery(&mut self) {
        if self.expected_playing
            && self.retry_at.is_none()
            && ["playing", "loading"].contains(&self.state["status"].as_str().unwrap_or(""))
            && self.last_motion.elapsed() > Duration::from_secs(20)
        {
            self.fail("Playback watchdog: no progress for 20 seconds".into());
        }
        if self.retry_at.is_some_and(|at| Instant::now() >= at) {
            self.retry_at = None;
            if self.expected_playing {
                self.retry_attempt += 1;
                self.trace("recovery-attempt", json!({"attempt":self.retry_attempt}));
                self.last_motion = Instant::now();
                if let Err(e) = self.apply(json!({"type":"play"})) {
                    self.fail(e);
                }
            }
        }
    }
    fn tick_schedule(&mut self) -> Result<(), String> {
        let now = chrono::Local::now();
        let clock_value = clock();
        let wall = now.timestamp_millis();
        let midnight = clock_value["midnightMs"].as_i64().unwrap_or(0);
        let elapsed = self.last_schedule.elapsed().as_millis() as i64;
        let jumped = (wall - self.last_wall - elapsed).abs() > 2000
            || elapsed > 5000
            || midnight != self.last_midnight;
        if jumped {
            self.trace(
                "clock-or-wake",
                json!({"previousMs":self.last_wall,"nowMs":wall,"elapsedMs":elapsed}),
            );
            // Never resume a user-paused player on wake.
            if self.state["status"] == "playing" {
                if let Err(e) = self.apply(json!({"type":"discontinuity"})) {
                    self.fail(e.clone());
                    return Err(e);
                }
            }
        }
        let due = self.core.call("tasks-due", &json!({
            "book":self.task_book,"candidates":crate::schedule::candidates(&self.task_book["tasks"], now),
            "previousMs":self.last_wall,"nowMs":wall
        }))?;
        for occurrence in due.as_array().ok_or("Invalid task decisions")? {
            let claimed = self.core.call(
                "tasks-claim",
                &json!({"book":self.task_book,"occurrence":occurrence,"nowMs":wall}),
            )?;
            // At-most-once claim is durable before audio starts; a process crash
            // here may miss this occurrence, but will not restart it twice.
            self.save_desktop(&claimed, &self.preferences)?;
            self.task_book = claimed;
            let id = occurrence["taskId"].as_str().ok_or("Invalid task ID")?;
            let event = self.task_event(id)?;
            self.trace("task-automatic", json!({"occurrence":occurrence,"delayMs":wall-occurrence["scheduledAt"].as_i64().unwrap_or(wall)}));
            // A playback failure must not starve later due occurrences. The claim
            // is already durable; normal bounded playback recovery handles it.
            if let Err(e) = self.dispatch(event) {
                self.trace("task-playback-error", json!({"taskId":id,"message":e}));
            }
        }
        self.last_wall = wall;
        self.last_midnight = midnight;
        self.last_schedule = Instant::now();
        Ok(())
    }
    fn native_event(&mut self, event: Event) -> Result<(), String> {
        match event {
            Event::Start(entry) => {
                self.active_entry = self.entries.contains_key(&entry).then_some(entry);
                self.trace("native-start", json!({"entry":entry,"accepted":self.active_entry.is_some()}));
            }
            Event::Loaded => {
                if let Some(generation) = self.active_entry.and_then(|e| self.entries.get(&e)).copied() {
                    self.trace("native-loaded", json!({"duration":self.engine.number("duration")}));
                    self.apply(json!({"type":"loaded","generation":generation}))?;
                }
            }
            Event::End { reason, error, entry } => {
                self.trace("native-end", json!({"entry":entry,"reason":reason,"error":error,"positionMs":self.state["positionMs"]}));
                if let Some(generation) = self.entries.remove(&entry) {
                    self.apply(json!({"type":"ended","generation":generation,
                        "positionMs":self.state["positionMs"],"reason":if reason == 0 {"eof"} else if reason == 2 {"stop"} else {"error"}}))?;
                }
            }
            Event::Restart => self.trace("native-playback-restart", json!({
                "position":self.engine.number("time-pos"),"audioPts":self.engine.number("audio-pts")})),
            Event::Other(24) => return Err("libmpv event queue overflow".into()),
            Event::Other(_) => {},
        }
        Ok(())
    }
    fn publish(&self, snapshot: &Arc<Mutex<Value>>) {
        *snapshot.lock().unwrap_or_else(|e| e.into_inner()) = json!({
            "state":self.state,"tracks":self.catalog,"engine":"libmpv · shared TS / QuickJS","preview":true,
            "tasks":self.task_book["tasks"],"preferences":self.preferences,"recentLogs":self.recent_logs,
            "platform":format!("{} {}",std::env::consts::OS,std::env::consts::ARCH),
            "dayKey":clock()["dayKey"],"recovering":self.retry_at.is_some()
        });
    }
    fn run(&mut self, receiver: Receiver<Request>, snapshot: Arc<Mutex<Value>>) {
        loop {
            // All engine calls, UI requests and core transitions are serialized here.
            // Handle wake/time discontinuities BEFORE consuming possibly old EOFs.
            if self.last_schedule.elapsed() >= Duration::from_millis(250) {
                if let Err(e) = self.tick_schedule() {
                    self.trace("scheduler-error", json!({"message":e}));
                    self.last_schedule = Instant::now();
                }
            }
            if let Some(position) = self.engine.number("time-pos") {
                self.observe_position(position);
            }
            for _ in 0..64 {
                let Some(event) = self.engine.event(0.0) else {
                    break;
                };
                if let Err(e) = self.native_event(event) {
                    self.fail(e);
                }
            }
            match receiver.recv_timeout(Duration::from_millis(10)) {
                Ok(request) => {
                    let result = self.dispatch(request.event);
                    self.publish(&snapshot);
                    let _ = request.reply.send(result);
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    let _ = self.engine.stop();
                    break;
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {}
            }
            self.tick_recovery();
            if self.last_sample.elapsed() >= Duration::from_millis(100) {
                self.publish(&snapshot);
                self.last_sample = Instant::now();
            }
            if self.last_trace.elapsed() >= Duration::from_secs(1)
                && self.state["status"] == "playing"
            {
                self.trace("progress", json!({"positionMs":self.state["positionMs"],
                    "audioPts":self.engine.number("audio-pts"),"completedCount":self.state["completedCount"]}));
                self.last_trace = Instant::now();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "Requires local libmpv/assets; deterministic fault injection with null audio output"]
    fn native_actor_recovery_and_log_rotation() {
        let directory = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../test-results")
            .join(format!(
                "native-recovery-{}",
                chrono::Utc::now().timestamp_nanos_opt().unwrap()
            ));
        let mut actor = Actor::new(directory.clone(), true).unwrap();
        actor
            .dispatch(json!({"type":"start","config":{
                "trackId":"a05","repeatCount":7,"mode":"play-one","sync":false
            }}))
            .unwrap();
        actor
            .apply(json!({"type":"started","generation":actor.generation(),
            "positionMs":0,"eligible":true}))
            .unwrap();
        actor.state["sessionCount"] = json!(3);
        actor.state["completedCount"] = json!(3);

        // Deterministic stalled progress: exercise the real host/native path,
        // but do not wait twenty seconds or emit sound.
        actor.last_motion = Instant::now() - Duration::from_secs(21);
        actor.tick_recovery();
        assert_eq!(actor.state["status"], "error");
        assert_eq!(actor.state["eligible"], false);
        assert!(actor.retry_at.is_some());
        assert_eq!(actor.recent_logs.back().unwrap()["data"]["delayMs"], 1500);
        let timer = actor.retry_at;
        actor.schedule_retry();
        actor.tick_recovery();
        assert_eq!(
            actor.retry_at, timer,
            "Repeated error must not enqueue duplicate recovery"
        );
        assert_eq!(actor.retry_attempt, 0, "Not due yet");
        for attempt in 1..=3 {
            actor.retry_at = Some(Instant::now() - Duration::from_millis(1));
            actor.tick_recovery();
            assert_eq!(actor.retry_attempt, attempt);
            assert_eq!(actor.state["status"], "loading");
            assert_eq!(
                actor.state["completedCount"], 3,
                "Retry must preserve completed cycles"
            );
            assert_eq!(actor.state["sessionCount"], 3);
            actor.fail("injected repeated engine failure".into());
            if attempt < 3 {
                assert_eq!(
                    actor.recent_logs.back().unwrap()["data"]["delayMs"],
                    [3000, 6000][attempt - 1]
                );
            }
        }
        assert!(!actor.expected_playing && actor.retry_at.is_none());
        assert_eq!(
            actor.recent_logs.back().unwrap()["kind"],
            "recovery-exhausted"
        );

        // Manual play grants a fresh retry budget. User pause/stop always cancel it.
        for command in ["pause", "stop"] {
            actor.dispatch(json!({"type":"play"})).unwrap();
            assert_eq!(actor.retry_attempt, 0);
            actor.fail("injected failure before user cancellation".into());
            actor.dispatch(json!({"type":command})).unwrap();
            assert!(!actor.expected_playing && actor.retry_at.is_none());
            let generation = actor.generation();
            actor.last_motion = Instant::now() - Duration::from_secs(21);
            actor.tick_recovery();
            assert_eq!(
                actor.generation(),
                generation,
                "Must not restart after user cancellation"
            );
        }
        actor.dispatch(json!({"type":"play"})).unwrap();
        actor
            .apply(json!({"type":"started","generation":actor.generation(),
            "positionMs":0,"eligible":true}))
            .unwrap();
        actor.retry_attempt = 2;
        actor.healthy_since = Some(Instant::now() - Duration::from_secs(11));
        actor.observe_position(0.1);
        assert_eq!(
            actor.retry_attempt, 0,
            "Healthy playback resets recovery budget"
        );
        let position = actor.state["positionMs"].clone();
        actor.observe_position(f64::NAN);
        assert_eq!(actor.state["positionMs"], position);
        actor.dispatch(json!({"type":"pause"})).unwrap();
        actor.last_motion = Instant::now() - Duration::from_secs(21);
        actor.tick_recovery();
        assert_eq!(actor.state["status"], "paused", "Pause is not a stall");

        // Force the size boundary without generating a 20 MiB test fixture.
        actor.log_bytes = 20 * 1024 * 1024;
        actor.trace("after-rotation", json!({}));
        let old = fs::read_to_string(directory.join("playback.previous.jsonl")).unwrap();
        assert!(old.contains("recovery-exhausted"));
        let current = fs::read_to_string(directory.join("playback.jsonl")).unwrap();
        assert!(current.contains("after-rotation") && !current.contains("host-start"));
        for _ in 0..40 {
            actor.trace("bounded-recent", json!({}));
        }
        assert_eq!(actor.recent_logs.len(), 30);
        let exported = actor.export_diagnostics().unwrap();
        let exported = fs::read_to_string(exported["path"].as_str().unwrap()).unwrap();
        assert!(exported.contains("recovery-exhausted") && exported.contains("after-rotation"));
        actor.dispatch(json!({"type":"stop"})).unwrap();
        println!("Recovery evidence: {}", directory.display());
    }
}
