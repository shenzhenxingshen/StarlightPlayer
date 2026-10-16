# 测试手册

> 最后核对：2026-10-16；自动化数字对应源码 commit `0698f629376c73b8daee3aa7fbdaf2af1c63b29c`。本文说明测试代码如何运行、覆盖率如何解释、mock 能证明什么，以及失败时如何排查。发布候选的人工步骤见 [QA 执行手册](QA_PLAYBOOK.md)，设备覆盖见 [设备与发布候选测试矩阵](DEVICE_TEST_MATRIX.md)，每次执行结果写入 [`test-runs/`](test-runs/README.md)。

## 1. 测试分层与结论边界

| 层级                        | 当前实现                                           | 能证明                                                   | 不能证明                                                         |
| --------------------------- | -------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------- |
| TypeScript/Jest/RNTL        | 28 suites、298 tests；Node 环境和内存 mock         | 业务决策、持久化协议、组件交互、异常分支、响应式布局计算 | RNTP 原生状态机、真实解码、系统后台策略、硬件/系统事件           |
| iOS XCTest                  | `StarlightPlayerTests` 中 1 个根控制器 smoke test  | App 能在指定 Simulator/设备上启动并创建根控制器          | 播放、锁屏、后台、来电、蓝牙、同步听感和完整 UI 流程             |
| Android JVM/instrumentation | **尚未建立**                                       | 无                                                       | 即使 Gradle task 显示成功，也不能在 0 个测试时视为原生回归 PASS  |
| Simulator/Emulator 人工回归 | 可执行页面、布局、基础流程和部分进程恢复测试       | 指定 build 在指定模拟环境中的实际行为                    | 真机后台保活、锁屏硬件链路、电话、蓝牙、厂商省电和多设备听感同步 |
| 真机、长时和多设备测试      | 按发布候选逐次执行，仓库当前没有完整的正式执行记录 | 指定制品、设备、系统和条件下的端到端行为                 | 不能外推到未测试机型、系统或另一个 build                         |

测试通过只对记录中的 Git commit 和二进制哈希有效。代码、音频、签名方式或构建号变化后，应重新判断受影响的测试，不得沿用旧结论。

## 2. JavaScript/TypeScript 自动化

### 2.1 常用命令

首次检出或锁文件变化后使用锁定依赖安装；不要在发布验证时用会改写 lockfile 的安装方式：

```bash
npm ci
```

运行全部 Jest：

```bash
npm test -- --runInBand
```

监听模式和全量覆盖率：

```bash
npm run test:watch
npm run test:coverage -- --runInBand
```

`--runInBand` 让涉及共享 MMKV mock、模块单例和事件监听器的套件串行执行，也更容易复现失败；本地快速开发可以省略，但发布基线应保留。

测试目录的放置、setup/mock 契约和 reset 示例见 [`__tests__/README.md`](../__tests__/README.md)。

### 2.2 单文件、单用例和关联文件

只跑一个文件：

```bash
npm test -- --runInBand __tests__/utils/playbackDecision.spec.ts
```

只跑名称匹配的一个用例：

```bash
npm test -- --runInBand __tests__/services/playbackService.spec.ts \
  -t 'play-one 达 N 遍后停止'
```

按变更源文件查找关联测试：

```bash
npm test -- --runInBand --findRelatedTests src/utils/playbackDecision.ts
```

单文件或 `-t` 只用于开发定位；正式记录必须重新执行全量命令。`--findRelatedTests` 依赖静态导入关系，不能发现所有原生、持久化或跨进程影响。

### 2.3 当前测试覆盖内容

