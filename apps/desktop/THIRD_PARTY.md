# Bundled runtime notices

This test build includes the 21 Starlight audio assets without re-encoding.
Audio ownership/licensing is unchanged; no additional redistribution rights are granted.

The native engine is **mpv/libmpv**, using its public client API 2.x.
The runtime also contains its platform-specific FFmpeg and other library dependencies.
The applicable license/copyright texts and package versions are in `runtime/licenses/`
and `runtime/manifest.json` in this installation. Different native packages can have
different licenses (including GPL/LGPL); this is not a claim that the whole runtime is MIT.

Upstream sources and reproducible package recipes:

- mpv: https://github.com/mpv-player/mpv
- FFmpeg: https://ffmpeg.org/download.html
- macOS packages: https://github.com/Homebrew/homebrew-core
- Windows packages and source recipes: https://github.com/msys2/MINGW-packages
- MSYS2 package/source index: https://packages.msys2.org/
- Ubuntu package/source index: https://packages.ubuntu.com/

Starlight source and build scripts: https://github.com/shenzhenxingshen/StarlightPlayer
(`apps/desktop`, `packages/playback-core`, `.github/workflows/desktop-build.yml`).
The exact build commit is recorded in the runtime manifest.

Windows installers embed Microsoft's WebView2 offline installer. WebView2 is
distributed under Microsoft's terms, not the mpv license.

These are unsigned test packages, not an App Store/Microsoft Store release.
Before public commercial distribution, archive the exact corresponding third-party
source packages and review the obligations of each bundled license.
