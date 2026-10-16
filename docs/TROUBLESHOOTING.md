# 故障排查手册

> 最后核对：2026-10-16。本手册按“症状 → 采证 → 判定 → 安全恢复”组织。先保留日志、版本、曲目、模式、重复值、同步状态和复现时间，再做恢复；不要一遇到问题就删除 Pods、DerivedData、Gradle 全局缓存或 App 数据。

## 1. 通用采证原则

每次问题至少记录：

```text
Git commit / App 版本与 build：
平台、设备、系统版本：
Debug / Release、安装来源：
曲目与播放模式：
每首重复遍数、当前遍数：
同步/关怀模式：
操作步骤和发生时间（含时区）：
预期 / 实际：
是否可重复：
App 诊断文件、系统日志、截图/录屏：
```

App 内日志最多保存 1,000 条，每条消息最多 2,000 字符，存于设备 MMKV。它和 adb/Xcode 系统日志互补，不能互相替代。先在普通模式进入“我的 → 诊断信息 → 导出诊断文件”；关怀模式会隐藏诊断入口。

## 2. 初始化失败、白屏或长期停在偈语页

### 症状

- 长期停留在启动偈语，或显示“初始化失败”。
- Debug 页面提示无法连接 Metro、红屏、bundle 加载失败。
- iOS 改了 JS 后界面不变化，Fast Refresh 和断点都不起作用。

### 采证

```bash
git status --short --branch
node --version
npm --version
test -d node_modules && echo 'node_modules exists'
lsof -nP -iTCP:8081 -sTCP:LISTEN
curl http://127.0.0.1:8081/status
```

Android 再查：

```bash
adb devices
adb reverse --list
./android/gradlew -p android :app:assembleDebug --stacktrace
```

iOS 再查：

```bash
xcodebuild -version
xcode-select -p
pod --version
xcodebuild \
  -workspace ios/StarlightPlayer.xcworkspace \
  -scheme StarlightPlayer \
  -configuration Debug \
  -showBuildSettings | rg 'CONFIGURATION|IPHONEOS_DEPLOYMENT_TARGET|PRODUCT_BUNDLE_IDENTIFIER'
```

同时保存初始化失败页面、App 诊断文件以及第 9 节的系统日志。

### 判定

- `/status` 返回 `packager-status:running` 才说明 Metro 正常监听。
- Android 设备为 `offline`/`unauthorized`，或 USB 真机没有 8081 reverse，属于连接问题。
- 仓库的 Shared Scheme 当前 **Run/LaunchAction 是 Release**。直接从 Xcode Run 时不依赖开发中的 Metro bundle；当前 React Native CLI 未传 `--mode` 时也读取该 LaunchAction，所以裸跑 `npm run ios` 同样选择 Release。JS 修改不即时生效属于配置结果，不应误判成 Metro 缓存损坏。
- `App.tsx` 的 Android `setupPlayer` 会最多尝试 5 次，每次间隔 500 ms；仍失败时页面会显示最终错误。要以该错误和原生日志判定权限、生命周期或 RNTP 初始化问题。
- `pod install`、Gradle 或编译错误发生在 App 启动前，不能靠重启 App 修复。

### 安全恢复

1. Debug 开发先运行 `npm start`，再在另一终端运行 `npm run android`；当前 Xcode 27 运行 iOS 时使用 `npm run ios -- --mode Debug --extra-params "IPHONEOS_DEPLOYMENT_TARGET=15.0"`，支持 13.4 的旧工具链可省略 `--extra-params`。
2. Metro 确有缓存异常时，停止旧进程后运行 `npm start -- --reset-cache`。
3. Android USB 真机执行 `adb reverse tcp:8081 tcp:8081`。
4. iOS 使用明确的 Debug configuration；若在 Xcode 临时修改 Shared Scheme，提交前检查并避免把无关 scheme 变化混入业务提交。
5. 依赖缺失使用 `npm ci`、`(cd ios && pod install)` 恢复锁定版本，不使用 `npm update`/`pod update` 猜修。

只有证据指向构建产物缓存时才清理目标工程；不要默认删除全局缓存。清除 App 数据或卸载会删除设置、遍数、统计和诊断证据，必须放在导出之后。

