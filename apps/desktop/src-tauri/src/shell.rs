//! Desktop-only adapters. All playback decisions still execute on Host's single actor.
use souvlaki::{
    MediaControlEvent as MediaEvent, MediaControls, MediaMetadata, MediaPlayback, MediaPosition,
    PlatformConfig, SeekDirection,
};
use starlight_desktop::host::{Host, RemoteAction};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};

pub fn show(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
pub fn send(host: Arc<Host>, action: RemoteAction) {
    tauri::async_runtime::spawn_blocking(move || {
        if let Err(error) = host.remote(action) {
            eprintln!("Media control: {error}");
        }
    });
}

pub fn install(app: &mut tauri::App, host: Arc<Host>) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", "打开星光播放器", true, None::<&str>)?;
    let toggle = MenuItem::with_id(app, "toggle", "播放 / 暂停", true, None::<&str>)?;
    let previous = MenuItem::with_id(app, "previous", "上一首", true, None::<&str>)?;
    let next = MenuItem::with_id(app, "next", "下一首", true, None::<&str>)?;
    let stop = MenuItem::with_id(app, "stop", "停止播放", true, None::<&str>)?;
    let quit = MenuItem::with_id(
        app,
        "quit",
        "彻底退出（停止播放与定时任务）",
        true,
        None::<&str>,
    )?;
    let menu = Menu::with_items(app, &[&show_item, &toggle, &previous, &next, &stop, &quit])?;
    let tray_host = host.clone();
    let mut tray = TrayIconBuilder::with_id("starlight")
        .tooltip("星光播放器 · 后台播放与任务")
        .menu(&menu)
        .on_menu_event(move |app, event| {
            let action = match event.id.as_ref() {
                "show" => {
                    show(app);
                    return;
                }
                "quit" => {
                    app.exit(0);
                    return;
                }
                "toggle" => RemoteAction::Toggle,
                "previous" => RemoteAction::Previous,
                "next" => RemoteAction::Next,
                "stop" => RemoteAction::Stop,
                _ => return,
            };
            send(tray_host.clone(), action);
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;

    #[cfg(target_os = "windows")]
    let hwnd = Some(app.get_webview_window("main").unwrap().hwnd()?.0 as *mut std::ffi::c_void);
    #[cfg(not(target_os = "windows"))]
    let hwnd = None;
    let media = MediaControls::new(PlatformConfig {
        dbus_name: "org.starlightplayer.desktop.preview",
        display_name: "星光播放器",
        hwnd,
    })
    .and_then(|mut media| {
        let media_host = host.clone();
        let app_handle = app.handle().clone();
        media.attach(move |event| {
            let action = match event {
                MediaEvent::Play => RemoteAction::Play,
                MediaEvent::Pause => RemoteAction::Pause,
                MediaEvent::Toggle => RemoteAction::Toggle,
                MediaEvent::Stop => RemoteAction::Stop,
                MediaEvent::Next => RemoteAction::Next,
                MediaEvent::Previous => RemoteAction::Previous,
                MediaEvent::SetPosition(position) => {
                    RemoteAction::SeekTo(position.0.as_secs_f64() * 1000.0)
                }
                MediaEvent::Seek(direction) => {
                    RemoteAction::SeekBy(if direction == SeekDirection::Forward {
                        15000.0
                    } else {
                        -15000.0
                    })
                }
                MediaEvent::SeekBy(direction, duration) => RemoteAction::SeekBy(
                    duration.as_secs_f64()
                        * 1000.0
                        * if direction == SeekDirection::Forward {
                            1.0
                        } else {
                            -1.0
                        },
                ),
                MediaEvent::Raise => {
                    show(&app_handle);
                    return;
                }
                // Never open arbitrary OS-provided URLs, change unsupported shuffle, or accept volume values.
                _ => return,
            };
            send(media_host.clone(), action);
        })?;
        Ok(media)
    });
    // Media-center availability must not prevent offline playback (e.g. headless Linux).
    let controls = Arc::new(Mutex::new(
        media
            .map_err(|e| {
                eprintln!("System media center unavailable: {e}");
            })
            .ok(),
    ));
    let app_handle = app.handle().clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(1));
        let snapshot = host.snapshot();
        let controls = controls.clone();
        let previous = previous.clone();
        let next = next.clone();
        let stop = stop.clone();
        if app_handle
            .run_on_main_thread(move || {
                let care = snapshot["preferences"]["careMode"] == true;
                let sync = snapshot["state"]["config"]["sync"] == true;
                for item in [&previous, &next, &stop] {
                    let _ = item.set_enabled(!care);
                }
                let mut guard = controls.lock().unwrap_or_else(|e| e.into_inner());
                if let Some(media) = guard.as_mut() {
                    let state = &snapshot["state"];
                    let track = snapshot["tracks"].as_array().and_then(|tracks| {
                        tracks
                            .iter()
                            .find(|t| t["id"] == state["config"]["trackId"])
                    });
                    if let Some(track) = track {
                        let _ = media.set_metadata(MediaMetadata {
                            title: track["title"].as_str(),
                            album: Some("星光播放器"),
                            duration: track["durationMs"].as_u64().map(Duration::from_millis),
                            ..Default::default()
                        });
                    }
                    let progress = Some(MediaPosition(Duration::from_secs_f64(
                        (state["positionMs"].as_f64().unwrap_or(0.0) / 1000.0).max(0.0),
                    )));
                    let playback = match state["status"].as_str() {
                        Some("playing") => MediaPlayback::Playing { progress },
                        Some("paused" | "loading") => MediaPlayback::Paused { progress },
                        _ => MediaPlayback::Stopped,
                    };
                    let _ = media.set_playback(playback);
                    remote_capabilities(care, sync);
                }
            })
            .is_err()
        {
            break;
        }
    });
    Ok(())
}

#[cfg(target_os = "macos")]
fn remote_capabilities(care: bool, sync: bool) {
    use objc2::{class, msg_send, runtime::AnyObject};
    // souvlaki exposes events but no capabilities API. Hide commands here as well
    // as enforcing them on the actor, so an event race cannot bypass the policy.
    unsafe {
        let center: *mut AnyObject = msg_send![class!(MPRemoteCommandCenter), sharedCommandCenter];
        let commands: [(*mut AnyObject, bool); 3] = [
            (msg_send![center, previousTrackCommand], !care),
            (msg_send![center, nextTrackCommand], !care),
            (
                msg_send![center, changePlaybackPositionCommand],
                !care && !sync,
            ),
        ];
        for (command, enabled) in commands {
            let _: () = msg_send![command, setEnabled: enabled];
        }
    }
}
#[cfg(not(target_os = "macos"))]
fn remote_capabilities(_care: bool, _sync: bool) {}
