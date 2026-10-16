# StarlightPlayer 项目接管手册

> 依据 2026-10-16 `main` 分支的源码、配置和本机构建产物核对。本文只描述可证实的现状；不把推测写成事实。

## 1. 技术栈和主要框架

- React Native 0.75.5 + React 18.3.1；TypeScript 声明为 `^5.5.4`，lockfile 当前解析为 5.9.3，`strict: true`。
- `react-native-track-player` 声明为 `^4.1.0`、lockfile 当前解析为 4.1.2，负责本地音频、后台播放、MediaSession/锁屏控制。
- React Navigation 6 底部 Tab；Zustand 管 UI 状态；MMKV 管本地持久化和 UI/PlaybackService 通信。
- MaterialIcons、Safe Area、Gesture Handler 负责 UI 基础能力。
- Android 旧架构（`newArchEnabled=false`）+ Hermes，minSdk 23，target/compileSdk 35。
- iOS/iPadOS 工程目标为 13.4、Universal，使用 CocoaPods 和 Objective-C++ AppDelegate/SceneDelegate 原生入口。注意：当前已上传的 1.0.0 build 4 Archive 实际最低系统为 15.0，详见第 6 节。

## 2. 目录结构

```text
StarlightPlayer/
├── index.js                     # RN 入口，注册 App 和 PlaybackService
├── src/
│   ├── App.tsx                  # 播放器初始化、恢复、导航
│   ├── screens/                 # 播放/列表/我的
│   ├── components/              # 播放控件、进度条、曲目信息
│   ├── services/playbackService.ts
│   │                            # 后台事件、计数、模式决策、恢复
│   ├── store/                   # Zustand settings/stats
│   ├── constants/               # 曲目元数据、颜色
│   └── utils/
│       ├── storage.ts           # MMKV 跨生命周期协议
│       ├── playerCommandQueue.ts# JS 队列 + 原生进程锁
│       ├── playbackCycle.ts     # 遍数资格/seek 语义
│       ├── playbackDecision.ts  # N 遍优先的纯决策
│       ├── trackManager.ts      # 曲目替换与索引
│       └── logger.ts            # 本地诊断日志
├── android/                      # Gradle、Manifest、Kotlin 模块、21 首 MP3
├── ios/                          # Xcode/CocoaPods、ObjC++ 模块、21 首 MP3
├── __tests__/                    # Jest 纯逻辑与组件测试
├── docs/                         # 用户、开发、架构、发布、测试和资产文档
├── scripts/copyAssets.js         # 可选音频复制工具
└── patches/patch-rntp.sh         # RNTP Android Maven 源替换脚本
```

## 3. 主要启动入口和核心流程

接管时必须同时守住两项产品核心：完整 N 遍计数，以及按设备本地共同时间对齐的同步模式。同步负责“大家此刻播到哪里”，N 遍状态机负责“什么才算完成一遍”；二者不能互相替代。

1. `index.js` 先加载 logger，再注册 `App` 和 `PlaybackService`。
2. `App.tsx` 通过进程级命令锁调用 `setupPlayer`，配置 Android 后台继续播放、30 秒前台宽限、RNTP RepeatMode Off。
3. 如原生播放队列仍在，App 直接接管，不 reset；否则按 `player_state.trackIndex` 重建单曲队列。
4. UI 播放/暂停/切歌/seek 和后台 Remote\* 事件全部进入 `playerCommandQueue`。正常 RNTP HeadlessJS 复用同一 ReactContext，由 JS 链排队；Android/iOS 原生 `PlayerCommandLock` 额外防御多 ReactContext/桥接重入。
5. 单曲原生队列到尾后产生 `PlaybackQueueEnded`：校验 generation/曲目/结束位置 → 按 `cycleEligible` 计数 → 先判断 N 遍 → 再执行四种模式。
6. 异常停止时，`PlaybackError`/`PlayerError`/`PlaybackState` 写日志；若仍然 `expected_playing=true`，watchdog 重建队列并验证播放，最多退避恢复三轮。

