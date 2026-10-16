# 双端发布手册

> 最后核对：2026-10-16。发布人应逐项留下版本、commit、测试记录、签名指纹和制品 SHA-256；“构建成功”不等于“可发布”。

现有 1.0 制品和渠道信息的事后恢复见 [`release-records/1.0.0-reconstructed.md`](release-records/1.0.0-reconstructed.md)；其中 UNKNOWN/PARTIAL 项不能当作发布通过。

## 1. 当前发布事实与已知风险

| 项目                  | 当前值                                                          |
| --------------------- | --------------------------------------------------------------- |
| Git                   | `main` 的 `0698f62` 对应 1.0.0 build 4；发布时仍应重新确认 HEAD |
| npm package           | 1.0.0                                                           |
| Android               | `versionName 1.0`、`versionCode 3`                              |
| iOS                   | `CFBundleShortVersionString 1.0.0`、`CFBundleVersion 4`         |
| App 内诊断文本        | 硬编码显示 1.0                                                  |
| Android applicationId | `com.starlightplayer`                                           |
| iOS bundle identifier | `com.starlightplayer.app`                                       |
| iOS Target            | iPhone/iPad Universal，`TARGETED_DEVICE_FAMILY = "1,2"`         |

营销版本目前存在 `1.0` 与 `1.0.0` 两种写法。商店可以接受 Android/iOS 构建号不同，但营销版本和 App 内显示应统一成同一个完整字符串，例如统一为 `1.1.0`。

另一个关键风险：源码的 iOS deployment target 是 13.4，但已经上传成功的 `1.0.0 (4)` Archive 实际为 `MinimumOSVersion = 15.0`。因此 build 4 不能宣称支持 iOS 13/14。若产品继续承诺 iOS 13/14，下一个 build 必须在 Archive 产物层修复并用旧系统真机验证。

## 2. 发布前冻结与版本一致性

### 2.1 冻结候选 commit

```bash
git status --short --branch
git fetch --prune
git rev-parse HEAD
git rev-parse origin/main
```

工作区必须没有意外修改，候选 commit 必须可追溯。不要在构建后继续改代码却沿用原来的测试记录。

### 2.2 修改版本

构建号必须严格大于各商店已接受的最大值，Android 与 iOS 构建号不要求相等。

需要同步检查：

1. `package.json` 与 `package-lock.json` 根版本；可用 `npm version X.Y.Z --no-git-tag-version` 同步这两处。
2. `android/app/build.gradle` 的 `versionName` 与 `versionCode`。
3. Xcode Target 的 `MARKETING_VERSION` 与 `CURRENT_PROJECT_VERSION`。
4. `ios/StarlightPlayer/Info.plist` 的 `CFBundleShortVersionString` 与 `CFBundleVersion`；当前工程仍有显式值，不能只改 Xcode UI 后不核对文件。
5. `src/screens/ProfileScreen.tsx` 的诊断版本文本。
6. `CHANGELOG.md`、商店更新说明、下载页和制品文件名。

快速核对：

```bash
node -p "require('./package.json').version"
node -p "require('./package-lock.json').version"
rg -n 'versionCode|versionName' android/app/build.gradle
rg -n 'MARKETING_VERSION|CURRENT_PROJECT_VERSION' ios/StarlightPlayer.xcodeproj/project.pbxproj
/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' ios/StarlightPlayer/Info.plist
/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' ios/StarlightPlayer/Info.plist
rg -n 'App版本' src/screens/ProfileScreen.tsx
```

长期建议：让诊断页面从原生 bundle/package 动态读取版本，避免继续维护硬编码。

## 3. 所有平台共同门槛

发布冻结时先从 [`test-runs/TEMPLATE.md`](test-runs/TEMPLATE.md) 为 Android、iOS 各创建一份 DRAFT 测试记录，并从 [`release-records/TEMPLATE.md`](release-records/TEMPLATE.md) 创建发布记录。后续所有命令、制品和平台状态必须绑定到这些记录中的同一 commit/build；不能在构建结束后靠聊天内容追溯。

### 3.1 代码质量

```bash
npm ci
npm run typecheck:app
npm run typecheck
npm run lint
npm run format:check
npm test -- --runInBand
npm run test:coverage -- --runInBand
git diff --check
```

当前 `format:check` 已知会因 7 个源文件失败；这应在发布分支中修复并复核，不得在 SOP 中忽略失败。ESLint 当前有 warning，也要在发布记录写明数量和是否接受。

### 3.2 音频资源

按 `docs/AUDIO_ASSETS.md` 执行以下门槛：

- Android/iOS 均为 21 首，文件名集合完全相同；
- 对应文件 SHA-256 完全相同；
- `src/constants/tracks.ts` 的文件名与 `durationMs` 和实际解码结果一致；
- A05 仍为当前确认的 48 kHz、双声道、约 320 kb/s 固定码率版本，时长 70.684 秒；
- 完成至少一个全曲自然结束、重复、同步换遍的设备回归；
- 音频来源与授权台账由产品方确认。仓库目前没有足以证明版权/授权的信息。