| 测试组                                                             | 主要内容                                                                               |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `App*.spec.tsx`                                                    | 双端初始化、setup 重试、原生队列接管、失败页、播放意图恢复、响应式 Tab                 |
| `services/playbackService*.spec.ts`                                | 四模式、N 遍、远程控制、QueueEnded 校验/去重、generation、重试、watchdog、Android 事件 |
| `utils/storage.spec.ts`                                            | 设置、曲目/换曲协议、两套计数、资格、播放意图、每日统计和旧数据迁移                    |
| `utils/trackManager.spec.ts`                                       | 单曲队列、上下首、手动重选清零、恢复保留、并发 token                                   |
| `utils/playbackCycle.spec.ts`                                      | 0～1.5 秒资格、seek 原因、同步暂停/恢复连续性                                          |
| `utils/playbackDecision.spec.ts`                                   | N 遍优先、四种模式、QueueEnded 位置和播放意图决策                                      |
| `utils/syncUtils.spec.ts`                                          | 本地当天 00:00 时间取模、边界和时间格式                                                |
| `utils/playerCommandQueue.spec.ts`                                 | 命令严格串行、原生锁、失败后续行                                                       |
| `utils/playerOptions.spec.ts`                                      | 普通/同步/关怀远程能力和 Android 后台策略                                              |
| `utils/playerLayout.spec.ts` / `components/PlayerLayouts.spec.tsx` | 三类比例边界、尺寸上限、竖/方/横布局与旋转稳定性                                       |
| `utils/repeatDisplay.spec.ts` / `utils/numberFormat.spec.ts`       | 遍数显示矩阵、安全大数和千分位                                                         |
| `components/*.spec.tsx`                                            | 五按钮、进度拖动与无障碍动作、曲目信息、黑胶动画清理                                   |
| `screens/*.spec.tsx`                                               | 播放、列表、“我的”、自定义遍数、诊断导出和异常路径                                     |
| `store/*.spec.ts` / `utils/diagnosticsAndLogger.spec.ts`           | 设置/统计 store、日志上限、格式和诊断失败                                              |

## 3. 覆盖率：分母、阈值和发布口径

### 3.1 分母是什么

`jest.config.js` 的 `collectCoverageFrom` 会把 `src/**/*.{ts,tsx}` 纳入，即使文件没有被测试 import；以下内容被明确排除：

- `src/**/*.d.ts`；
- `src/types/**`；
- `src/constants/**`。

当前分母是其余 25 个 TypeScript/TSX 文件。Jest 按 Istanbul 插桩后分别计算：

| 指标       | 分母含义                                   | 2026-10-16 命中/总数 | 报告值 |
| ---------- | ------------------------------------------ | -------------------- | ------ |
| statements | 可执行语句                                 | 1,143 / 1,159        | 98.61% |
| branches   | `if`、条件表达式、默认分支等生成的分支出口 | 831 / 904            | 91.92% |
| functions  | 函数、回调等可调用单元                     | 241 / 244            | 98.77% |
| lines      | 至少包含一个可执行语句的源码行             | 1,060 / 1,071        | 98.97% |

分母**不包括**：`ios/`、`android/` 原生代码，MP3 解码路径，第三方依赖，测试代码和 mock，资源文件，以及操作系统后台/锁屏/蓝牙实现。因此 98% 不能解释为“整个 App 98% 已验证”，branches 91.92% 也不表示所有产品边界都已覆盖。

覆盖率报告默认生成到被 Git 忽略的 `coverage/`；HTML 入口为 `coverage/lcov-report/index.html`。每次比较必须使用相同 commit、Node/Jest 版本和全量覆盖率命令。

### 3.2 当前硬阈值

`jest.config.js` 当前只设置全局最低门槛：

| 指标       | 硬阈值 |
| ---------- | ------ |
| lines      | 50%    |
| statements | 50%    |
| functions  | 40%    |
| branches   | 30%    |

这些值是防止覆盖率彻底失效的技术下限，不是当前质量基线。比如 statements 从约 98% 降到 51% 仍可能通过配置阈值，所以发布判断还必须遵守：

1. 全量测试通过，四项覆盖率相对最近已接受基线无未解释下降；
2. 新增或修改的业务判断覆盖成功、失败、边界和竞态路径；
3. 播放计数、同步资格、换曲、恢复和持久化等高风险决策应逐分支验证；
4. 不用无意义断言、排除文件或只测 mock 调用来“抬覆盖率”；
5. 确需接受下降时，在当次 [`test-runs`](test-runs/README.md) 记录数值、原因、风险和批准人。