### 3.1 播放页响应式契约（需求 29）

Android、iOS 各自只需一个安装包；iOS Target 的 `TARGETED_DEVICE_FAMILY` 必须保持 `1,2`，同时支持 iPhone 与 iPad。运行时依据当前窗口 `高度 / 宽度` 选型，不能依据设备型号，也不能把三类布局拆成构建变体：

| 窗口比例  | 布局约束                                                                                                                                |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `> 1`     | 竖屏：保持纵向主体；模式、上一首、播放/暂停、下一首、同步五按钮一行。当前遍数在横向时间轴上方，每首重复遍数在轴下方、与起止时间同一行。 |
| `0.75～1` | 方屏（含 `0.75`、`1`）：方案 3 三栏；左侧五按钮纵向等分，中间曲名+唱片，右侧遍数组+竖向时间轴。                                         |
| `< 0.75`  | 横屏：沿用方案 3，增加栏间留白；尺寸取决于屏幕短边并设最小/最大值，宽屏和电视不得无限放大。                                             |

方案 3 的几何不变量：左右轨道等高；中央唱片保持视觉中心；右侧“当前遍数（大）/每首重复遍数（小）”上下成组并位于竖向时间轴左侧，当前/总时长分别固定在轴的上、下端；播放/暂停、唱片和遍数组共享水平视觉中轴；底部 Tab 与安全区域不得遮挡内容。大数字显示千分位，不显示“当前遍数/每首重复遍数”汉字，但保留无障碍语义。

响应式重排不得重新初始化 RNTP、替换队列、seek 或写入新的播放任务。四种播放模式、N 遍优先、`cycleEligible`、持久化续数和同步模式的所有业务规则保持不变；旋转前后的曲目、位置、播放状态、当前遍数和同步资格必须连续。

## 4. 配置、环境变量、外部依赖

| 位置                                                 | 作用                                                            |
| ---------------------------------------------------- | --------------------------------------------------------------- |
| `package.json` / `package-lock.json`                 | JS 依赖和 npm scripts                                           |
| `tsconfig.json`                                      | TypeScript strict 约束和 `@/*` 别名                             |
| `babel.config.js` / `metro.config.js`                | RN 转译与打包                                                   |
| `jest.config.js` / `.eslintrc.js` / `.prettierrc.js` | 测试和质量规则                                                  |
| `android/build.gradle`                               | SDK 23/35、Kotlin 1.9.25、Maven 镜像                            |
| `android/app/build.gradle`                           | appId、版本、签名、Hermes/RN                                    |
| `AndroidManifest.xml`                                | 前台播放/通知/唤醒权限、诊断 FileProvider                       |
| `ios/Podfile` / `Info.plist`                         | 源码目标 iOS/iPadOS 13.4、iPad 四方向/分屏、UIScene、后台 audio |
| `ios/.xcode.env`                                     | Xcode 脚本的 Node 路径；当前硬编码 `/opt/homebrew/bin/node`     |
| `react-native.config.js`                             | iOS 音频和字体资源                                              |

当前版本来源并未统一：`package.json` 为 1.0.0；Android 为 `versionName 1.0 / versionCode 3`；iOS 为 `1.0.0 (4)`；诊断文本显示 1.0。每次发版必须按 [RELEASE.md](RELEASE.md) 的清单逐项更新和核验。

Android release 签名需要：

- `STARLIGHT_STORE_PASSWORD`
- `STARLIGHT_KEY_ALIAS`
- `STARLIGHT_KEY_PASSWORD`
- `android/app/release.keystore`（不应入库）

没有发现运行时 dotenv、API key、后端 URL 或业务密钥。仓库中存在 Xcode 使用的 `ios/.xcode.env`，它不是业务环境变量文件。Gradle/npm/CocoaPods 仅在构建期访问外部仓库。

## 5. 数据库、缓存、消息队列、第三方服务

