use serde_json::{json, Value};
use starlight_desktop::{
    core::Core,
    host::{Command, Host, RemoteAction},
};
use std::{
    path::PathBuf,
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

fn directory(label: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../test-results")
        .join(format!(
            "{label}-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
}
#[test]
fn shared_ts_runs_without_webview_and_restores_without_autoplay() {
    let core = Core::new().unwrap();
    let config = json!({"trackId":"a05","mode":"play-one","repeatCount":7,"sync":true});
    let mut state = core.call("initial", &config).unwrap();
    for count in 0..7 {
        if count == 0 {
            state = core.call("transition", &json!({"state":state,"event":{"type":"play"},"clock":{"nowMs":0,"midnightMs":0}})).unwrap()["state"].clone();
        }
        let generation = state["generation"].clone();
        state = core.call("transition", &json!({"state":state,"event":{"type":"started","generation":generation,"positionMs":100,"eligible":true},"clock":{"nowMs":100,"midnightMs":0}})).unwrap()["state"].clone();
        state = core.call("transition", &json!({"state":state,"event":{"type":"ended","generation":generation,"positionMs":70385,"reason":"eof"},"clock":{"nowMs":70485,"midnightMs":0}})).unwrap()["state"].clone();
        assert_eq!(state["completedCount"], count + 1);
    }
    assert_eq!(state["status"], "complete");
    let restored = core.call("restore", &state).unwrap();
    assert_eq!(restored["status"], "complete");
    assert_eq!(restored["completedCount"], 7);
}
#[test]
fn ipc_cannot_inject_native_events_or_arbitrary_paths() {
    for invalid in [
        json!({"type":"ended","generation":1,"reason":"eof"}),
        json!({"type":"play","path":"/etc/passwd"}),
        json!({"type":"seek","positionMs":"bad"}),
        json!({"type":"remote","action":"seek-to","positionMs":0}),
        json!({"type":"export-diagnostics","path":"/tmp/arbitrary"}),
    ] {
        assert!(serde_json::from_value::<Command>(invalid).is_err());
    }
    let core = Core::new().unwrap();
    assert!(core
        .call(
            "initial",
            &json!({"trackId":"../../x","mode":"play-one","repeatCount":1,"sync":true})
        )
        .is_err());
}

#[test]
#[ignore = "Requires local libmpv/assets, isolated data and null output; about 8 seconds"]
fn native_tasks_preferences_remote_and_exports() {
    use chrono::Timelike;
    let dir = directory("native-tasks");
    let host = Host::spawn(dir.clone(), true).unwrap();
    assert_eq!(
        host.snapshot()["preferences"]["closeToBackground"],
        true,
        "Fresh settings must keep the player running when the window closes"
    );
    let defaults = host.snapshot()["tasks"].as_array().unwrap().clone();
    assert_eq!(defaults.len(), 3);
    assert!(defaults.iter().all(|t| t["enabled"] == false));
    host.command(Command::Preferences {
        care_mode: true,
        close_to_background: true,
    })
    .unwrap();
    let mut task = defaults[0].clone();
    task["id"] = json!("test-task");
    task["name"] = json!("测试五百万");
    task["trackId"] = json!("a04");
    task["repeatCount"] = json!(5000000);
    task["playMode"] = json!("play-all");
    task["isSyncMode"] = json!(false);
    host.command(Command::TaskSave { task: task.clone() })
        .unwrap();
    assert_eq!(
        host.snapshot()["state"]["status"],
        "idle",
        "Save must never play"
    );
    // Manual play is allowed while disabled and in care mode; applies all four fields.
    host.command(Command::TaskPlay {
        id: "test-task".into(),
    })
    .unwrap();
    let state = playing(&host, "a04");
    assert_eq!(
        state["config"],
        json!({"trackId":"a04","repeatCount":5000000,"mode":"play-all","sync":false})
    );
    assert_eq!(state["completedCount"], 0);
    assert_eq!(host.snapshot()["preferences"]["careMode"], true);
    for action in [
        RemoteAction::Stop,
        RemoteAction::Next,
        RemoteAction::Previous,
        RemoteAction::SeekTo(0.0),
    ] {
        assert!(host.remote(action).is_err());
    }
    host.remote(RemoteAction::Pause).unwrap();
    assert_eq!(host.snapshot()["state"]["status"], "paused");
    host.remote(RemoteAction::Toggle).unwrap();
    playing(&host, "a04");
    host.command(Command::Preferences {
        care_mode: false,
        close_to_background: true,
    })
    .unwrap();
    host.remote(RemoteAction::SeekTo(5000.0)).unwrap();
    assert_eq!(host.snapshot()["state"]["eligible"], false);
    host.remote(RemoteAction::SeekBy(-10000.0)).unwrap();
    assert_eq!(host.snapshot()["state"]["eligible"], true);
    host.command(Command::Configure {
        settings: json!({"sync":true}),
    })
    .unwrap();
    assert!(host.remote(RemoteAction::SeekTo(0.0)).is_err());
    host.remote(RemoteAction::Next).unwrap();
    playing(&host, "a05");
    host.remote(RemoteAction::Previous).unwrap();
    playing(&host, "a04");
    host.remote(RemoteAction::Stop).unwrap();

    // Real actor clock/scheduler, no WebView, care mode does not disable schedules.
    host.command(Command::Preferences {
        care_mode: true,
        close_to_background: true,
    })
    .unwrap();
    let target = chrono::Local::now() + chrono::Duration::seconds(4);
    task["hour"] = json!(target.hour());
    task["minute"] = json!(target.minute());
    task["second"] = json!(target.second());
    task["trackId"] = json!("a05");
    task["repeatCount"] = json!(49);
    task["playMode"] = json!("play-one");
    host.command(Command::TaskSave { task: task.clone() })
        .unwrap();
    host.command(Command::TaskEnable {
        id: "test-task".into(),
        enabled: true,
    })
    .unwrap();
    let automatic = playing(&host, "a05");
    assert_eq!(
        automatic["config"],
        json!({"trackId":"a05","repeatCount":49,"mode":"play-one","sync":false})
    );
    assert!(
        automatic["positionMs"].as_f64().unwrap() < 1500.0,
        "Non-sync starts at zero"
    );
    thread::sleep(Duration::from_millis(350));
    let saved: Value =
        serde_json::from_slice(&std::fs::read(dir.join("desktop-v1.json")).unwrap()).unwrap();
    assert_eq!(saved["tasks"]["handled"].as_object().unwrap().len(), 1);
    let generation = host.snapshot()["state"]["generation"].clone();
    host.command(Command::TaskDelete {
        id: "test-task".into(),
    })
    .unwrap();
    assert_eq!(
        host.snapshot()["state"]["generation"],
        generation,
        "Delete must not stop ongoing playback"
    );
    let export = host.command(Command::ExportDiagnostics {}).unwrap();
    let path = PathBuf::from(export["path"].as_str().unwrap());
    assert_eq!(path.parent().unwrap(), dir.join("exports"));
    let text = std::fs::read_to_string(path).unwrap();
    for required in [
        "任务:",
        "状态:",
        "task-automatic",
        "task-manual",
        "remote-command",
    ] {
        assert!(text.contains(required), "{required} missing from export");
    }
    assert!(host.snapshot()["recentLogs"].as_array().unwrap().len() <= 30);
    drop(host);
    let restored = Host::spawn(dir.clone(), true).unwrap();
    assert_eq!(restored.snapshot()["state"]["status"], "idle");
    assert_eq!(restored.snapshot()["preferences"]["careMode"], true);
    assert_eq!(
        restored.snapshot()["preferences"]["closeToBackground"],
        true
    );
    assert_eq!(restored.snapshot()["tasks"].as_array().unwrap().len(), 3);
    for task in defaults {
        restored
            .command(Command::TaskDelete {
                id: task["id"].as_str().unwrap().into(),
            })
            .unwrap();
    }
    restored
        .command(Command::Preferences {
            care_mode: true,
            close_to_background: false,
        })
        .unwrap();
    drop(restored);
    let empty = Host::spawn(dir.clone(), true).unwrap();
    assert_eq!(
        empty.snapshot()["preferences"]["closeToBackground"],
        false,
        "An explicit opt-out must survive restart, not be overwritten by the new default"
    );
    assert!(
        empty.snapshot()["tasks"].as_array().unwrap().is_empty(),
        "Deleted defaults must not be reseeded"
    );
    drop(empty);
    let file = dir.join("desktop-v1.json");
    std::fs::write(&file, b"{broken").unwrap();
    assert!(Host::spawn(dir.clone(), true).is_err());
    assert_eq!(std::fs::read(file).unwrap(), b"{broken");
    println!("Tasks evidence: {}", dir.display());
}

#[test]
#[ignore = "Requires local libmpv/assets; isolated data, real clock and null output"]
fn native_weekdays_persist_and_dispatch_only_matching_day() {
    use chrono::{Datelike, Timelike};
    let dir = directory("native-weekdays");
    let host = Host::spawn(dir.clone(), true).unwrap();
    let today = chrono::Local::now().weekday().number_from_monday();
    let mut skipped = host.snapshot()["tasks"][0].clone();
    skipped["id"] = json!("other-day");
    skipped["weekdays"] = json!([today % 7 + 1]);
    skipped["isSyncMode"] = json!(false);
    skipped["trackId"] = json!("a04");
    host.command(Command::TaskSave {
        task: skipped.clone(),
    })
    .unwrap();
    // The manual button must work even on an unselected weekday and with the switch off.
    host.command(Command::TaskPlay {
        id: "other-day".into(),
    })
    .unwrap();
    playing(&host, "a04");
    host.remote(RemoteAction::Stop).unwrap();

    let target = chrono::Local::now() + chrono::Duration::seconds(4);
    let selected_day = target.weekday().number_from_monday();
    skipped["weekdays"] = json!([selected_day % 7 + 1]);
    skipped["hour"] = json!(target.hour());
    skipped["minute"] = json!(target.minute());
    skipped["second"] = json!(target.second());
    let mut selected = skipped.clone();
    selected["id"] = json!("selected-day");
    selected["weekdays"] = json!([selected_day]);
    selected["trackId"] = json!("a05");
    for task in [skipped, selected] {
        let id = task["id"].as_str().unwrap().to_owned();
        host.command(Command::TaskSave { task }).unwrap();
        host.command(Command::TaskEnable { id, enabled: true })
            .unwrap();
    }
    // Two enabled tasks can share a clock time when their weekdays are disjoint.
    playing(&host, "a05");
    thread::sleep(Duration::from_millis(400));
    let saved: Value =
        serde_json::from_slice(&std::fs::read(dir.join("desktop-v1.json")).unwrap()).unwrap();
    let claims = saved["tasks"]["handled"].as_object().unwrap();
    assert_eq!(claims.len(), 1);
    assert!(claims.keys().next().unwrap().starts_with("selected-day@"));
    assert_eq!(host.snapshot()["state"]["config"]["trackId"], "a05");
    let before = host.snapshot()["tasks"].clone();
    drop(host);
    let restored = Host::spawn(dir.clone(), true).unwrap();
    assert_eq!(restored.snapshot()["tasks"], before);
    assert_eq!(restored.snapshot()["state"]["status"], "idle");
    drop(restored);
    println!("Weekday persistence/dispatch evidence: {}", dir.display());
}

fn live(track_id: &str) {
    let repeats: u64 = std::env::var("STARLIGHT_TEST_CYCLES")
        .unwrap_or("3".into())
        .parse()
        .unwrap();
    assert!((1..=21).contains(&repeats), "Bounded live test: 1..=21");
    let dir = directory(track_id);
    println!("Evidence directory: {}", dir.display());
    let host = Host::spawn(dir.clone(), true).unwrap();
    host.command(Command::Start {
        config: json!({"trackId":track_id,"mode":"play-one","repeatCount":repeats,"sync":true}),
    })
    .unwrap();
    let deadline = Instant::now() + Duration::from_secs((repeats + 3) * 80);
    let mut last = Value::Null;
    loop {
        let snapshot = host.snapshot();
        let state = &snapshot["state"];
        assert_ne!(state["status"], "error", "{snapshot}");
        if state["completedCount"] != last {
            last = state["completedCount"].clone();
            println!("{track_id} completed={last}, state={}", state["status"]);
        }
        if state["status"] == "complete" {
            assert_eq!(state["completedCount"], repeats);
            break;
        }
        assert!(Instant::now() < deadline, "Timed out: {snapshot}");
        thread::sleep(Duration::from_millis(200));
    }
    // Prove no N+1 after completing and no auto-play on a new native host.
    thread::sleep(Duration::from_secs(2));
    assert_eq!(host.snapshot()["state"]["status"], "complete");
    drop(host);
    thread::sleep(Duration::from_millis(100));
    let restored = Host::spawn(dir, true).unwrap();
    assert_eq!(restored.snapshot()["state"]["completedCount"], repeats);
    assert_eq!(restored.snapshot()["state"]["status"], "complete");
}
#[test]
#[ignore = "Real-time null-output libmpv A04 test; not physical acoustic validation"]
fn live_a04() {
    live("a04");
}
#[test]
#[ignore = "Real-time null-output libmpv A05 test; not physical acoustic validation"]
fn live_a05() {
    live("a05");
}

fn playing(host: &Host, id: &str) -> Value {
    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        let state = host.snapshot()["state"].clone();
        assert_ne!(state["status"], "error", "{state}");
        if state["status"] == "playing" && state["config"]["trackId"] == id {
            return state;
        }
        assert!(Instant::now() < deadline, "Never started: {state}");
        thread::sleep(Duration::from_millis(20));
    }
}

#[test]
#[ignore = "Requires local libmpv and bundled assets; null output, no physical sound"]
fn native_controls_and_exclusive_data_directory() {
    let dir = directory("native-controls");
    let host = Host::spawn(dir.clone(), true).unwrap();
    assert_eq!(
        host.snapshot()["state"]["config"],
        json!({"trackId":"a01","repeatCount":1,"mode":"repeat-one","sync":true})
    );
    assert_eq!(host.snapshot()["state"]["status"], "idle");
    assert!(
        Host::spawn(dir.clone(), true).is_err(),
        "Concurrent writer must be rejected"
    );
    // Replacing a pending load must not let an old native entry claim the new generation.
    for id in ["a04", "a05", "a04", "a05", "a04", "a05"] {
        host.command(Command::Start {
            config: json!({"trackId":id,"mode":"play-one","repeatCount":7,"sync":false}),
        })
        .unwrap();
    }
    let state = playing(&host, "a05");
    assert_eq!(state["completedCount"], 0);
    let generation = state["generation"].clone();
    assert!(host
        .command(Command::Start {
            config: json!({"trackId":"../x","repeatCount":1,"mode":"play-one","sync":false})
        })
        .is_err());
    assert!(host.command(Command::Seek { position_ms: -1.0 }).is_err());
    assert_eq!(host.snapshot()["state"]["status"], "playing");
    assert_eq!(host.snapshot()["state"]["generation"], generation);
    host.command(Command::Pause {}).unwrap();
    assert_eq!(host.snapshot()["state"]["status"], "paused");
    // Mobile-style changes must not restart the track or autoplay a paused player.
    host.command(Command::Configure {
        settings: json!({"repeatCount":5000000,"mode":"repeat-one","sync":true}),
    })
    .unwrap();
    thread::sleep(Duration::from_millis(200));
    let changed = host.snapshot()["state"].clone();
    assert_eq!(changed["status"], "paused");
    assert_eq!(changed["generation"], generation);
    assert_eq!(changed["completedCount"], 0);
    assert_eq!(changed["config"]["repeatCount"], 5000000);
    for invalid in [
        json!({"trackId":"a04"}),
        json!({"repeatCount":0}),
        json!({"mode":"shuffle"}),
    ] {
        assert!(host
            .command(Command::Configure { settings: invalid })
            .is_err());
        assert_eq!(host.snapshot()["state"]["status"], "paused");
    }
    host.command(Command::Configure {
        settings: json!({"sync":false,"mode":"play-one"}),
    })
    .unwrap();
    host.command(Command::Seek {
        position_ms: 5000.0,
    })
    .unwrap();
    assert_eq!(host.snapshot()["state"]["eligible"], false);
    host.command(Command::Seek {
        position_ms: 1500.0,
    })
    .unwrap();
    assert_eq!(host.snapshot()["state"]["eligible"], true);
    host.command(Command::Play {}).unwrap();
    playing(&host, "a05");
    host.command(Command::Stop {}).unwrap();
    assert_eq!(host.snapshot()["state"]["status"], "idle");
    host.command(Command::Start {
        config: json!({"trackId":"a04","mode":"play-one","repeatCount":7,"sync":true}),
    })
    .unwrap();
    host.command(Command::Pause {}).unwrap();
    thread::sleep(Duration::from_millis(200));
    assert!(["paused", "idle"].contains(&host.snapshot()["state"]["status"].as_str().unwrap()));
    host.command(Command::Play {}).unwrap();
    playing(&host, "a04");
    assert!(host.command(Command::Seek { position_ms: 0.0 }).is_err());
    assert_eq!(host.snapshot()["state"]["status"], "playing");
    drop(host);
    let restored = Host::spawn(dir.clone(), true).unwrap();
    assert_eq!(restored.snapshot()["state"]["status"], "idle");
    assert_eq!(restored.snapshot()["state"]["eligible"], false);
    drop(restored);
    // Malformed state is not silently overwritten/reset.
    let file = dir.join("playback-v1.json");
    std::fs::write(&file, b"{broken").unwrap();
    assert!(Host::spawn(dir.clone(), true).is_err());
    assert_eq!(std::fs::read(&file).unwrap(), b"{broken");
    println!("Native controls evidence: {}", dir.display());
}