后续可以单独提高 `coverageThreshold`，但应先在 CI 中稳定执行并明确原生测试路线；本次文档更新不改变配置。

## 4. Jest mock 的边界

全局替身位于 `__tests__/jest.setup.js` 和 `__tests__/mocks/`。阅读测试结果时必须考虑以下差异：

### 4.1 TrackPlayer

- `setupPlayer`、`play`、`pause`、`seekTo` 等只是立即完成的 `jest.fn`，不会解码音频，也不会自动改变播放状态、位置或队列。
- `getPlaybackState`、`getProgress` 和 hooks 默认返回固定值；测试必须显式设置返回值，不能把默认值当 RNTP 行为。
- `__emit` 只是同步/Promise 方式调用登记的回调；不会复制 AVPlayer/ExoPlayer 的事件时序、重复 QueueEnded、线程竞争或 MediaSession 生命周期。
- mock 的事件表每种事件只保存一个 handler，不能证明真实环境中多个订阅者的行为。
- 不覆盖 MP3 priming/padding、缓冲、音频焦点、通知、锁屏、耳机和后台 Service。

### 4.2 MMKV

- 使用进程内共享 `Map`，不覆盖磁盘落盘、原生进程重启、损坏、并发、升级安装、空间不足或系统清理。
- `jest.clearAllMocks()` 只清 mock 调用记录，不会清空这个 `Map`；每个依赖初始状态的测试必须显式 `clearAll()` 或写入完整前置数据。
- “重新 import 模块”不是 App 重启证据；跨启动恢复必须补设备级测试。

### 4.3 其他原生/UI mock

- `PlayerCommandLock.acquire` 总是成功，不制造跨 JS runtime 争用、续租失败或超时。
- `DiagnosticExporter` 默认只返回固定临时路径，不创建文件、不打开系统分享，也不覆盖权限/磁盘/取消路径，除非用例显式改写返回值。
- Safe Area 固定为 0、图标变成字符串、gesture handler 为空；因此像素布局、刘海、安全区和真实手势仍需 Simulator/真机检查。
- `console.warn` 在全局被抑制；与警告本身有关的回归必须局部恢复或显式 spy，不能依赖控制台自然失败。

Mock 的目的，是让业务输入输出可控；它不是对第三方库或操作系统的仿真认证。

## 5. 新增或修改测试的规范

### 5.1 何时必须补测试

以下变更不能只靠人工验证：

- 新增/修改播放模式、计数、同步、seek、QueueEnded、重试、恢复或持久化逻辑；
- 新增条件分支、异常处理、定时器、平台分支或并发 token；
- 修复线上问题：先添加能在修复前失败的回归用例，再实现修复；
- 修改可见规则、输入校验、布局分类、无障碍 role/label/state；
- 改变旧版本数据结构时，补合法、缺失、损坏和迁移后的测试。

原生行为变化还必须在对应 XCTest/Android 测试和 [QA 执行手册](QA_PLAYBOOK.md) 中补验证，不能只增加 Jest mock。

### 5.2 用例设计

1. 文件放在 `__tests__/` 下与源目录对应，命名 `*.spec.ts` 或 `*.spec.tsx`。
2. 用例名称描述前置、动作和期望，例如“同步从中段加入时不授予当前遍计数资格”。
3. 每个决策至少覆盖正常值、边界两侧、非法/缺失输入和失败恢复；时间边界应包含恰好 0、1.5 秒及其两侧。
4. 播放核心规则同时断言“发生什么”和“没有提前发生什么”，例如 N 遍前不换曲、重复事件不再计数。
5. 平台差异使用独立用例或独立文件，明确设置/恢复 `Platform.OS`；不能依赖开发机默认平台。
6. 异步事件要等待最终可观察结果，使用 `await`/`waitFor`；禁止用固定 sleep 掩盖竞态。
7. 使用 fake timers 的测试在结束前恢复 real timers，并清理 timer、listener、mock 返回值和持久化状态。
8. 优先断言用户可见结果、持久化状态和播放器命令顺序；避免只断言内部私有实现。
9. 不提交 `.only`、无理由 `.skip` 或自动更新后未人工核对的 snapshot。
10. 测试数据使用虚构值；不得把真实用户诊断、账号、设备标识或签名信息写入 fixture。

