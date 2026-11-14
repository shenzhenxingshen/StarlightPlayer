use rquickjs::{Context, Function, Runtime};
use serde_json::{json, Value};

pub const CATALOG: &str = include_str!("../../generated/catalog.json");
const SOURCE: &str = include_str!("../../generated/playback-core.js");

/// This runtime is owned by ONE actor thread, never by a WebView or an audio callback.
pub struct Core {
    context: Context,
    _runtime: Runtime,
}

impl Core {
    pub fn new() -> Result<Self, String> {
        let runtime = Runtime::new().map_err(|e| e.to_string())?;
        runtime.set_memory_limit(16 * 1024 * 1024);
        runtime.set_max_stack_size(512 * 1024);
        let context = Context::full(&runtime).map_err(|e| e.to_string())?;
        context.with(|ctx| -> Result<(), String> {
            ctx.eval::<(), _>(SOURCE).map_err(|e| e.to_string())?;
            ctx.globals().set("catalogJson", CATALOG).map_err(|e| e.to_string())?;
            // Only this fixed bridge is evaluated. User data is passed as function arguments.
            ctx.eval::<(), _>(r#"
                const tracks = JSON.parse(catalogJson);
                globalThis.callCore = function(method, payload) {
                  try {
                    const p = JSON.parse(payload);
                    let value;
                    if (method === 'initial') value = PlaybackCore.initialState(PlaybackCore.validateConfig(p, tracks));
                    else if (method === 'restore') value = PlaybackCore.restore(p, tracks);
                    else if (method === 'transition') value = PlaybackCore.transition(p.state, p.event, p.clock, tracks);
                    else if (method === 'tasks-initial') value = PlaybackCore.initialTaskBook();
                    else if (method === 'tasks-restore') value = PlaybackCore.restoreTaskBook(p, tracks);
                    else if (method === 'tasks-edit') value = PlaybackCore.editTaskBook(p.book, p.edit, p.nowMs, tracks);
                    else if (method === 'tasks-due') value = PlaybackCore.dueOccurrences(p.book, p.candidates, p.previousMs, p.nowMs);
                    else if (method === 'tasks-claim') value = PlaybackCore.claimOccurrence(p.book, p.occurrence, p.nowMs);
                    else if (method === 'task-config') value = PlaybackCore.taskConfig(PlaybackCore.validateTask(p, tracks));
                    else throw new Error('Unknown bridge method');
                    return JSON.stringify({ok: true, value});
                  } catch (e) { return JSON.stringify({ok: false, error: String(e.message)}); }
                };
            "#).map_err(|e| e.to_string())?;
            Ok(())
        })?;
        Ok(Self {
            context,
            _runtime: runtime,
        })
    }

    pub fn call(&self, method: &str, payload: &Value) -> Result<Value, String> {
        self.context.with(|ctx| {
            let function: Function = ctx.globals().get("callCore").map_err(|e| e.to_string())?;
            let result: String = function
                .call((method, payload.to_string()))
                .map_err(|e| e.to_string())?;
            let result: Value = serde_json::from_str(&result).map_err(|e| e.to_string())?;
            if result["ok"] == true {
                Ok(result["value"].clone())
            } else {
                Err(result["error"].as_str().unwrap_or("Core error").to_owned())
            }
        })
    }
}

pub fn clock() -> Value {
    use chrono::{Local, TimeZone};
    let now = Local::now();
    let local_midnight = now.date_naive().and_hms_opt(0, 0, 0).unwrap();
    // Pick the earlier midnight when ambiguous, consistent with local-day alignment.
    // Rare missing-midnight timezones use the first valid minute of that day.
    let midnight = (0..=180).find_map(|minute| {
        Local
            .from_local_datetime(&(local_midnight + chrono::Duration::minutes(minute)))
            .earliest()
    });
    json!({ "nowMs": now.timestamp_millis(), "midnightMs": midnight.unwrap_or(now).timestamp_millis(),
        "dayKey": now.format("%Y-%m-%d").to_string() })
}
