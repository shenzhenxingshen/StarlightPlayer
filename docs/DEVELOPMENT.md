# 开发环境与日常开发

> 最后核对：2026-10-16。本文区分“仓库声明的要求”和“当前开发机曾验证的版本”；后者不是最低支持版本。

## 1. 项目与工具链

StarlightPlayer 是 React Native 双端离线播放器。依赖应以 `package-lock.json` 和 `ios/Podfile.lock` 为准，不要只看 `package.json` 中的范围版本。

| 项目            | 仓库事实                                                       | 当前开发机核对值             |
| --------------- | -------------------------------------------------------------- | ---------------------------- |
| React Native    | 0.75.5                                                         | 0.75.5                       |
| React           | 18.3.1                                                         | 18.3.1                       |
| RN Track Player | `package.json` 为 `^4.1.0`                                     | lockfile 为 4.1.2            |
| TypeScript      | `package.json` 为 `^5.5.4`                                     | lockfile 为 5.9.3            |
| Node / npm      | 仓库尚无 `.nvmrc` 或 `engines` 约束                            | Node 25.6.0 / npm 11.8.0     |
| Android         | Gradle 8.8、minSdk 23、compile/targetSdk 35、NDK 26.1.10909125 | JDK 21.0.9 可构建            |
| iOS             | Podfile 与 Xcode 工程声明 13.4，iPhone/iPad Universal          | Xcode 27.0、CocoaPods 1.16.2 |

当前缺少 Node、Ruby/CocoaPods 和 JDK 的项目级版本锁定。更换开发机或升级工具链时，应先在独立分支完成双端构建和设备回归，再更新本表；不能把“某台机器能构建”当成官方最低要求。

## 2. 首次准备

### 2.1 JavaScript 依赖

在仓库根目录执行：

```bash
npm ci
```

`npm ci` 会严格使用 lockfile，并重建 `node_modules`。不要在普通构建中使用 `npm update`。如果中国网络环境下 RNTP 的 Maven 仓库不可达，可人工审阅后执行 `patches/patch-rntp.sh`；该脚本不会被 npm/Gradle 自动调用，使用 macOS BSD `sed -i ''`，并会直接修改 `node_modules`。每次 `npm ci` 后都可能需要重做，它不是源码补丁的永久替代品。

### 2.2 Android

安装 Android SDK Platform 35、Build Tools 34.0.0、NDK 26.1.10909125，以及能运行 Gradle 8.8 的 JDK。创建未入库的 `android/local.properties`：

```properties
sdk.dir=/absolute/path/to/Android/sdk
```

确认环境：

```bash
./android/gradlew -version
```

### 2.3 iOS

安装 Xcode、Command Line Tools 和 CocoaPods，然后执行：

```bash
(cd ios && pod install)
open ios/StarlightPlayer.xcworkspace
```

本仓库没有 `Gemfile`，因此 CocoaPods 版本尚未由 Bundler 固定。日常恢复依赖应使用 `pod install`，不要无目的地运行 `pod update`。构建必须打开 `.xcworkspace`，不能只打开 `.xcodeproj`。

## 3. 启动与调试

在一个终端启动 Metro：

```bash
npm start
```

另一个终端运行目标平台：

```bash
npm run android
npm run ios -- --mode Debug --extra-params "IPHONEOS_DEPLOYMENT_TARGET=15.0"
```

上面的 iOS 命令适用于当前 Xcode 27；支持 deployment target 13.4 的旧工具链可去掉 `--extra-params`。这个临时覆盖仅用于 Simulator 开发测试，不改变发布兼容承诺。

也可直接构建 Debug：

```bash
./android/gradlew -p android :app:assembleDebug
```

iOS Shared Scheme 当前把 Run/LaunchAction 配成 Release，裸跑 `npm run ios` 或直接在 Xcode 点击 Run 都会使用 Release，不适合日常 Metro/Fast Refresh 调试。开发时应显式使用上面的 `--mode Debug`；在 Xcode 临时把 Run 改成 Debug 时，提交前检查不要把无关 scheme 变化带入业务提交。命令行示例：

```bash
xcodebuild \
  -workspace ios/StarlightPlayer.xcworkspace \
  -scheme StarlightPlayer \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  IPHONEOS_DEPLOYMENT_TARGET=15.0 \
  build
```

目标名称必须替换为本机 `xcrun simctl list devices available` 中真实存在的设备。

## 4. 提交前质量门槛

建议按下列顺序执行：

```bash
npm run typecheck:app
npm run typecheck
npm run lint
npm run format:check
npm test -- --runInBand
npm run test:coverage -- --runInBand
```