两个 `link-assets-manifest.json` 已知过时，不能用它们替代上述检查。

### 3.3 设备回归

按照 `docs/DEVICE_TEST_MATRIX.md` 至少完成：四种播放模式、重复 1/108/大数、同步开关、重启续数、竖/方/横布局、Android 后台与通知、iOS 后台与锁屏、来电/音频焦点、蓝牙、多设备同步。

模拟器无法替代锁屏、后台保活、来电、蓝牙和多设备同步真机测试。未完成项必须在发布决策中明确列为风险，不能写成“通过”。

## 4. Android 发布

### 4.1 签名准备

正式签名文件为本地 `android/app/release.keystore`，已被 Git 忽略。Gradle 读取：

- `STARLIGHT_STORE_PASSWORD`
- `STARLIGHT_KEY_ALIAS`
- `STARLIGHT_KEY_PASSWORD`

密码应来自密码管理器、CI secret 或临时安全环境，不要写入仓库、命令历史、聊天、构建日志或共享截图。必须备份原 keystore；丢失后可能无法继续升级同一应用。

只做不泄密的配置确认：

```bash
test -f android/app/release.keystore
test -n "$STARLIGHT_STORE_PASSWORD"
test -n "$STARLIGHT_KEY_ALIAS"
test -n "$STARLIGHT_KEY_PASSWORD"
```

### 4.2 构建 AAB 与 APK

```bash
./android/gradlew -p android :app:bundleRelease :app:assembleRelease
```

默认产物：

- `android/app/build/outputs/bundle/release/app-release.aab`：应用商店上传。
- `android/app/build/outputs/apk/release/app-release.apk`：受控直装/下载页与真机回归。

没有证据表明必须在每次发布前运行 `clean`。只有确认增量缓存异常时才执行 `./android/gradlew -p android clean` 并重新构建。

### 4.3 验签、版本和安装

```bash
jarsigner -verify -verbose -certs android/app/build/outputs/bundle/release/app-release.aab
apksigner verify --verbose --print-certs android/app/build/outputs/apk/release/app-release.apk
shasum -a 256 android/app/build/outputs/bundle/release/app-release.aab
shasum -a 256 android/app/build/outputs/apk/release/app-release.apk
adb install -r android/app/build/outputs/apk/release/app-release.apk
adb shell dumpsys package com.starlightplayer | rg 'versionCode=|versionName='
```

若 `apksigner` 不在 PATH，使用 Android SDK 对应 build-tools 目录中的可执行文件。真机上再确认通知栏/锁屏控制、后台继续播放、诊断导出、升级后持久化数据和 21 首音频可播放。

### 4.4 分发

Play Console 使用 AAB；自建下载页只分发已验签 APK。上传后记录：商店版本、构建号、commit、文件大小、SHA-256、签名证书 SHA-256、上传时间和操作者。服务器部署说明不得包含 SSH 私钥或密码。

当前公开 Android 下载页使用版本目录：<http://116.196.86.84/starlight/v1.0/>，统计页为 <http://116.196.86.84/starlight/v1.0/stats.html>。它目前只有 HTTP，正式长期分发应迁移到受信任域名和 HTTPS，避免页面或 APK 在传输中被篡改；展示 SHA-256 不能替代 HTTPS。`release/server-v0.7.0/` 只是一份被 Git 忽略的本地历史模板，不是服务器真相，也不会随仓库提交。

维护自建下载页时应：

1. 为每个营销版本创建独立目录，不覆盖旧版本同名 APK；
2. 上传前后分别核对 APK SHA-256、签名证书和页面展示的版本/大小；
3. 验证首页、APK、`stats.html`、统计 JSON/API、Logo 和旧版本导航均返回预期状态；
4. 为 HTML/统计配置合理缓存策略，并保留上一稳定版本回滚链接；
5. 不把“下载请求次数”写成“安装用户数”：浏览器重试、Range 请求、缓存、下载失败和同一用户重复下载都会造成差异。

服务器文件系统路径、Nginx 配置、统计任务和运维责任人目前没有进入仓库台账，接管时必须由现维护人补齐；不要根据公开 URL 猜测部署路径或在文档中保存 SSH 凭据。

## 5. iOS / iPadOS 发布

### 5.1 账号与签名预检

在 Xcode 的 Accounts 和 Apple Developer/App Store Connect 中确认：

1. Apple Developer Program 会员有效，并已同意最新 Program License Agreement。
2. Bundle ID 为 `com.starlightplayer.app`，Team 与工程配置一致。
3. Keychain 中存在有效的 Apple Distribution 证书及其私钥；只有 `.cer` 而没有私钥无法签名。
4. Automatic Signing 能生成/下载 App Store Provisioning Profile。
5. App Store Connect 已创建对应营销版本，新的 build number 未被使用。

`No signing certificate ... with a private key` 应先在生成证书私钥的 Mac 上导入含私钥的 `.p12`，或重新创建证书；不要反复清缓存掩盖签名问题。

### 5.2 安装 Pods 并构建 Archive

```bash
(cd ios && pod install)
```