### 5.3 评审清单

- 失败时是否真的能阻止对应缺陷回归？
- 是否误把 mock 默认行为当成系统保证？
- 是否覆盖阈值等号两侧、最大安全整数、空值和损坏持久化数据？
- 是否覆盖重复事件、过期 generation、命令失败后续行和用户意图改变？
- 是否保持用例相互独立，任意顺序/单独运行都能通过？
- 是否需要把 DEVICE_TEST_MATRIX 中的 NOT RUN 场景转为本次人工必测？

## 6. iOS XCTest

当前共享 scheme 已包含 `StarlightPlayerTests`，Test Action 使用 Debug。优先通过 workspace 运行，以加载 CocoaPods：

```bash
xcrun simctl list devices available
```

从列表选择实际存在的 Simulator UDID，然后运行。当前 Xcode 27 的 SDK 不接受 13.4 作为 Simulator deployment target，因此本机测试命令需要追加 `IPHONEOS_DEPLOYMENT_TARGET=15.0`；较旧且确实支持 13.4 的工具链可以省略。这个覆盖只用于本机测试，不能用于生成或证明支持 iOS 13/14 的发布包：

```bash
STARLIGHT_IOS_TEST_UDID='<Simulator-UDID>'
xcodebuild \
  -workspace ios/StarlightPlayer.xcworkspace \
  -scheme StarlightPlayer \
  -configuration Debug \
  -destination "platform=iOS Simulator,id=${STARLIGHT_IOS_TEST_UDID}" \
  -only-testing:StarlightPlayerTests \
  IPHONEOS_DEPLOYMENT_TARGET=15.0 \
  test
```

需要留存 Xcode 原始结果时，为每次执行使用一个从未存在过的外部路径：

```bash
STARLIGHT_XCRESULT_PATH='/absolute/path/to/evidence/StarlightPlayer-tests.xcresult'
STARLIGHT_IOS_TEST_UDID='<Simulator-UDID>'
xcodebuild \
  -workspace ios/StarlightPlayer.xcworkspace \
  -scheme StarlightPlayer \
  -configuration Debug \
  -destination "platform=iOS Simulator,id=${STARLIGHT_IOS_TEST_UDID}" \
  -resultBundlePath "${STARLIGHT_XCRESULT_PATH}" \
  IPHONEOS_DEPLOYMENT_TARGET=15.0 \
  test
```

`.xcresult` 体积大且可能包含设备/路径信息，不应提交到仓库；按 [`test-runs/README.md`](test-runs/README.md) 记录受控链接和 SHA-256。当前 XCTest 只有 `testRootViewControllerExists`，其 PASS 只能记作 native smoke，不可替代 P/S/L/U 回归。

iOS 13/14 兼容测试必须选真实的旧 runtime/真机，并且候选 Archive 的 `MinimumOSVersion` 确实允许安装。当前 1.0.0 (4) Archive 最低为 iOS 15.0，不能用当前 XCTest 结果宣称支持 iOS 13/14。

## 7. Android 原生测试缺口

仓库当前没有 `android/app/src/test` 或 `android/app/src/androidTest` 测试，也没有已配置的 instrumentation runner。下列 Gradle task 即使构建成功或报告 0 tests，也**不能**记作 Android 原生测试 PASS：

```bash
./android/gradlew -p android :app:testDebugUnitTest
./android/gradlew -p android :app:connectedDebugAndroidTest
```

建议按风险依次建立：

