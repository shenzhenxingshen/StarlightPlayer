//! Minimal libmpv client API 2.x wrapper. All calls stay on its owning thread.
//! No arbitrary commands or library paths are exposed through the UI.
use libloading::Library;
use std::{
    ffi::{c_char, c_int, c_ulong, c_void, CString},
    path::{Path, PathBuf},
    ptr,
};

#[repr(C)]
struct RawEvent {
    id: c_int,
    error: c_int,
    userdata: u64,
    data: *mut c_void,
}
#[repr(C)]
struct EndFile {
    reason: c_int,
    error: c_int,
    entry: i64,
    insert_id: i64,
    insert_count: c_int,
}
type Create = unsafe extern "C" fn() -> *mut c_void;
type Initialize = unsafe extern "C" fn(*mut c_void) -> c_int;
type Destroy = unsafe extern "C" fn(*mut c_void);
type Set = unsafe extern "C" fn(*mut c_void, *const c_char, *const c_char) -> c_int;
type Command = unsafe extern "C" fn(*mut c_void, *const *const c_char) -> c_int;
type Get = unsafe extern "C" fn(*mut c_void, *const c_char, c_int, *mut c_void) -> c_int;
type Wait = unsafe extern "C" fn(*mut c_void, f64) -> *const RawEvent;

#[derive(Debug)]
pub enum Event {
    Start(i64),
    Loaded,
    End { reason: i32, error: i32, entry: i64 },
    Restart,
    Other(i32),
}

pub struct Engine {
    handle: *mut c_void,
    destroy: Destroy,
    command: Command,
    set: Set,
    get: Get,
    wait: Wait,
    _library: Library,
}

fn checked(code: i32) -> Result<(), String> {
    if code < 0 {
        Err(format!("libmpv error {code}"))
    } else {
        Ok(())
    }
}
fn text(value: &str) -> Result<CString, String> {
    CString::new(value).map_err(|_| "Invalid native string".into())
}

pub fn development_library() -> Result<PathBuf, String> {
    // Explicit trusted developer input only; never resolved from current directory or UI.
    if let Some(value) = std::env::var_os("STARLIGHT_LIBMPV") {
        let path = PathBuf::from(value);
        if !path.is_absolute() || !path.is_file() {
            return Err("STARLIGHT_LIBMPV must be an absolute library file".into());
        }
        return path.canonicalize().map_err(|e| e.to_string());
    }
    for candidate in [
        "/opt/homebrew/opt/mpv/lib/libmpv.2.dylib",
        "/usr/local/opt/mpv/lib/libmpv.2.dylib",
    ] {
        if Path::new(candidate).is_file() {
            return Ok(PathBuf::from(candidate));
        }
    }
    Err("Development libmpv not found. Configure an absolute STARLIGHT_LIBMPV path.".into())
}