## 3. 无声、曲目无法播放或音频资源缺失

### 症状

- 播放状态变化但没有声音。
- 某一首失败，其他曲目正常。
- Debug 正常而 Release/Archive 无声，或只在一个平台失败。

### 采证

先记录曲目 ID/文件名、音量、静音/蓝牙输出设备、播放状态和 `PlaybackError`。检查源码资源：

```bash
find ios/StarlightPlayer/audio -type f -name '*.mp3' | wc -l
find android/app/src/main/assets/audio -type f -name '*.mp3' | wc -l
rg -n "audioUrl:|durationMs:" src/constants/tracks.ts
```

检查 Android APK：

```bash
unzip -l android/app/build/outputs/apk/debug/app-debug.apk \
  | rg 'assets/audio/' \
  | rg '\.mp3$'
```

检查 iOS 已构建 App 或 Archive：

```bash
find /absolute/path/to/StarlightPlayer.app -type f -name '*.mp3' -print
```

如已安装 `ffprobe`/`ffmpeg`，按 [音频资产台账](AUDIO_ASSETS.md#5-每次发布的只读校验) 验证元数据和完整解码。

### 判定

- 两端源码都应各有 21 首，文件名应和 `tracks.ts` 完全一致；Android 运行 URL 为 `file:///android_asset/audio/...`，iOS 使用 bundle 文件名。
- 只有一首失败时，优先检查该文件是否被打包、能否完整解码、文件名大小写/全角符号和 `durationMs`，不要先扩大 QueueEnded 容差。
- 资源在源码但不在 APK/App 中，属于打包配置问题；资源存在且出现 `PlaybackError`，再看解码、Audio Session/Audio Focus 和输出路由。
- `scripts/copyAssets.js` 默认源目录当前不存在，而且只复制 Android，不能作为双端资源修复流程。

### 安全恢复

1. 先把媒体音量调到可闻，断开错误的蓝牙/AirPlay 输出并重试另一首。
2. 若是 Debug bundle/构建过旧，重建目标平台，不直接覆盖或转码仓库音频。
3. 若资源确实不一致，按 `AUDIO_ASSETS.md` 从受控 canonical 源同时修复两端，并在独立提交中校验哈希、解码和时长。
4. 不要从 APK、聊天附件或未知下载页反向提取文件作为权威音源。

## 4. 遍数不增加、增加错误或重启后不续数

### 症状

- 自然播完后遍数没有增加。
- 拖动到结尾却没有计数，或怀疑重复计数。
- 关闭再打开 App 后没有续数。
- 换歌/重选当前曲后遍数被清零。

### 采证

记录曲目、四种播放模式、repeatCount、同步开关、开始位置、是否 seek/暂停/中断、QueueEnded 前后显示值。导出诊断文件，重点查：

```text
seekWithReason: ... eligible=...
QueueEnded: ... nearEnd=... session=... repeat=...
completeCycle: ... counted ...
completeCycle: ... skipped(eligible=..., nearEnd=...)
ActiveTrackChanged ...
replaceTrack ... reason=...
resetCycle ...
```

对应的自动化入口：

```bash
npm test -- --runInBand __tests__/utils/playbackCycle.spec.ts
npm test -- --runInBand __tests__/utils/storage.spec.ts
npm test -- --runInBand __tests__/services/playbackService.spec.ts
npm test -- --runInBand __tests__/utils/trackManager.spec.ts
```

### 判定

- 只有从 0～1.5 秒有效起始区间开始，并自然到达结尾的周期才有计数资格。普通模式手动 seek 到该区间外会使当前周期失去资格；主动 seek 回 0～1.5 秒可重新取得资格。
- 同步模式从中间加入时，当前尾段在计数意义上是“第 0 遍”且不计数；尚无累计的新任务显示 0，已有任务保留原累计数。尾段自然结束后重新对齐，下一次有效完整周期才增加计数。
- `nearEnd=false` 或 `eligible=false` 时跳过计数是保护逻辑，不是持久化失败。
- 关闭/重开 App 应继续同一任务；手动重选当前曲、上下首、列表自动换曲，以及完成后的单曲播放再次开始，按产品定义都是新任务并清零。
- 日志出现一次 `counted`、其后 `QueueEnded duplicate ignored` 表示去重生效，不能只凭收到两个原生事件判断重复计数。

### 安全恢复

1. 不 seek，从曲首自然播放一个完整周期复测。
2. 复现前不要清 App 数据；先导出诊断并保留精确时间。
3. 若仅 UI 未更新，对照 MMKV 相关单测和重启表现，区分展示层、`session_count` 与播放任务累计值。
4. 不要手工改 MMKV 或放宽资格/曲尾校验来“补数”；先为最小复现增加失败测试，再修状态机。

## 5. 同步偏移、换遍吞音或同步时不能拖动

### 症状

- 两台设备播放位置不一致。
- 每遍结束重新开始时首音延迟或像被吞掉。
- 开启同步后进度条或锁屏 seek 不可用。
- 暂停很久再恢复后跳到其他位置。

### 采证

两台设备同时记录：App build、曲目 ID、设备时间/时区、自动时间设置、开始时间、听感偏差和诊断文件。系统时间可辅助核对：

```bash
date '+%Y-%m-%d %H:%M:%S %z'
adb shell date
xcrun simctl spawn booted /bin/date
```

重点查日志：

```text
toggleSync
seekWithReason: ... reason=sync-join|sync-resume|sync-cycle
restartCycle: ... → position/duration
QueueEnded: ... event=... native=.../...
PlaybackState
```

对 A05 吞音问题，记录至少 21 个连续自然周期的 QueueEnded、seek 目标、下一次实际出声时刻；同时用 A04 对照。不要只截取一次进度 UI 推断引擎时间轴。

### 判定

- 同步位置按“设备本地当天 00:00 到当前时刻，对业务时长取模”计算，不访问服务器。设备时间、时区或曲目版本不同会直接产生偏差。
- 同步开启、暂停恢复和每次自然结尾都会重新 seek 到当时墙钟位置；恢复时跳转是设计行为。
- 同步模式会移除 SeekTo capability，App 内也拒绝 seek；不能拖动是设计约束。
- 相同媒体位置不保证扬声器声学输出完全同时，蓝牙缓冲、AVPlayer/ExoPlayer 调度和设备音频链路仍会引入延迟。
- A05 已转为 48 kHz、320 kb/s 固定码率版本以减少时间轴变量；仍不能把所有边界延迟单因归结为旧 VBR 文件。

### 安全恢复

1. 确认两端使用相同发布 build、同一曲目，开启系统自动日期/时间/时区。
2. 关闭再开启同步可触发一次重新对齐；这会改变当前位置，复现记录中必须注明。
3. 蓝牙场景先以两台设备扬声器做基线，再分别测相同型号耳机。
4. 不要通过给单首音频加静音、修改业务时长或取消每遍对齐来临时掩盖问题；这些会破坏跨版本同步基准，必须经过产品和多设备回归。

## 6. QueueEnded 异常、停播或自动恢复

### 症状

- 到曲尾后停住，没有重复或换曲。
- 一次曲尾出现多个 QueueEnded。
- 自动停止后约数秒恢复，或连续恢复失败。
- 换曲附近遍数属于错误曲目。

### 采证

先导出完整诊断文件，不只复制页面最后 30 行。按时间顺序保留以下日志：

```text
PlayerCommand#... start/done/failed
QueueEnded: track=... event=... native=.../... nearEnd=... mode=... session=... repeat=...
QueueEnded duplicate ignored
QueueEnded stale ... ignored
completeCycle
QueueEnded action ... attempt ... failed/recovered
PlaybackError / PlayerError / PlaybackState
Playback watchdog recovery/exhausted
```

同时记录事件发生前是否切歌、seek、切同步、进后台或遇到音频中断。跑定向测试：

```bash
npm test -- --runInBand __tests__/services/playbackService.spec.ts
npm test -- --runInBand __tests__/services/playbackService.android.spec.ts
npm test -- --runInBand __tests__/utils/playbackDecision.spec.ts
npm test -- --runInBand __tests__/utils/playbackRecovery.spec.ts
```

### 判定

- 当前 RNTP 是单曲队列；QueueEnded 是该原生队列结束，不是第二个业务播放列表。
- 同一曲目 generation 在 5 秒内的重复 QueueEnded 会被忽略；generation、active track 或实时位置不匹配的迟到事件也会被忽略。
- `nearEnd=false` 说明事件/实时位置没有通过曲尾校验，不能计数。
- QueueEnded 业务动作总共最多尝试两次（初次 + 1 次重试），但计数在重试外幂等完成，不能因此重复加遍。
- 仍有播放意图却进入 Stopped/Error 时，watchdog 以 1.5、3、6 秒退避，最多三轮；同步模式按墙钟恢复，普通模式按当前业务状态恢复。

### 安全恢复

1. 先保留日志，再由用户明确暂停后重新播放；不要在后台恢复尚未结束时连续点击多个控制键。
2. 可重现时固定曲目、模式、repeatCount 和操作时间，先写失败测试再改去重/曲尾阈值。
3. 不要随意删除 5 秒去重、增加第二队列、开启 RNTP RepeatMode，或绕开 `enqueuePlayerCommand`；这些会破坏幂等和 N 遍优先规则。
4. watchdog 三轮耗尽后应保留原始 `PlaybackError`/`PlayerError`；重启只能作为用户恢复手段，不能替代根因分析。

## 7. 后台、锁屏、通知栏或耳机控制异常

### 症状

- Android 切后台或划掉 UI 后停止。
- 锁屏/通知栏按钮数量和 App 内不同。
- 同步模式仍看到 seek，或关怀模式出现不应有的上一首/下一首。
- 来电、其他 App 抢占音频、蓝牙断开后恢复不符合预期。

### 采证

记录厂商、系统、App build、省电策略、通知权限、普通/同步/关怀模式，以及“锁屏、切后台、划掉 UI、强行停止”中的确切动作。Android 可采：

```bash
adb shell dumpsys package com.starlightplayer | rg 'versionCode=|versionName=|POST_NOTIFICATIONS'
adb shell dumpsys media_session
adb shell dumpsys notification --noredact | rg -n 'starlight|com\.starlightplayer' -i
adb shell dumpsys deviceidle | rg -n 'starlight|com\.starlightplayer' -i
```

iOS 用 Xcode/Console 保存中断和 Audio Session 附近日志，并注明控制来自锁屏、控制中心、耳机还是 App。

### 判定

- 普通模式发布 Play、Pause、Previous、Next、SeekTo、Stop；同步模式移除 SeekTo；关怀模式只发布 Play/Pause。系统可按可用空间和厂商策略只展示其中一部分，代码不能强制固定锁屏布局。
- Android 配置为 UI 被划掉后继续播放，前台服务宽限 30 秒；用户在系统设置中“强行停止”不属于可恢复后台播放。
- Android 13+ 拒绝通知权限会影响通知可见性。华为、小米、OPPO、vivo 等后台策略可能覆盖框架预期。
- iOS 已声明后台 audio，但 Simulator 不能证明真机锁屏、来电和长期后台行为。
- 暂时性中断会根据原播放意图恢复；永久中断会停止并取消当前周期资格。

### 安全恢复

1. 授予通知权限，并按设备厂商说明允许后台活动/关闭针对该 App 的过度省电限制。
2. 先在 AOSP/Pixel 基线设备验证，再把厂商差异记录到 [设备测试矩阵](DEVICE_TEST_MATRIX.md)。
3. 来电/蓝牙问题用真机重复，分别记录中断前是否正在播放以及恢复后是否重新同步。
4. 不要为了让某台手机多显示按钮而增加与模式冲突的 capability；先区分“能力已发布”和“系统选择展示”。

## 8. 诊断文件无法导出或内容不完整

### 症状

- 找不到“诊断信息”。
- 点击导出提示“当前安装包未包含诊断文件导出模块”或“导出失败”。
- 分享面板没有出现，或文件只有最近部分日志。

### 采证

记录是否处于关怀模式、App build、错误弹窗全文和系统日志。定向测试：

```bash
npm test -- --runInBand __tests__/utils/diagnosticsAndLogger.spec.ts
npm test -- --runInBand __tests__/screens/ProfileScreen.spec.tsx
```

Android 检查原生模块和 FileProvider 是否进入构建：

```bash
rg -n 'DiagnosticExporter|diagnostics.fileprovider' \
  android/app/src/main android/app/src/main/java/com/starlightplayer
```

iOS 检查模块是否在 Target：

```bash
rg -n 'DiagnosticExporter' ios/StarlightPlayer.xcodeproj/project.pbxproj ios/StarlightPlayer
```

### 判定

- 关怀模式隐藏“其他/诊断信息”，先切回普通模式。
- 页面只预览最近 30 条，但导出的文件使用当前保存的全部日志，最多 1,000 条；较早日志会滚动淘汰。
- 原生模块缺失通常表示安装包过旧或 Target/Package 注册错误，不是 JS 分享按钮本身的问题。
- 用户取消系统分享不能写成导出失败；以 Promise 结果和系统日志判定。

### 安全恢复

1. 切回普通模式，重新展开诊断信息并导出到“文件”或其他明确可保存的目标。
2. 导出前不要卸载、清数据或反复长时间运行覆盖旧日志。
3. 只有确认当前安装包缺模块时才重建并重装；升级测试应先保存旧版本诊断和持久化结果。
4. 诊断文件包含设备型号、系统版本、时间和播放事件，应通过受控渠道传输，不提交公开仓库。

## 9. adb 与 iOS 日志采集

### 9.1 Android

确认目标设备和版本：

```bash
adb devices -l
adb shell dumpsys package com.starlightplayer | rg 'versionCode=|versionName='
adb shell pidof com.starlightplayer
```

复现期间只看当前进程：

```bash
adb logcat --pid="$(adb shell pidof com.starlightplayer)" -v threadtime
```

保存日志缓冲区中最近 5,000 行（覆盖时长取决于设备日志量）：

```bash
adb logcat -v threadtime -t 5000 > /tmp/starlight-android-logcat.txt
```

应用崩溃或 ANR：

```bash
adb logcat -b crash -d -v threadtime > /tmp/starlight-android-crash.txt
adb shell dumpsys activity lastanr > /tmp/starlight-android-lastanr.txt
```

`adb logcat -c` 会清空设备日志；不要在尚未保存证据时运行。进程已退出时 `--pid` 可能为空，应改用上述缓冲区快照，并结合包名、ReactNativeJS、RNTrackPlayer 搜索。不同 adb 版本对 `-T` 时间语法支持不一致，文档不使用不可移植的 `-T '10m'` 写法。

### 9.2 iOS Simulator

实时日志：

```bash
xcrun simctl spawn booted log stream \
  --level debug \
  --style compact \
  --predicate 'process == "StarlightPlayer"'
```

保存最近 10 分钟：

```bash
xcrun simctl spawn booted log show \
  --last 10m \
  --style compact \
  --predicate 'process == "StarlightPlayer"' \
  > /tmp/starlight-ios-simulator.log
```

若 App 进程名不同，先用 `xcrun simctl spawn booted launchctl print system` 或 macOS Console 确认，不要因空结果认定“没有日志”。

### 9.3 iOS 真机

- 开发运行：使用 Xcode Debug area 的 Console，保存完整文本。
- 系统日志：macOS“控制台”选择已连接设备，按进程/包标识过滤。
- 崩溃日志：Xcode → Window → Devices and Simulators → 选中设备 → View Device Logs。
- 发布构建：同时保留 App Store build、设备系统、崩溃时间和对应 dSYM；没有匹配 dSYM 的地址不能可靠符号化。

App 的 `addLog` 写入 MMKV，并不保证逐条出现在系统 console；QueueEnded、计数和同步排查必须同时导出 App 诊断文件。

## 10. 何时停止恢复、转为缺陷处理

满足任一条件时，不应继续靠重启/清缓存尝试：

- 同一 commit、设备和步骤可稳定复现。
- 出现数据串曲、错误计数、连续自动恢复、崩溃或音频资源不一致。
- 修复建议会改变同步基准、QueueEnded 去重、计数资格、原生队列形态或最低系统版本。
- 需要卸载/清数据才能“恢复”，但尚未导出诊断和迁移证据。

此时创建缺陷记录，附最小复现、诊断文件、系统日志、候选根因和失败测试。修复后的必跑范围按 [贡献指南](../CONTRIBUTING.md) 和 [设备矩阵](DEVICE_TEST_MATRIX.md) 确定。