自动化数量、覆盖率分母/阈值和最近实测结果以 [TESTING.md](TESTING.md) 为唯一权威；具体 warning 与格式遗留清单以 [LINTING.md](LINTING.md) 为准。当前仍存在历史 warning 和格式失败，因此“命令退出 0”“高覆盖率”和“发布可用”是三件不同的事。首次搭建时不要为追求全绿而顺手改业务代码，应先记录与权威基线的差异。

自动修复命令会改文件，运行前先检查工作区：

```bash
git status --short
npm run format
npm run lint:fix
git diff --check
git diff
```

不要在含有他人未提交修改的工作区盲目执行自动修复。

## 5. 改动播放逻辑时必须守住的规则

1. 每首必须先完成设置的 N 个有效周期，之后才执行四种播放模式。
2. 同步模式是核心能力；相同曲目按设备本地当天时间对齐，并在每个自然结尾后重新对齐。
3. 从中间加入同步时的尾段在计数意义上是“第 0 遍”，不计数；新任务尚无已完成遍数时 UI 显示 0，已有任务保留累计数；只有取得 `cycleEligible` 的周期才可在结尾计数。
4. RNTP 原生 RepeatMode 保持 Off；重复、换曲和停止由业务状态机负责。
5. 所有影响队列或播放状态的 TrackPlayer 写命令都必须进入 `enqueuePlayerCommand`，不能绕开 JS 队列和原生进程锁；hooks、监听器注册和只读查询除外。
6. 真换曲（上下首或列表自动换曲）、用户手动重选当前曲，或已完成的单曲播放再次开始，视为新任务并清零；仅关闭再打开 App 要保留累计遍数。
7. 旋转、iPad 分屏和窗口尺寸变化只能重排 UI，不能 reset 队列、seek、换曲或改变计数资格。

详细约定见 [PLAYBACK_ARCHITECTURE.md](PLAYBACK_ARCHITECTURE.md)，测试要求见 [TESTING.md](TESTING.md) 和 [DEVICE_TEST_MATRIX.md](DEVICE_TEST_MATRIX.md)。

## 6. 资源与本地数据注意事项

- 两个平台各直接保存 21 首 MP3；修改音频时必须同步两份并按 `docs/AUDIO_ASSETS.md` 校验。
- `scripts/copyAssets.js` 只复制到 Android，且默认的 `assets/audio` 当前不存在。它不能完成双端资源发布流程。
- `android/link-assets-manifest.json` 与 `ios/link-assets-manifest.json` 已知过时，不得作为音频完整性的依据。
- 设置、计数、播放任务和日志保存在 MMKV。验证“首次安装”时应卸载 App 或明确清空应用数据；普通重装/升级测试不得误删用于验证迁移的数据。
- `release/` 被 Git 忽略；发布产物、截图和 Archive 不会随代码提交，应放入有访问控制的制品库或发布记录中。

## 7. iOS 13/14 的双轨事实

源码的 Podfile 和 Xcode 工程目标是 iOS 13.4，但已生成并上传的 `1.0.0 (4)` Archive 最终 `MinimumOSVersion` 是 15.0。也就是说：

- 源码意图仍是兼容 iOS/iPadOS 13.4；
- 当前 App Store build 4 **不能**安装在 iOS 13/14；
- Simulator 能运行不能证明 iOS 13/14 兼容；
- 下一个发布候选必须检查 Archive 内最终 `Info.plist` 和真机结果，不能只看 Build Settings。

Xcode 27 本地若确实需要临时把 Pods 提高到 15.0，可使用 `(cd ios && STARLIGHT_LOCAL_IOS_DEPLOYMENT_TARGET=15.0 pod install)`。这个环境变量只改 Pods targets；App 和 Test target 仍要通过 `xcodebuild ... IPHONEOS_DEPLOYMENT_TARGET=15.0` 或 RN CLI 的 `--extra-params` 临时覆盖。两者都只是本机兼容措施，不应进入声称支持 iOS 13/14 的发布包。完整发布门槛见 `docs/RELEASE.md`。

## 8. 常见问题

### Metro 或原生包使用了旧代码

先停止现有 Metro，再执行：

```bash
npm start -- --reset-cache
```

只有在确认问题来自构建缓存后才清理目标平台构建目录；不要把删除 Pods、DerivedData 或 Gradle 全局缓存当作每次构建的固定步骤。

### Android release 无法签名

Debug keystore 不能用于正式发布。Release 需要本地 `android/app/release.keystore` 和三个环境变量；具体见 `docs/RELEASE.md`。不要把密码、keystore 或签名日志提交到 Git。

### iOS 能编译但不能上传

依次确认 Apple Developer Program 协议、Team、Bundle ID、带私钥的 Apple Distribution 证书、Provisioning Profile、版本号/构建号，以及 Archive 的签名类型。上传前还要核对最终最低系统版本。
