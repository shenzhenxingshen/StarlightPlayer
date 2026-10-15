# 星光播放器 StarlightPlayer

一款 iOS / Android 双端离线佛教经咒与佛号播放器。应用内置 21 首音频，有两项并列的核心设计：“从 0 完整播到结尾才计一遍”，以及“同步模式按共同时间基准把不同设备对齐到同一播放位置”。

## 两项不可改变的核心规则

### 1. 每首重复遍数优先于播放模式

`repeatCount`（每首重复遍数）始终优先于播放模式。设置 7 遍时：

- 单曲播放：完成 7 遍后停止。
- 单曲循环：完成 7 遍后清零本轮计数，继续同一首。
- 列表播放：每首都完成 7 遍后再进入下一首，最后一首后停止。
- 列表循环：每首都完成 7 遍后再进入下一首，列表末尾回到第一首。

快捷值为 1、108、1000、10000，也可输入 500 万等大正整数。当前播放任务的累计遍数会在每次有效完成后持久化；关闭并重开 App 后继续计数，手动重选曲目或已完成的单曲播放再次开始时才创建新任务并清零。

### 2. 同步模式是核心特色

- 同一时区且设备时钟准确时，同一曲目按“本地当天 00:00 至当前时刻，对曲目时长取模”对齐进度。
- 从曲目中间加入同步时，先播放的尾段是“第 0 遍”，不计入 N 遍；到达自然结尾后会再次按当前墙钟对齐，只有落在有效起始区间的新周期才取得计数资格。
- 开启同步、暂停后恢复或可恢复的音频中断后，都会重新按当前时间对齐。
- 自然播到结尾后也会逐遍重新对齐。由于 QueueEnded 处理存在延迟，实际起点通常是接近 0 的小偏移，而不是强制 `seekTo(0)`；列表换曲时则按新曲时长重新对齐。
- 同步模式锁定 App 进度条和锁屏 seek，避免单台设备脱离共同进度。

同步只使用设备本地时间，不依赖服务器；设备时钟或时区不同会产生偏差。

详细状态机和异常恢复约定见 [播放架构](docs/PLAYBACK_ARCHITECTURE.md)。

## 响应式播放界面（需求 29）

每个平台只发布一个安装包；iOS Target 为 iPhone/iPad Universal。运行时按当前窗口的 `高度 / 宽度` 自动选布局；旋转、iPad 分屏或窗口缩放后即时重排：

- 竖屏 `> 1`：保留纵向内容结构，播放模式、上一首、播放/暂停、下一首、同步模式五个按钮改为一行；当前遍数在横向时间轴上方，每首重复遍数在时间轴下方并与两端时间对齐。
- 方屏 `0.75～1`（含边界）：采用方案 3 三栏结构，左侧为五按钮纵向控制轨，中间为曲名和唱片，右侧为遍数与竖向时间轴。
- 横屏 `< 0.75`：沿用方案 3 并增加横向留白；控件按屏幕短边缩放并设置上限，避免平板或电视上无限放大。

方屏/横屏右栏中，当前遍数与每首重复遍数上下成组、置于竖向时间轴左侧，起止时间位于轴的上、下端；左右两条轨道等高，播放/暂停、唱片和遍数组共用视觉中轴。布局切换只改变视图，不得重建播放器、seek、清零或改变同步和计数资格。

## 技术栈

| 范畴       | 选型                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------- |
| App        | React Native 0.75.5, React 18.3.1, TypeScript 5.5                                        |
| 播放       | react-native-track-player 4.1                                                            |
| 导航       | React Navigation bottom-tabs 6                                                           |
| UI 状态    | Zustand 4.5                                                                              |
| 本地持久化 | react-native-mmkv 2.12                                                                   |
| Android    | minSdk 23, target/compileSdk 35, Kotlin 1.9.25, Hermes                                   |
| iOS        | iOS/iPadOS 13.4+, Universal, CocoaPods, Objective-C++ AppDelegate/SceneDelegate/原生模块 |
| 测试/质量  | Jest 29, React Native Testing Library, ESLint, Prettier, tsc strict                      |

## 快速定位

- `index.js`：RN 入口，注册 UI App 和 RNTP PlaybackService。
- `src/App.tsx`：初始化播放器、背景策略、原生队列恢复、Tab 导航。
- `src/services/playbackService.ts`：锁屏/通知栏事件、队列结束、N 遍计数、模式切换、异常恢复。
- `src/utils/trackManager.ts`：换曲、权威曲目索引、播放重试。
- `src/utils/playbackCycle.ts`：`cycleEligible` 和所有 seek 资格变化。
- `src/utils/playerCommandQueue.ts`：UI/Service 回调串行化，并用原生进程锁防御额外 ReactContext/桥接重入。
- `src/utils/storage.ts`：跨生命周期的 MMKV 播放状态协议。
- `src/constants/tracks.ts`：21 首曲目的 ID、资源名和精确时长。

完整目录、启动流程、配置和交接风险见 [项目接管手册](docs/TAKEOVER.md)。

## 本地命令

以下命令均依赖本机已安装好与 lockfile 一致的依赖：

```bash
npm start
npm run android
npm run ios
npm run typecheck:app
npm run typecheck
npm run lint
npm test
npm run format:check
```

Android release 签名使用 `STARLIGHT_STORE_PASSWORD`、`STARLIGHT_KEY_ALIAS`、`STARLIGHT_KEY_PASSWORD`。

iOS 产品最低版本保持 13.4。Xcode 27 本机若需以 iOS 15 临时完成 Simulator/当前 SDK 验证，可在 `pod install` 时设置 `STARLIGHT_LOCAL_IOS_DEPLOYMENT_TARGET=15.0`，并在本次 `xcodebuild` 命令中临时传入 `IPHONEOS_DEPLOYMENT_TARGET=15.0`；这些覆盖不代表放弃 iOS 13/14，发布前仍须以可用旧工具链和真机完成兼容验证。

## 资源与网络

- Android 和 iOS 目录各内置 21 个 MP3，各约 114 MiB，运行时不下载音频。
- 代码中没有后端 API、数据库、远程缓存、消息队列、分析或广告 SDK。
- Android Manifest 仍有 `INTERNET` 权限，iOS ATS 允许任意请求，但当前业务代码没有网络调用。发布前可作为安全收紧项。

## 诊断

“我的 → 诊断信息”可导出 UTF-8 `.txt` 文件到系统分享面板。日志最多保留 1000 条，包含播放状态、QueueEnded、PlaybackError、PlayerError、RemoteStop 和命令序列。

## 文档

- [项目接管手册](docs/TAKEOVER.md)
- [播放架构与状态机](docs/PLAYBACK_ARCHITECTURE.md)
- [测试手册](docs/TESTING.md)
- [Lint 与静态检查](docs/LINTING.md)
- [隐私政策](PRIVACY.md)
