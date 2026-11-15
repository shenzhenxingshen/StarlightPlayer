//! Run against extracted installation resources, not checkout audio/Homebrew.
//! Uses isolated data and ao=null; does not claim audible gapless correctness.
use serde_json::json;
use starlight_desktop::{
    host::{Command, Host},
    runtime::RuntimePaths,
};
use std::{
    path::PathBuf,
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

fn play_track(host: &Host, track: &serde_json::Value) {
    host.command(Command::Start {
        config: json!({
            "trackId":track["id"],"repeatCount":1,"mode":"play-one","sync":false
        }),
    })
    .expect("start bundled track");
    let start = Instant::now();
    loop {
        let state = host.snapshot()["state"].clone();
        if state["status"] == "playing" && state["positionMs"].as_f64().unwrap_or(0.) > 50. {
            println!("PASS {} bundled decode + playback progress", track["code"]);
            break;
        }
        assert!(
            start.elapsed() < Duration::from_secs(15),
            "track failed: {state}"
        );
        thread::sleep(Duration::from_millis(50));
    }
}

fn main() {
    let resources = PathBuf::from(
        std::env::args()
            .nth(1)
            .expect("absolute resource directory"),
    );
    assert!(resources.is_absolute());
    let runtime = RuntimePaths::bundled(&resources).expect("complete runtime");
    let data = std::env::temp_dir().join(format!(
        "starlight-package-test-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let host =
        Host::spawn_with_runtime(data.clone(), true, runtime.clone()).expect("bundled engine");
    let tracks = host.snapshot()["tracks"].as_array().unwrap().clone();
    assert_eq!(tracks.len(), 21);
    for track in &tracks {
        play_track(&host, track);
    }
    host.command(Command::Pause {}).unwrap();
    host.command(Command::Preferences {
        care_mode: false,
        close_to_background: false,
    })
    .unwrap();
    drop(host);
    // Repeat handle teardown/recreation in the same process. A single playback pass
    // missed Windows dependency initialization failures during DLL unload/reload.
    let a05 = tracks.iter().find(|track| track["code"] == "A05").unwrap();
    for iteration in 1..=5 {
        let restored = Host::spawn_with_runtime(data.clone(), true, runtime.clone()).unwrap();
        assert_eq!(
            restored.snapshot()["preferences"]["closeToBackground"],
            false
        );
        assert_ne!(restored.snapshot()["state"]["status"], "playing");
        play_track(&restored, a05);
        restored.command(Command::Pause {}).unwrap();
        drop(restored);
        println!("PASS isolated restart {iteration}/5");
    }
    println!("PASS logs retained at {}", data.display());
}