- 数据库：无。
- 远程缓存：无。MMKV 是设备本地 KV，不是服务端缓存。
- 消息队列：无。
- 网络 API/登录/支付/推送/广告/分析：无。
- 平台服务：仅使用 Android MediaSession/前台服务、iOS Now Playing/后台音频、系统分享面板。
- 本地数据：设置、曲目/模式、当前遍数、每日统计、诊断日志。卸载 App 可删除。

## 6. 测试、构建、启动命令

```bash
npm start                  # Metro
npm run android            # Android debug 安装/启动
npm run ios -- --mode Debug --extra-params "IPHONEOS_DEPLOYMENT_TARGET=15.0" # 当前 Xcode 27 Simulator
npm run typecheck:app      # 只校验 App 源码
npm run typecheck          # tsc --noEmit
npm run lint               # ESLint
npm run format:check       # Prettier 检查
npm test                   # Jest
npm run test:coverage      # Jest 覆盖率
./android/gradlew -p android assembleDebug
./android/gradlew -p android assembleRelease
./android/gradlew -p android bundleRelease
```

`npm run copy-assets` 默认从仓库根目录 `assets/audio` 复制，但当前没有该目录；两端需要的 21 个 MP3 已分别在 Android/iOS 目录。脚本只复制 Android，不会同步 iOS。使用时要显式传入源目录：`node scripts/copyAssets.js /absolute/audio/path`，并按 [AUDIO_ASSETS.md](AUDIO_ASSETS.md) 单独校验双端资源。

