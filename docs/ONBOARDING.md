# 新开发者上手指南

> 最后核对：2026-10-16。目标是在已有基础工具链的前提下，fresh clone 后 60 分钟内读懂关键约束、跑完自动化自检，并至少启动一个平台。首次完整接管仍应在第一天内跑通 Android 和 iOS；模拟器通过不等于真机发布验收通过。

## 1. 先知道什么不能被改坏

开始改代码前，先用 5 分钟阅读：

1. [README](../README.md) 的“两项核心规则”。
2. [播放架构与状态机](PLAYBACK_ARCHITECTURE.md) 的不变量和事件流。
3. [测试手册](TESTING.md) 中自动化测试的边界。

最重要的产品契约是：

- 每首先完成设置的 N 个有效完整周期，之后才执行四种播放模式。
- 同步模式按设备本地当天时间对齐；自然结束、恢复和换曲都可能重新对齐。
- RNTP 原生队列保持单曲，原生 RepeatMode 保持 Off；重复和换曲由业务状态机决定。
- 所有影响队列或播放状态的 TrackPlayer 写命令必须经过 `enqueuePlayerCommand`，不能绕过 JS 队列和原生进程锁；hooks、监听器注册和只读查询除外。
- 旋转、iPad 分屏和窗口缩放只能重排界面，不能换曲、seek、清零或重建播放器。

## 2. 60 分钟路线图

| 时间        | 目标                          | 完成标志                                                  |
| ----------- | ----------------------------- | --------------------------------------------------------- |
| 0～5 分钟   | 确认仓库与阅读核心规则        | 位于预期分支，工作区干净，能复述上面的五条契约            |
| 5～15 分钟  | 核对本机工具链                | Node/npm 可用；目标平台的 JDK/Android SDK 或 Xcode 可用   |
| 15～25 分钟 | 安装锁定依赖                  | `npm ci` 成功；iOS 开发者另完成 `pod install`             |
| 25～40 分钟 | 跑最小自动化门槛              | 类型检查、Lint 和 Jest 结果与已知基线一致                 |
| 40～55 分钟 | 启动 Android 或 iOS Simulator | 看见播放页、三个 Tab，A01 能开始播放                      |
| 55～60 分钟 | 做一次冒烟与保存接管记录      | 切歌、暂停/恢复、诊断导出路径可达；记录未完成项和本机版本 |

如果下载依赖或模拟器 Runtime 耗时过长，不要为满足“60 分钟”跳过失败；记录阻塞点并按 [故障排查](TROUBLESHOOTING.md) 采证。

## 3. Fresh clone 与仓库自检

```bash
git clone https://github.com/shenzhenxingshen/StarlightPlayer.git
cd StarlightPlayer
git status --short --branch
git remote -v
git log -1 --oneline --decorate
```

预期结果：当前分支和目标 commit 清楚，`git status --short` 没有意外文件。不要在不明来源的脏工作区执行自动格式化、清理或依赖更新。

检查锁文件和音频是否完整：

```bash
test -f package-lock.json
test -f ios/Podfile.lock
find ios/StarlightPlayer/audio -type f -name '*.mp3' | wc -l
find android/app/src/main/assets/audio -type f -name '*.mp3' | wc -l
```

两个音频计数都应为 21。进一步的文件名、哈希和解码检查见 [音频资产台账](AUDIO_ASSETS.md)。

## 4. 工具链自检

仓库目前没有 `.nvmrc`、`engines`、`Gemfile`、`.ruby-version` 或 JDK 版本锁。`package-lock.json`、`Podfile.lock` 和原生工程配置才是依赖事实；不要把某台机器的版本误写成最低要求。

### 4.1 通用

```bash
node --version
npm --version
git --version
```

已知可工作的开发机基线为 Node 25.6.0、npm 11.8.0，但这不是声明的最低版本。安装 JS 依赖：

```bash
npm ci
```

