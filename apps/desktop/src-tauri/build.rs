fn main() {
    println!("cargo:rerun-if-changed=../generated/playback-core.js");
    println!("cargo:rerun-if-changed=../generated/catalog.json");
    #[cfg(feature = "desktop-ui")]
    tauri_build::build();
}
