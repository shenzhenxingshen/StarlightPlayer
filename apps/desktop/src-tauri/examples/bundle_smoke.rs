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
    host.command(Command::Pause {}).unwrap();
    host.command(Command::Preferences {
        care_mode: false,
        close_to_background: false,
    })
    .unwrap();
    drop(host);
    let restored = Host::spawn_with_runtime(data.clone(), true, runtime).unwrap();
    assert_eq!(
        restored.snapshot()["preferences"]["closeToBackground"],
        false
    );
    assert_ne!(restored.snapshot()["state"]["status"], "playing");
    println!("PASS isolated restart; logs retained at {}", data.display());
}