impl Engine {
    pub fn new(library_path: &Path, null_output: bool) -> Result<Self, String> {
        // SAFETY: library path is trusted host configuration, symbols use documented client.h ABI.
        // Library outlives every function pointer and the mpv handle.
        unsafe {
            #[cfg(not(target_os = "windows"))]
            let library = Library::new(library_path).map_err(|e| e.to_string())?;
            // Resolve the DLL's siblings without adding CWD/PATH to the search path.
            #[cfg(target_os = "windows")]
            let library: Library = {
                let module = libloading::os::windows::Library::load_with_flags(
                    library_path,
                    0x00000100 | 0x00001000, // DLL_LOAD_DIR | DEFAULT_DIRS
                )
                .map_err(|e| e.to_string())?;
                // Keep the native module (and its dependency graph) for the process lifetime.
                // The Windows FFmpeg/GGML stack installs process-wide C++ handlers: unloading
                // and reloading it caused GGML_ASSERT during the installed-runtime restart test.
                // Engine::drop still destroys each mpv handle and releases its playback resources.
                // Pinning does not accumulate modules when the same trusted path is reopened.
                module.pin().map_err(|e| e.to_string())?;
                module.into()
            };
            let version = library
                .get::<unsafe extern "C" fn() -> c_ulong>(b"mpv_client_api_version\0")
                .map_err(|e| e.to_string())?();
            if version >> 16 != 2 {
                return Err("Unsupported libmpv client ABI (requires 2.x)".into());
            }
            let create = *library
                .get::<Create>(b"mpv_create\0")
                .map_err(|e| e.to_string())?;
            let initialize = *library
                .get::<Initialize>(b"mpv_initialize\0")
                .map_err(|e| e.to_string())?;
            let option = *library
                .get::<Set>(b"mpv_set_option_string\0")
                .map_err(|e| e.to_string())?;
            let mut engine = Self {
                handle: ptr::null_mut(),
                destroy: *library
                    .get::<Destroy>(b"mpv_terminate_destroy\0")
                    .map_err(|e| e.to_string())?,
                command: *library
                    .get::<Command>(b"mpv_command\0")
                    .map_err(|e| e.to_string())?,
                set: *library
                    .get::<Set>(b"mpv_set_property_string\0")
                    .map_err(|e| e.to_string())?,
                get: *library
                    .get::<Get>(b"mpv_get_property\0")
                    .map_err(|e| e.to_string())?,
                wait: *library
                    .get::<Wait>(b"mpv_wait_event\0")
                    .map_err(|e| e.to_string())?,
                _library: library,
            };
            engine.handle = create();
            if engine.handle.is_null() {
                return Err("mpv_create failed".into());
            }
            for (key, value) in [
                ("config", "no"),
                ("load-scripts", "no"),
                ("terminal", "no"),
                ("input-default-bindings", "no"),
                ("input-vo-keyboard", "no"),
                ("vid", "no"),
                ("idle", "yes"),
                ("keep-open", "no"),
                ("gapless-audio", "yes"),
                ("pause", "yes"),
            ] {
                checked(option(
                    engine.handle,
                    text(key)?.as_ptr(),
                    text(value)?.as_ptr(),
                ))?;
            }
            if null_output {
                checked(option(
                    engine.handle,
                    text("ao")?.as_ptr(),
                    text("null")?.as_ptr(),
                ))?;
            }
            checked(initialize(engine.handle))?;
            Ok(engine)
        }
    }
    fn command(&self, parts: &[&str]) -> Result<(), String> {
        let strings: Vec<CString> = parts.iter().map(|p| text(p)).collect::<Result<_, _>>()?;
        let mut pointers: Vec<*const c_char> = strings.iter().map(|s| s.as_ptr()).collect();
        pointers.push(ptr::null());
        // SAFETY: strings and null-terminated argv live throughout synchronous mpv_command.
        unsafe { checked((self.command)(self.handle, pointers.as_ptr())) }
    }
    pub fn pause(&self, paused: bool) -> Result<(), String> {
        unsafe {
            checked((self.set)(
                self.handle,
                text("pause")?.as_ptr(),
                text(if paused { "yes" } else { "no" })?.as_ptr(),
            ))
        }
    }
    pub fn load(&self, path: &Path) -> Result<i64, String> {
        self.pause(true)?;
        self.command(&[
            "loadfile",
            path.to_str().ok_or("Invalid audio path")?,
            "replace",
        ])?;
        // loadfile updates the playlist synchronously, decoding is asynchronous.
        // Capture its actual ID; a delayed START_FILE must never inherit a newer generation.
        let mut entry = 0i64;
        unsafe {
            checked((self.get)(
                self.handle,
                text("playlist/0/id")?.as_ptr(),
                4,
                (&mut entry as *mut i64).cast(),
            ))?;
        }
        Ok(entry)
    }
    pub fn stop(&self) -> Result<(), String> {
        self.command(&["stop"])
    }
    pub fn seek(&self, millis: f64) -> Result<(), String> {
        if !millis.is_finite() || millis < 0.0 {
            return Err("Invalid seek".into());
        }
        self.command(&["seek", &format!("{:.6}", millis / 1000.0), "absolute+exact"])
    }
    pub fn number(&self, property: &str) -> Option<f64> {
        let name = text(property).ok()?;
        let mut value = 0.0f64;
        // MPV_FORMAT_DOUBLE = 5; output is copied by libmpv.
        let result = unsafe {
            (self.get)(
                self.handle,
                name.as_ptr(),
                5,
                (&mut value as *mut f64).cast(),
            )
        };
        (result >= 0 && value.is_finite()).then_some(value)
    }
    pub fn event(&self, timeout: f64) -> Option<Event> {
        // Event data remains valid only until the next wait; copy it immediately.
        unsafe {
            let raw = (self.wait)(self.handle, timeout).as_ref()?;
            match raw.id {
                0 => None,
                6 if !raw.data.is_null() => Some(Event::Start(*raw.data.cast::<i64>())),
                7 if !raw.data.is_null() => {
                    let end = &*raw.data.cast::<EndFile>();
                    Some(Event::End {
                        reason: end.reason,
                        error: end.error,
                        entry: end.entry,
                    })
                }
                8 => Some(Event::Loaded),
                21 => Some(Event::Restart),
                id => Some(Event::Other(id)),
            }
        }
    }
}
impl Drop for Engine {
    fn drop(&mut self) {
        if !self.handle.is_null() {
            unsafe { (self.destroy)(self.handle) };
        }
    }
}