1. JVM 单元测试：原生诊断导出、输入/序列化等不依赖设备的逻辑；
2. instrumentation：`PlayerCommandLock`、FileProvider/诊断分享、Activity/Service 生命周期；
3. MediaSession/前台服务设备测试：通知、RemotePlay/Pause/Next/Previous、划掉 UI、进程重建；
4. API 23、31、33/34、35 与主流厂商真机回归。

建立后，原生测试数量、Gradle task、设备 API 和结果必须进入每版本执行记录。Debug instrumentation 仍不能替代 release APK/AAB 的真机验收。

## 8. 发布前自动化门槛

从冻结的候选 commit 执行：

```bash
npm ci
npm run typecheck:app
npm run typecheck
npm run lint
npm run format:check
npm run test:coverage -- --runInBand
git diff --check
```

2026-10-16 基线：28/28 suites、298/298 tests 通过；覆盖率见第 3 节；`playbackService.ts` statements 99.62%、branches 90.36%、functions/lines 100%。当前 `format:check` 已知失败、ESLint 有 31 个 warning；发布记录必须如实写明，不能因为 Jest 通过就忽略静态检查。详见 [LINTING.md](LINTING.md)。

随后执行 [QA 执行手册](QA_PLAYBOOK.md) 中适用于本次候选的 P/S/L/U 场景，并将结果写入独立的 [`test-runs`](test-runs/README.md) 文件。完整发布门槛仍以 [双端发布手册](RELEASE.md) 为准。

## 9. 失败排查

### 9.1 先固定现场

任何失败先记录：完整命令、Git commit、未提交差异、Node/npm/Xcode/Java/Gradle 版本、平台/设备/OS、制品版本和 SHA-256。不要先清缓存或重装，因为这会丢失复现条件。

### 9.2 Jest/覆盖率

1. 用第 2.2 节命令单跑失败文件，再跑完整套件，判断是确定失败、顺序污染还是并发问题。
2. 检查 fake timers 是否恢复、MMKV `Map` 是否清理、TrackPlayer handler 是否重置、Platform 和 `Date.now` mock 是否还原。
3. 若只在全量失败，重点排查模块单例、未移除 listener、共享持久化和未等待的 Promise。
4. 只有证据指向 transform/cache 时才加 `--no-cache` 复跑；缓存消失不等于根因解决。
5. 覆盖率突降时比较 `collectCoverageFrom`、实际纳入文件、命令和依赖版本，不要直接降低阈值或新增排除。

### 9.3 iOS

1. 用 `xcodebuild -workspace ios/StarlightPlayer.xcworkspace -scheme StarlightPlayer -showdestinations` 或 `xcrun simctl list devices available` 确认 destination 存在且 runtime 可用。
2. 确认使用 `.xcworkspace`，Pods 与 lockfile 一致；区分编译失败、测试宿主未启动、断言失败和 Simulator 基础设施失败。
3. 保留 `.xcresult` 和完整 `xcodebuild` 输出；基础设施失败只能记 BLOCKED，不能记功能 FAIL 或 PASS。
4. 不把删除 DerivedData/执行 clean 作为第一步；如果清理后恢复，仍要记录缓存症状并重新从冻结 commit 完整验证。

### 9.4 Android/设备行为

1. 先核对实际安装包：`adb shell dumpsys package com.starlightplayer` 中的 versionName/versionCode 应与记录一致。
2. 分开记录“构建失败、安装失败、启动失败、播放失败、被系统终止”，并采集相关时间窗的 logcat、App 诊断和 MediaSession/通知状态。
3. `force-stop` 是用户/系统强制停止语义，不等于普通后台或进程回收；不得用它证明后台自动恢复。
4. 厂商省电导致的终止要同时记录电池策略、白名单和系统提示，不要把另一台设备的结果外推。
5. 原始日志上传前按 `DEVICE_TEST_MATRIX.md` 脱敏；仓库只保存执行摘要、证据哈希和受控链接。

无法稳定复现时，至少重复三次并分别记录时间、状态和证据，不能用一次成功覆盖一次失败。问题修复后新建一次执行记录；不要改写已经用于发布决策的旧结果。