预期结果：严格使用 `package-lock.json` 完成安装，不产生 lockfile 变更。普通初始化不要使用 `npm update`。

### 4.2 Android

```bash
java -version
adb version
./android/gradlew -version
adb devices
```

仓库配置为 Gradle 8.8、compile/targetSdk 35、minSdk 23、NDK 26.1.10909125，已知 JDK 21.0.9 可构建。创建不入库的 `android/local.properties`：

```properties
sdk.dir=/absolute/path/to/Android/sdk
```

`adb devices` 应至少列出一台状态为 `device` 的模拟器或真机；`offline` 或 `unauthorized` 不能继续当作可用设备。

### 4.3 iOS / iPadOS

iOS 构建只能在 macOS 上完成：

```bash
xcodebuild -version
xcode-select -p
pod --version
xcrun simctl list devices available
(cd ios && pod install)
```

必须打开 `ios/StarlightPlayer.xcworkspace`，不能只打开 `.xcodeproj`。`pod install` 后若 `Podfile.lock` 变化，先查明原因，不要直接提交依赖漂移。

源码目标仍是 iOS 13.4。较新本地 SDK 若确实无法安装 Pods，可按 [开发环境](DEVELOPMENT.md#7-ios-1314-的双轨事实) 使用临时的 `STARLIGHT_LOCAL_IOS_DEPLOYMENT_TARGET=15.0` 做本机 Simulator 验证；它不能用于声称支持 iOS 13/14 的发布 Archive。

## 5. 自动化自检

先跑较快且能定位问题的检查：

```bash
npm run typecheck:app
npm run typecheck
npm run lint
npm test -- --runInBand
```

需要建立完整基线时再跑：

```bash
npm run format:check
npm run test:coverage -- --runInBand
git diff --check
```

自动化数量、覆盖率分母/阈值和最近实测结果以 [测试手册](TESTING.md) 为唯一权威；warning 与格式遗留以 [Lint 与静态检查](LINTING.md) 为准。当前仍有已记录的历史 warning 和格式失败，因此“命令退出 0”“高覆盖率”和“发布可用”是三件不同的事。不要为了让首次自检变绿而顺手格式化或改业务代码；先在接管记录中写明与权威基线的差异。

## 6. Android 首次运行

### 6.1 Debug 启动

终端 A：

```bash
npm start
```

终端 B：

```bash
npm run android
```

连接 USB 真机而设备无法访问 Metro 时，可执行：

```bash
adb reverse tcp:8081 tcp:8081
```

只验证原生 Debug 构建时可运行：

```bash
./android/gradlew -p android :app:assembleDebug
```

### 6.2 预期结果

1. 首屏短暂显示四行偈语，随后进入“播放”页，而不是长期停留或显示“初始化失败”。
2. 普通模式下底部显示“播放、列表、我的”三个 Tab。
3. fresh install 默认曲目为 A01，默认同步模式开启，默认每首重复 1 遍。
4. 点击播放后能听到本地音频；切到“列表”选择其他曲目会作为新播放任务清零。
5. “我的 → 诊断信息 → 导出诊断文件”能调起系统分享面板。

Android 13+ 首次启动会请求通知权限。拒绝权限可能影响通知可见性，但不能据此推断播放器业务逻辑失败。

## 7. iOS / iPadOS 首次运行

### 7.1 先避开 Shared Scheme 的 Release 陷阱

仓库提交的 `ios/StarlightPlayer.xcodeproj/xcshareddata/xcschemes/StarlightPlayer.xcscheme` 当前配置为：

- Test：Debug
- **Run / LaunchAction：Release**
- Profile：Release
- Archive：Release

因此直接在 Xcode 点击 Run 会构建 Release，可能不连接 Metro、看不到 Fast Refresh，断点和调试行为也会与预期不同。这不是 Metro 故障。

React Native CLI 14.1.0 在没有传 `--mode` 时也会读取 Shared Scheme 的 LaunchAction，因此本仓库裸跑 `npm run ios` **同样会选择 Release**。首次开发调试应明确指定 Debug，避免无意修改 shared scheme：

```bash
xcodebuild \
  -workspace ios/StarlightPlayer.xcworkspace \
  -scheme StarlightPlayer \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  IPHONEOS_DEPLOYMENT_TARGET=15.0 \
  build
```

将设备名替换为 `xcrun simctl list devices available` 中真实存在的设备。上面的 deployment target 覆盖是当前 Xcode 27 Simulator 的本机测试兼容措施；支持 13.4 的旧工具链可省略。需要在 Xcode 27 自动构建、安装并启动时执行 `npm run ios -- --mode Debug --extra-params "IPHONEOS_DEPLOYMENT_TARGET=15.0"`。若必须从 Xcode 调试，可在 Product → Scheme → Edit Scheme → Run → Info 中临时选 Debug；这个 shared scheme 已受 Git 跟踪，提交前务必检查 `.xcscheme` 是否被改动。长期是否把 Run 改回 Debug，应作为独立配置改动评审，不能混入业务提交。

### 7.2 启动与预期结果

终端 A：

```bash
npm start
```

终端 B：

```bash
npm run ios -- --mode Debug --extra-params "IPHONEOS_DEPLOYMENT_TARGET=15.0"
```

该命令适用于当前 Xcode 27；它只让当前 SDK 的 Simulator 构建可执行，不能作为 iOS 13/14 兼容证据。旧工具链若接受 13.4，可去掉 `--extra-params`。

预期界面和 Android 相同。额外确认：

- iPhone 竖/横屏旋转只重排布局，曲目、位置、播放状态和遍数连续。
- iPad 使用同一个 Universal 包；方屏/横屏进入三栏布局。
- Simulator 可验证页面和基础播放，但不能证明锁屏、真机后台、来电、蓝牙或多设备同步。

## 8. 五分钟冒烟检查

在至少一个平台执行：

1. 播放 A01，暂停后恢复。
2. 关闭同步后拖动进度；重新开启同步后确认进度被重新对齐，且进度条不可任意拖动。
3. 从列表选择 A04，再手动重选 A04；两次都应建立新任务并清零。
4. 将重复遍数依次设为 1、108 和 5,000,000，确认显示千分位且重启后仍保留。
5. 旋转或调整窗口尺寸，确认没有自动切歌、seek 或清零。
6. 导出一次诊断文件，但不要把含设备信息和日志的文件提交到公开仓库。

完整播放周期、四模式、后台、锁屏和中断场景按 [设备测试矩阵](DEVICE_TEST_MATRIX.md) 执行，不能压缩进这个五分钟冒烟。

## 9. 上手完成定义

满足以下条件才算完成接管初始化：

- [ ] 能指出 RN 入口 `index.js`、初始化入口 `src/App.tsx`、后台服务 `src/services/playbackService.ts`。
- [ ] 理解 N 遍优先、`cycleEligible`、四种模式和同步对齐之间的关系。
- [ ] `npm ci` 成功，lockfile 没有无意变化。
- [ ] 类型检查和 Jest 与记录的基线一致；已记录 Lint/格式差异。
- [ ] 至少一个平台 Debug 启动成功，A01 有声且三个 Tab 可达。
- [ ] 在 macOS 上，Android 和 iOS 最迟在第一天内都完成首次运行。
- [ ] 知道 Xcode Shared Scheme 当前以 Release 运行，能主动选择 Debug 调试。
- [ ] 知道模拟器测试边界，并已为需要真机验证的改动选择 [设备矩阵](DEVICE_TEST_MATRIX.md) 用例。
- [ ] 阅读 [贡献指南](../CONTRIBUTING.md)，能根据改动类型选择必跑测试和必更文档。

建议把本机工具版本、完成日期、目标 commit、通过/失败项和证据路径写入团队接管记录，而不是改写本文中的共享基线。