自动化数量、覆盖率口径和最近实测结果以 [TESTING.md](TESTING.md) 为准；warning 与格式遗留以 [LINTING.md](LINTING.md) 为准。当前 Shared Scheme 的 Run/LaunchAction 使用 Release，iOS 日常调试要显式传 `--mode Debug`；Xcode 27 的额外参数只用于本机 Simulator，旧工具链可省略，且不能作为 iOS 13/14 兼容证据。完整说明见 [ONBOARDING.md](ONBOARDING.md#7-ios--ipados-首次运行)。

### iOS 13/14 兼容目标与当前发布风险

工程中的 `Podfile` 和 Target 仍以 iOS 13.4 为目标；不得因为开发机升级而静默永久抬高。当前 Xcode 27 本机验证若必须使用 iOS 15，可仅对本次 Pods 安装临时覆盖：

```bash
(cd ios && STARLIGHT_LOCAL_IOS_DEPLOYMENT_TARGET=15.0 pod install)
# 本机测试的 xcodebuild 命令还需追加 IPHONEOS_DEPLOYMENT_TARGET=15.0
```

这条命令只覆盖本机 Xcode 27 的 Simulator/当前 SDK 验证，不能证明 iOS 13/14 兼容。更重要的是，当前已上传的 `1.0.0 (4)` Archive 内 `MinimumOSVersion=15.0`，所以 build 4 实际不支持 iOS 13/14。要恢复兼容，必须生成更高 build、在上传前检查 Archive 内最终 App 的 `MinimumOSVersion` 确为 `13.4`，并用旧系统真机回归。发布步骤和检查命令见 [RELEASE.md](RELEASE.md)。

### 响应式与平台验收矩阵

| 层级             | 最低覆盖                                                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| Jest/组件        | 比例 `>1`、`=1`、`=0.75`、`<0.75`；五按钮顺序；遍数显示规则；超大数字；旋转只重排、不触发播放命令。              |
| iOS Simulator    | Xcode 27 + iOS 15+：iPhone 与 iPad 竖屏、4:3、16:9、分屏，安全区域/大字体/旋转，播放中及同步中切换布局状态连续。 |
| Android Emulator | API 23 与 API 35，手机竖横屏、4:3 平板、16:9/电视尺寸；触摸目标、系统返回、TV/D-pad 焦点（如启用 TV）。          |
| iOS 13/14 验证轨 | 旧 Simulator 做启动和基础布局；iOS 13/14 真机做安装、音频、旋转、锁屏、后台、中断恢复。                          |
| 双端真机         | 四种模式 × repeat 1/大数 × 同步开关；前后台、锁屏/通知、来电与蓝牙；多设备同步漂移。模拟器通过不能替代此项。     |

## 7. 文档地图与仍缺资料

- [文档门户](README.md)：按角色、任务和权威范围组织全部工程文档。
- [新开发者上手](ONBOARDING.md)：fresh clone 后 60 分钟内完成环境、启动与基线验证。
- [项目全景架构](ARCHITECTURE.md) / [本地数据模型](STORAGE_MODEL.md)：JS、原生、RNTP 与 MMKV 的边界。
- [用户手册](USER_MANUAL.md)：面向最终用户的功能、操作和 FAQ。
- [播放架构](PLAYBACK_ARCHITECTURE.md)：计数、同步、队列和恢复不变量。
- [开发环境](DEVELOPMENT.md)：首次搭建与本地命令。
- [测试手册](TESTING.md) / [人工 QA](QA_PLAYBOOK.md) / [设备矩阵](DEVICE_TEST_MATRIX.md)：自动化和真机验收。
- [测试执行记录](test-runs/README.md)：按 commit、build 和设备保存每个候选版本的实际结果。
- [故障排查](TROUBLESHOOTING.md)：按症状采证、判定和安全恢复。
- [发布手册](RELEASE.md) / [版本发布记录](release-records/README.md)：发布方法与每个版本的实际制品/渠道状态。
- [音频资产](AUDIO_ASSETS.md)：双端资源、校验和替换流程。
- [无障碍现状](ACCESSIBILITY.md)：关怀模式边界和完整适配缺口。
- [当前风险](KNOWN_ISSUES.md) / [设计决策](DECISIONS.md)：尚未关闭的问题和不能随意破坏的方案理由。
- [`CONTRIBUTING.md`](../CONTRIBUTING.md)：提交、评审、测试和文档同步规则。

仍需项目所有者提供、无法从代码恢复的资料：音频来源与授权证明、源码许可/分发条款（仓库当前没有 `LICENSE`）、Android release keystore 的受控保管/轮换信息、Apple 团队和证书的维护人、正式支持渠道、历次商店发布与回滚台账。仓库当前没有 CI；版本号也分散在 package、Android、iOS 和诊断文本中。

## 8. 需要项目所有者确认的问题

1. 共修对齐当前按“设备本地当日 00:00”计算；跨时区和设备时钟不准时不会一致。这是否为最终产品定义？
2. Android 是否需要保留 `INTERNET` 权限，iOS 是否需要 `NSAllowsArbitraryLoads=true`？当前功能不需要。
3. 永久音频源目录应以 Android、iOS 还是另一份 canonical assets 为准？当前双份各约 116 MiB，且两份 manifest 已与实际 A05/D15 资源不一致。
4. 每日统计按“完成时所在的本地日期”入桶，跨零点的一遍归到第二天；是否符合业务口径？
5. 诊断文件包含设备型号、系统版本、播放事件和本地时间；这一字段范围是否获产品确认，是否需要增加用户清除日志或导出前脱敏能力？

## 9. 建议的接管计划

1. 先确认上述产品问题和音频授权，冻结播放不变量与 canonical 音频源。
2. 优先重新生成兼容目标明确的 iOS 更高 build，并核验 Archive 最终最低系统；不要只看 Podfile。
3. 修复音频 manifest 和 [LINTING.md](LINTING.md) 记录的静态检查债务，再建立 CI 质量门禁。
4. 按设备矩阵做 Android/iOS 真机回归，重点覆盖四模式 × 重复遍数 × 同步开关 × 前后台/锁屏/中断。
5. 在华为 Android 12 等受限后台环境连续播放数小时，导出完整诊断文件；同时用至少一台 iOS 13/14 真机验证兼容候选。
6. 收紧当前业务不需要的网络权限/ATS，统一版本来源，并将签名、商店发布和回滚台账移交给明确维护人。
