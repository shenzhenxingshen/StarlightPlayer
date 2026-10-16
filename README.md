# 星光播放器 StarlightPlayer

星光播放器是一款 iPhone、iPad 和 Android 离线经咒、佛号与歌曲播放器，内置 21 首音频。产品有两个并列核心：只有从开头附近完整播放到结尾才计一遍，以及多台设备按共同时间基准同步到同一播放位置。

- 最终用户请先阅读[图文用户手册](docs/USER_MANUAL.md)。
- 开发与维护人员从[文档门户](docs/README.md)进入；新接手项目先走[新开发者上手路线](docs/ONBOARDING.md)。
- 修改播放逻辑前必须阅读[播放架构与状态机](docs/PLAYBACK_ARCHITECTURE.md)。

## 当前版本与兼容性

| 平台       | 当前源码版本              | 兼容性事实                                                           |
| ---------- | ------------------------- | -------------------------------------------------------------------- |
| Android    | 1.0，versionCode 3        | minSdk 23，即 Android 6.0+                                           |
| iOS/iPadOS | 1.0.0，build 4，Universal | 工程目标为 13.4；但当前 build 4 Archive 实际 `MinimumOSVersion=15.0` |

因此，当前已上传的 iOS build 4 **不能宣称支持 iOS 13/14**。若要兑现源码的 13.4 兼容目标，必须重新构建更高 build，检查 Archive 内最终 App 的最低系统，并完成旧系统真机回归。详见[发布手册](docs/RELEASE.md)。

## 两项核心规则

### 每首重复遍数优先于播放模式

`repeatCount` 始终先于四种播放模式。设置 7 遍时：

- 单曲播放：完成 7 遍后停止。
- 单曲循环：完成 7 遍后继续当前曲目，UI 累计遍数继续增长。
- 列表播放：每首完成 7 遍才进入下一首，最后一首完成后停止。
- 列表循环：每首完成 7 遍才进入下一首，列表末尾回到第一首。

有效周期必须从 0～1.5 秒的起始区间开始并自然到达结尾。快捷值为 1、108、1,000、10,000，也可输入 5,000,000 等正安全整数。每次有效完成后立即保存累计遍数；关闭并重开 App 会续数。换到另一首（包括上下首和列表自动换曲）、手动重选当前曲，或已完成的单曲播放再次开始时，才创建新任务并清零。

### 同步播放是核心特色

同步位置按“设备本地当天 00:00 到当前时刻，对曲目时长取模”计算，不依赖服务器。开启同步、暂停后恢复、每次自然结束、异常恢复和列表换曲时都会重新对齐。

从曲目中间加入时，当前尾段在计数意义上是“第 0 遍”，不计入 N 遍；只有下一次从有效起始区间开始并完整播放到结尾才计数。新任务尚无已完成遍数时 UI 显示 0；恢复已有任务时保留原累计数，不会因这段尾段归零。同步模式锁定 App 和远程 seek，设备时钟或时区不同会产生偏差。

## 响应式界面

每个平台只需一个安装包。播放页按当前窗口 `高度 / 宽度` 自动重排：

- `> 1`：竖屏，五个控制按钮一行，横向进度条。
- `0.75～1`：方屏，左侧控制、中间唱片、右侧遍数与竖向进度。
- `< 0.75`：宽横屏，沿用三栏结构并增加留白。

旋转、iPad 分屏或窗口缩放只改变布局，不得重建播放器、seek、换曲或清零。

## 技术栈

| 范畴      | 选型                                                                       |
| --------- | -------------------------------------------------------------------------- |
| App       | React Native 0.75.5、React 18.3.1、TypeScript `^5.5.4`（lockfile 5.9.3）   |
| 播放      | react-native-track-player `^4.1.0`（lockfile 4.1.2）                       |
| 导航/状态 | React Navigation 6、Zustand 4.5、MMKV 2.12                                 |
| Android   | minSdk 23、target/compileSdk 35、Kotlin 1.9.25、Hermes、旧架构             |
| iOS       | CocoaPods、Hermes、Universal、Objective-C++ 原生入口与模块                 |
| 质量      | Jest 29、React Native Testing Library、ESLint、Prettier、TypeScript strict |

## 快速开始

首次搭建环境请先看[开发环境](docs/DEVELOPMENT.md)。常用命令：

```bash
npm ci
npm start
npm run android
npm run ios -- --mode Debug --extra-params "IPHONEOS_DEPLOYMENT_TARGET=15.0"

npm run typecheck:app
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:coverage
```

当前自动化数量、覆盖率分母、硬阈值和最近实测基线统一记录在[测试手册](docs/TESTING.md)，静态检查遗留项见 [Lint 文档](docs/LINTING.md)。高覆盖率不等于原生后台、锁屏、来电、蓝牙或多设备同步已经通过真机验证。

iOS Shared Scheme 当前把 Run 配成 Release；开发调试必须显式使用 `--mode Debug`，或在 Xcode 中临时选择 Debug。快速开始中的 deployment target 覆盖仅用于当前 Xcode 27 Simulator，不能证明 iOS 13/14 兼容；旧工具链可省略。详见[新开发者上手](docs/ONBOARDING.md#7-ios--ipados-首次运行)。

Android release 签名需要本地 `android/app/release.keystore` 以及 `STARLIGHT_STORE_PASSWORD`、`STARLIGHT_KEY_ALIAS`、`STARLIGHT_KEY_PASSWORD`。签名、Archive 和商店发布步骤见[发布手册](docs/RELEASE.md)。

## 资源、本地数据与网络

- Android 和 iOS 各内置同样的 21 首 MP3，每端约 115.88 MiB，运行时不下载音频。
- 设置、当前曲目、模式、累计遍数、按本地日期保存的播放统计和最多 1,000 条诊断日志保存在设备 MMKV。
- 没有业务后端、远程数据库、缓存、消息队列、登录、支付、推送、广告或分析 SDK。
- Android 仍声明 `INTERNET`，iOS ATS 仍允许任意请求，但当前业务代码没有网络调用；这是待收紧项。
- 两端 `link-assets-manifest.json` 已过时，不能作为发布校验依据；详见[音频资产台账](docs/AUDIO_ASSETS.md)。

## 文档索引

- 总入口：[文档门户](docs/README.md)、[新开发者上手](docs/ONBOARDING.md)、[贡献规范](CONTRIBUTING.md)
- 架构：[项目全景](docs/ARCHITECTURE.md)、[播放状态机](docs/PLAYBACK_ARCHITECTURE.md)、[本地数据模型](docs/STORAGE_MODEL.md)、[设计决策](docs/DECISIONS.md)
- 开发与质量：[开发环境](docs/DEVELOPMENT.md)、[测试手册](docs/TESTING.md)、[人工 QA](docs/QA_PLAYBOOK.md)、[设备矩阵](docs/DEVICE_TEST_MATRIX.md)、[故障排查](docs/TROUBLESHOOTING.md)、[Lint](docs/LINTING.md)
- 发布与维护：[发布手册](docs/RELEASE.md)、[测试执行记录](docs/test-runs/README.md)、[版本发布记录](docs/release-records/README.md)、[当前风险](docs/KNOWN_ISSUES.md)、[音频资产](docs/AUDIO_ASSETS.md)、[无障碍](docs/ACCESSIBILITY.md)
- 用户与历史：[用户手册](docs/USER_MANUAL.md)、[隐私政策](PRIVACY.md)、[更新记录](CHANGELOG.md)、[接管手册](docs/TAKEOVER.md)、[代码走查快照](docs/CODE_REVIEW.md)
