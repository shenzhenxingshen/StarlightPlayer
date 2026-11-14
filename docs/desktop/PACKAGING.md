# 电脑版离线打包与测试安装

桌面版本 `0.1.0`，独立于手机版版本及部署目标。此流水线只生成 GitHub Actions artifacts，不创建公开 Release、不合并主分支、不更新 116 下载站。

## 制品与边界

| 平台 | 安装包 | 构建基线 |
| --- | --- | --- |
| macOS Apple Silicon | ARM64 DMG | macOS 15 runner；实际最低版本还取决于包内动态库 |
| macOS Intel | x64 DMG | macOS 15 Intel runner；不是 Universal |
| Windows | x64 NSIS EXE | Windows 2022 runner / MSYS2 UCRT64；面向 Windows 10/11 x64 |
| Linux | x64 AppImage | Ubuntu 24.04 / glibc 2.39；不承诺兼容更老的发行版 |

安装包应内置全部 21 首原始音频、libmpv 及其非系统动态库。Windows 嵌入完整 WebView2 离线安装程序，禁止以 bootstrapper 下载方式代替；Linux AppImage 收集 WebKit/GTK 等运行依赖。操作系统、显示/音频驱动等基础环境仍需存在；“无需另下资源”不等于支持任意旧系统。

macOS 使用系统 WebKit；Windows 使用附带安装程序安装 WebView2；Linux 保留宿主 glibc 和 ELF loader，不尝试替换系统基础库。AppImage 在无 FUSE 环境可尝试 `APPIMAGE_EXTRACT_AND_RUN=1 ./<文件名>.AppImage`，不必为挂载它安装 FUSE。

本阶段测试包未做 Developer ID 公证和 Windows 代码签名。请仅使用可信来源、核对 SHA-256；不要全局关闭系统安全保护。生产发布前需要补齐签名、公证、干净系统的离线安装验收和第三方源码归档/许可证审查。

## 代码与资源

- `apps/desktop/scripts/prepare.mjs`：生成手机同源曲目清单、哈希、共享核心和圆角图标。
- `bundle-runtime.mjs`：复制音频、递归收集库、修正加载路径、保留许可证及版本清单。
- `src-tauri/src/runtime.rs`：release 只认 `$RESOURCE/runtime`，不回退开发环境；debug 模式仍可使用源码和开发者指定的 libmpv。
- `src-tauri/examples/bundle_smoke.rs`：指定解包后的资源根目录，逐首启动全部 21 首并检查进度；使用独立临时数据和静音输出。
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
node scripts/collect-installers.mjs
```

本地构建需要工具链和依赖下载；这是开发机要求，不是用户安装要求。Windows 默认依赖目录 `C:/msys64/ucrt64`，可用 `STARLIGHT_MINGW_ROOT` 修改。macOS / Linux 构建机可用 `STARLIGHT_LIBMPV` 指定绝对路径。

## 验证与回退

1. 类型/核心/手机契约回归通过。
2. staging 资源检查 21 首哈希，并以**包内库**逐首加载。
3. 安装包解包复核路径、库依赖和音频清单；尽可能对解包后的资源再次运行 `bundle_smoke`。
4. 在干净目标系统断网安装，检查首次启动、全部曲目、同步/模式/计数、任务、托盘、系统媒体键。静音输出不能证明真实声卡无吞音。
5. 保留旧安装包和用户数据。回退时正常退出新程序再安装旧测试包；不要同时启动两个版本写同一数据目录，不删除用户计数。

macOS 预览用户数据：`~/Library/Application Support/org.starlightplayer.desktop.preview/`。构建与冒烟测试不得覆盖此目录。长时间换遍、蓝牙、硬件输出、睡眠唤醒和多机同步需另行实测；流水线成功不代表这些全部通过。
