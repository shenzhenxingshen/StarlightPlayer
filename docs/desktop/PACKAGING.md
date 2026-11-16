# 电脑版离线打包与测试安装

当前桌面源码版本 `0.1.1`，独立于手机版版本及部署目标。本轮没有构建/发布新安装包，既有 `0.1.0` 制品事实见历史记录。此流水线只生成 GitHub Actions artifacts，不创建公开 Release、不合并主分支、不更新 116 下载站。

`0.1.1` 的 Tauri `productName` 和窗口名为“星光播放器”；npm / Cargo / Tauri 三处版本及各自锁文件保持一致，界面版本从 npm 元数据读取。内部 identifier `org.starlightplayer.desktop.preview` 和可执行文件名 `starlight-desktop` 不变，以复用旧数据。新名称可能改变安装包、应用文件夹和快捷方式名称；发行前须在各平台验证 `0.1.0 → 0.1.1` 升级、旧入口替换及数据保留，不能仅凭标识未变声称安装器升级已经验收。

## 制品与边界

| 平台 | 安装包 | 构建基线 |
| --- | --- | --- |
| macOS Apple Silicon | ARM64 DMG | macOS 15 runner；自动读取包内动态库的最低系统版本 |
| macOS Intel | x64 DMG | macOS 15 Intel runner；不是 Universal |
| Windows | x64 NSIS EXE | Windows 2022 runner / MSYS2 UCRT64；面向 Windows 10/11 x64 |
| Linux | x64 AppImage | Ubuntu 24.04 / glibc 2.39；不承诺兼容更老的发行版 |

安装包应内置全部 21 首原始音频、libmpv 及其非系统动态库。Windows 嵌入完整 WebView2 离线安装程序，禁止以 bootstrapper 下载方式代替；Linux AppImage 收集 WebKit/GTK 等运行依赖。操作系统、显示/音频驱动等基础环境仍需存在；“无需另下资源”不等于支持任意旧系统。

macOS 使用系统 WebKit；Windows 使用附带安装程序安装 WebView2；Linux 保留宿主 glibc 和 ELF loader，不尝试替换系统基础库。AppImage 在无 FUSE 环境可尝试 `APPIMAGE_EXTRACT_AND_RUN=1 ./<文件名>.AppImage`，不必为挂载它安装 FUSE。

Mac 打包从每个 Mach-O 库的部署版本中取最高值，写入生成配置的 `bundle.macOS.minimumSystemVersion` 及资源清单；验收时核对最终 `Info.plist`，不沿用 Tauri 默认的 10.13。当前 CI 库要求 macOS 15。该要求只属于电脑版，不改手机版 iOS 13/14 部署设置。

本阶段测试包未做 Developer ID 公证和 Windows 代码签名。请仅使用可信来源、核对 SHA-256；不要全局关闭系统安全保护。生产发布前需要补齐签名、公证、干净系统的离线安装验收和第三方源码归档/许可证审查。

## 代码与资源

- `apps/desktop/scripts/prepare.mjs`：生成手机同源曲目清单、哈希、共享核心和圆角图标。
- `bundle-runtime.mjs`：复制音频、递归收集库、修正加载路径、保留许可证及版本清单。
- `src-tauri/src/runtime.rs`：release 只认 `$RESOURCE/runtime`，不回退开发环境；debug 模式仍可使用源码和开发者指定的 libmpv。
- `src-tauri/src/engine.rs`：Windows 安全加载同目录 DLL，并将库模块固定到进程生命周期，防止 FFmpeg/GGML 依赖卸载重载时重复注册进程级异常处理器；mpv 实例仍逐个正常释放。
- `src-tauri/examples/bundle_smoke.rs`：指定解包后的资源根目录，逐首启动全部 21 首并检查进度，再连续 5 次销毁/重建引擎、恢复偏好并播放 A05；使用独立临时数据和静音输出。
- `verify-runtime.mjs`：对安装后的资源复核 21 首音频及所有库的大小、SHA-256、平台和架构。
- `verify-installer.mjs`：macOS 只读挂载 DMG、Windows 在一次性 CI runner 内静默安装、Linux 解包 AppImage，再执行资源检查及包内引擎冒烟；清除开发库环境变量并将 PATH 限制为系统目录。
- `windows-executable.mjs` / `verify-windows-launch.ps1`：Windows 安装后检查主程序 PE Subsystem 必须为 `WINDOWS_GUI (2)`，实际启动 release GUI 并验证无控制台、关闭窗口后仍留在后台。只允许对一次性 Windows CI 的临时安装运行；不等于托盘点击、真实声卡和定时任务全场景验收。
- `.github/workflows/desktop-build.yml`：各平台原生编译、测试和 artifact 上传。
- `collect-installers.mjs`：收集本平台安装包、`SHA256SUMS.txt`、`runtime-manifest.json` 和第三方说明。

