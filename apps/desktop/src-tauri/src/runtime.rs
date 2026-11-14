//! Trusted host paths, never provided by a webview command.
use std::path::{Path, PathBuf};

#[derive(Clone)]
pub struct RuntimePaths {
    pub library: PathBuf,
    pub audio: PathBuf,
}

impl RuntimePaths {
    pub fn bundled(resources: &Path) -> Result<Self, String> {
        #[cfg(target_os = "macos")]
        let name = "libmpv.2.dylib";
        #[cfg(target_os = "windows")]
        let name = "libmpv-2.dll";
        #[cfg(target_os = "linux")]
        let name = "libmpv.so.2";
        let root = resources.join("runtime");
        let library = root.join("lib").join(name);
        let audio = root.join("audio");
        if !library.is_file() || !audio.is_dir() {
            return Err("Installation is incomplete: bundled audio or libmpv is missing. Reinstall the complete package.".into());
        }
        Ok(Self {
            library: library.canonicalize().map_err(|e| e.to_string())?,
            audio: audio.canonicalize().map_err(|e| e.to_string())?,
        })
    }

    pub fn development() -> Result<Self, String> {
        Ok(Self {
            library: crate::engine::development_library()?,
            audio: Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../../../ios/StarlightPlayer/audio")
                .canonicalize()
                .map_err(|e| e.to_string())?,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn incomplete_bundle_never_falls_back_to_developer_paths() {
        assert!(RuntimePaths::bundled(Path::new("/missing/starlight-installation")).is_err());
    }
}