推荐在 Xcode 打开 `ios/StarlightPlayer.xcworkspace`：

1. Scheme 选 `StarlightPlayer`。
2. Destination 选 `Any iOS Device (arm64)` 或等价 generic device，不能选 Simulator。
3. Product → Archive。
4. Archive 完成后先执行下一节的产物核验，再 Validate/Distribute。

命令行等价示例：

```bash
STARLIGHT_ARCHIVE_PATH="$(pwd)/release/ios/StarlightPlayer-X.Y.Z-buildN.xcarchive"
xcodebuild \
  -workspace ios/StarlightPlayer.xcworkspace \
  -scheme StarlightPlayer \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$STARLIGHT_ARCHIVE_PATH" \
  archive
```

不要在声称支持 iOS 13/14 的正式 Archive 命令中传入 `IPHONEOS_DEPLOYMENT_TARGET=15.0`，也不要用 `STARLIGHT_LOCAL_IOS_DEPLOYMENT_TARGET=15.0` 生成发布 Pods。

### 5.3 Archive 的硬性核验

Build Settings 不是最终证据，必须检查 Archive 内的 App：

```bash
STARLIGHT_APP_INFO="$STARLIGHT_ARCHIVE_PATH/Products/Applications/StarlightPlayer.app/Info.plist"
/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$STARLIGHT_APP_INFO"
/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$STARLIGHT_APP_INFO"
/usr/libexec/PlistBuddy -c 'Print :MinimumOSVersion' "$STARLIGHT_APP_INFO"
/usr/libexec/PlistBuddy -c 'Print :UIDeviceFamily' "$STARLIGHT_APP_INFO"
/usr/libexec/PlistBuddy -c 'Print :UIRequiresFullScreen' "$STARLIGHT_APP_INFO"
codesign -dvv "$STARLIGHT_ARCHIVE_PATH/Products/Applications/StarlightPlayer.app"
```

验收：

- 版本/构建号与发布单一致；
- `UIDeviceFamily` 同时包含 1 和 2；
- `UIRequiresFullScreen` 为 false，iPad 可旋转/分屏；
- 若本次承诺 iOS 13/14，`MinimumOSVersion` 必须为 13.4，且还要通过 iOS 13/14 真机；
- 如果最终仍为 15.0，必须明确改变支持范围和商店文案，不能沿用“iOS 13.4+”声明。

已上传的 `1.0.0 (4)` 在这里得到 15.0，这是现有产物事实，不是推测。

### 5.4 导出与上传

在 Organizer 选择 Archive：

1. Validate App；处理所有 error，逐条评估 warning。
2. Distribute App → App Store Connect → Upload。
3. 确认导出签名为 Apple Distribution，entitlement 中 `get-task-allow=false`。
4. 等待 App Store Connect 完成处理，再把该 build 绑定到版本页面。

若使用 `xcodebuild -exportArchive`，ExportOptions 必须使用 `app-store-connect`、正确 Team、Automatic Signing；ExportOptions 可能含团队信息，应作为受控发布配置管理。上传成功日志只证明二进制到达 Apple，不证明已提交审核或通过审核。

### 5.5 App Store Connect 元数据

提交审核前核对：

- 版本说明覆盖自上一个公开版本以来的用户可感知变化；
- iPhone 和 iPad 截图来自对应设备尺寸，内容与候选 build 一致；
- 隐私政策、App Privacy、支持网址、年龄分级、加密声明准确；
- 21 首音频的分发授权已由产品方确认；
- 选择正确 build，回答审核问题并保存；
- 最后一次点击“提交审核”属于外部不可逆业务动作，应由有权限的发布负责人确认。

## 6. 发布后验证与回滚

发布后至少执行：

1. 从真实分发渠道下载，而不是继续使用本地安装包。
2. 核对版本/构建号、首次启动、升级保留设置与累计遍数。
3. 播放 A05 和至少一首长音频，验证自然结束、重复与同步换遍。
4. Android 核对通知/锁屏/后台；iOS 核对控制中心/锁屏/后台。
5. 核对下载页文件 SHA-256 和统计逻辑；HTTP 请求/缓存策略可能使“点击次数”与真实安装数不同。
6. 记录 App Store/Play 状态和已知问题。

发现严重问题时停止继续推广：商店端暂停分阶段发布或提交修复 build；自建下载页保留上一个已知可用 APK 的可回滚链接。不能复用已经上传过的 build number，也不能用重新签名的同名文件覆盖而不更新哈希和发布记录。

## 7. 发布记录

- 每个平台的测试细节使用 [`test-runs/TEMPLATE.md`](test-runs/TEMPLATE.md)。
- 版本、制品、渠道、批准和回滚使用 [`release-records/TEMPLATE.md`](release-records/TEMPLATE.md)。
- 已有记录和不可变规则见 [`release-records/README.md`](release-records/README.md)。

发布记录中必须区分“上传成功、提交审核、审核通过、分阶段发布、全部可下载”；没有商店或真实渠道证据时保留 UNKNOWN，不能根据构建日志推断发布状态。