包内 `runtime/manifest.json` 记录构建提交、平台、架构、音频/动态库哈希；`runtime/licenses` 保存可获得的发行商版权和许可证资料。音频不改变，也不重复提交到 Git；所有生成库/安装包目录均忽略。

## 本地构建

在仓库根目录：

```sh
cd apps/desktop
npm ci
npm test
npm run bundle:prepare
cargo test --locked --manifest-path src-tauri/Cargo.toml --no-default-features
cargo run --locked --manifest-path src-tauri/Cargo.toml --no-default-features \
  --example bundle_smoke -- "$PWD/generated"
# macOS
npx tauri build --config generated/bundle.config.json --bundles dmg --no-sign
# Windows 使用 --bundles nsis；Linux 使用 --bundles appimage
node scripts/verify-installer.mjs
node scripts/collect-installers.mjs
```

本地构建需要工具链和依赖下载；这是开发机要求，不是用户安装要求。Windows 默认依赖目录 `C:/msys64/ucrt64`，可用 `STARLIGHT_MINGW_ROOT` 修改。macOS / Linux 构建机可用 `STARLIGHT_LIBMPV` 指定绝对路径。

`verify-installer.mjs` 的 Windows 安装步骤只允许在 `CI=true` 的一次性环境执行，不应为了绕过检查在个人电脑设置此变量。脚本不清除个人播放器数据。可用 `CARGO_TARGET_DIR` 将打包输出与正在运行的旧预览隔离；构建、冒烟示例编译、验收和制品收集必须使用同一个 target 目录。

桌面 TypeScript 编译只能依赖桌面自己的 `npm ci`。共享 `ScheduledTask` 使用 `src/types/playMode.ts` 的纯类型；手机存储保留原 `PlayMode` 导出以兼容既有调用方。`dependency-boundary.test.mjs` 检查完整类型依赖图，防止 `import type` 间接把 RN/MMKV 带入桌面构建。不要通过在桌面 CI 安装手机版依赖来掩盖类型边界问题。

## 验证与回退

1. 类型/核心/手机契约回归通过。
2. staging 资源检查 21 首哈希，并以**包内库**逐首加载。
3. 安装包解包复核路径、库依赖和音频清单；必须对解包后的资源再次运行 `bundle_smoke`，通过后才上传 artifact。
4. 在干净目标系统断网安装，检查首次启动、全部曲目、同步/模式/计数、任务、托盘、系统媒体键。静音输出不能证明真实声卡无吞音。
5. 保留旧安装包和用户数据。回退时正常退出新程序再安装旧测试包；不要同时启动两个版本写同一数据目录，不删除用户计数。

macOS 预览用户数据：`~/Library/Application Support/org.starlightplayer.desktop.preview/`。构建与冒烟测试不得覆盖此目录。长时间换遍、蓝牙、硬件输出、睡眠唤醒和多机同步需另行实测；流水线成功不代表这些全部通过。

## Windows 启动控制台修订（2026-11-15）

初版 `0.1.0` 的 `src/main.rs` 缺少 `windows_subsystem` 属性，Windows 默认生成控制台应用，导致从安装入口启动时同时出现终端；关闭终端会结束关联进程，绕过 Tauri 主窗口的后台隐藏逻辑。libmpv 已设置 `terminal=no`，该选项不能更改宿主 EXE 的子系统。

修订仅对 Windows release 声明 `windows_subsystem = "windows"`，保留 debug 控制台。播放状态机、同步、计数、任务及 Mac/Linux 构建行为不变。增加 PE32/PE32+ 与损坏文件测试，并检查**安装后的主程序**，不把 NSIS 安装器的子系统误当应用验收。下载站以 `0.1.0 Windows 修订版` 和源码提交号区分，不修改手机版本；服务器替换前保留旧 ZIP 与校验清单，更新后复核哈希和下载入口。

Windows 安装与 GUI 探针统一使用 GitHub runner 的 `RUNNER_TEMP`，避免 Node 与 .NET 对用户临时目录/短路径解析不一致导致误拒绝。仍要求 `CI=true` 且应用位于该临时目录内，不应在个人机器上通过设置这些变量来绕过保护。

GUI 探针使用一次性新配置，等待前端首次偏好保存（`initialized=true`）确认 UI 与原生 IPC 已就绪，再检查无控制台和关闭到后台。仅有 HWND 出现不代表初始化完成；失败时输出退出码、窗口标题及应用自己的有限诊断日志，不修改个人数据。

修订制品的构建身份、安装后 GUI 验证、离线资源检查和发布回退记录见 [Windows f838255-r02 验收报告](../test-runs/2026-11-15-v0.1.0-windows-x64-f838255-r02.md)。该报告明确区分 CI 静音解码、实际 GUI 检查与尚未完成的 Windows 10/11 真机验收，不应把流水线通过等同于全部功能测试完成。
