# 视频片段边界同步回归

状态：开发阶段验证，非不可变发行候选的 `FINAL` 验收。
日期：2026-11-19（Asia/Shanghai）。
分支：`codex/video-scheduled-programs`。
基线：`b779afd9d63f4459e0b883ccf257c5e30c1c283e`，结果对应其后的未提交工作树。
接续[视频界面回归](2026-11-19-video-ui.md)，不覆盖原记录。

## 1. 调整范围与约定

用户要求：只在启动、加入/恢复，以及视频片段自然开始（包括同文件下一遍）时
比较同步，避免片段中途频繁跳转导致播放断续。

- 两端取消原来500ms循环中的同步seek；500ms轮询只保留任务窗口截止检查。
- 自然接缝比较公共时间与引擎位置，偏差不超过250ms则连续播放，超过才重新对齐。
- 展开后的片段序号标识每次重复；先消费边界再纠偏，seek/回跨同一边界不再触发纠偏。
- 暂停、停止或新任务使旧回调失效。准备失败有上限，不能无限处于“正在准备”。
- Android准备重试的提前量依次为350/700/1050/1400ms，目标仍由原任务起点计算。
- iOS为preroll回调增加600ms单次等待上限；超时取消并有限重试，迟到回调不得重启播放。
- 边界重新对齐整体最多6秒；首次加载另有原有的整体超时。
- 导出诊断增加最近300条原生视频事件，便于区分加载、边界校准和真实缓冲。
  原生缓冲是进程内记录，不跨杀进程保存。

本轮没有修改音频N个有效周期/四种模式、音频同步阈值、媒体文件、GOP、时长或
播放器缓冲配置。APK包含此前尚未提交的UI、拨轮及去二维码素材改动，
不能将整个工作树差异都归为本轮同步修订。

取舍：卡顿或系统时钟变化可能使片段中途暂时偏离公共进度，下一自然边界才校准；
不再保证全程250ms以内。任务仍按原窗口结束，存在轮询/调度延迟。
这不是声学无缝或跨设备输出零延迟保证。

## 2. 最终验证结果

| 项目 | 结果 | 范围 |
| --- | --- | --- |
| TypeScript | PASS | `npm run typecheck` |
| Jest | PASS | 39 suites / 442 tests；含原音频和新增诊断导出回归 |
| 定向ESLint | PASS，有警告 | 0 errors；Profile已有15条warnings，未声称全仓无警告 |
| 视频资产校验 | PASS | 六份文件与manifest一致 |
| Android独立原生播放 | PASS | API35/arm64模拟器，14个场景，生产ExoPlayer模块和打包媒体 |
| iOS独立原生播放 | PASS | iPhone16 Pro/iOS18模拟器，24项断言，生产AVPlayer模块和打包媒体 |
| iOS13.4 API availability编译 | PASS，有限结论 | 产物minos13.4；SDK27仍有libc++旧平台警告，不代替完整App旧系统验收 |
| Android Release APK | PASS，构建/包体核验 | 离线构建成功，签名有效，6视频/21音频哈希一致，无探针Activity/类 |
| RN完整App视频E2E | NOT RUN | 原生测试壳不是完整App界面/桥接自动化 |
| 原报障安卓真机流畅度 | NOT RUN | 需要用户手机安装本次APK复测 |
| 完整49/98遍、多机声学、来电/蓝牙、iOS13/14真机 | NOT RUN | 不能用短时边界或mock结果代替 |

Jest仍打印已有App测试mock的function component ref警告，无失败测试。
本轮未重新采集覆盖率，不借用上一轮覆盖率表示新增原生分支覆盖率。

### 正常切换

两端均实际跨越片头→礼敬、礼敬→正文、正文→下一遍、正文→最后一遍、
最后一遍→片尾五类边界：每处比较一次，均无需纠偏。
Android这五类正常场景稳定播放样本最大时钟偏差约99ms；
iOS对应样本最大约0.049ms。两者是引擎报告时钟，不是扬声器/屏幕或多机精度。

另验证98遍流程中途加入、自然结束不回绕、过期窗口拒绝。
iOS还验证暂停保持媒体位置、公共时钟推进，以及恢复追平。

### 故障注入

仅改变独立测试进程中的任务起点，不修改操作系统时间或普通App数据：

- 片段中途注入约1秒落后：两端均持续播放，未执行中途纠偏。
- 下一边界分别注入落后1秒、超前0.8秒、跨多个片段落后11秒：
  两端每个场景只纠偏一次，末尾连续5个采样恢复到250ms内。
- 超前纠偏向后跨接缝后，再次经过相同边界不重复纠偏。
- 纠偏中暂停：后续采样保持暂停，旧回调没有重新启动播放器。
- 媒体落后约2秒时公共窗口结束：不为了补播而延长任务。
- iOS测试壳单次延迟真实preroll完成回调2秒：触发600ms保护，重试成功，
  迟到回调被忽略。本注入不进入生产App。

## 3. 首轮失败与修订

保留首轮结果，不将其改写为通过：

- Android首轮10/14。片头场景加入点离接缝过近，加载完成已跨过接缝，
  不满足“测试自然切换”的前置；改为提前4秒加入，观测6秒。
  另三个场景在固定350ms提前量下四次准备均赶不上目标，返回`video_slow`。
  改用递增准备提前量后r02为14/14；r02实际命中了700ms和1050ms重试。
  这不代表已在真机证明所有准备都能在该上限内完成。
- iOS首轮22/23，向后跨接缝场景停在约4.551秒。首轮日志不足以唯一确认卡在哪一阶段；
  增加preroll事件及有界等待后r02为23/23。
  再新增延迟preroll回调的故障注入，r03为24/24，明确覆盖重试及迟到回调防护。

## 4. 源码、制品和证据身份

媒体revision仍为`video-2026-11-19-v2`。

| 对象 | SHA-256 |
| --- | --- |
| Android `VideoProgramPlayerModule.kt` | `b446f70b9ee6b7e8039908144f1af56a2c2df89b06951081f588c5400baa4c33` |
| iOS `VideoProgramPlayer.mm` | `30b17aa75793d324d9eb2ef061e9494c979084d3c24edf5eaa72d1b981a5016b` |
| 隔离Android Debug测试APK | `ca9060d68029fa3b854dec139d56c63ca8f2cd7c920900742a356829d768b831` |
| Android Release复测APK | `4a0e8dac585addd24e157b1806a704fb4e8c8801168c4592a495b738bb37e5eb` |

复测APK：`release/android/StarlightPlayer-1.1-build6-video-boundary-sync-20261119-1531.apk`。
包名`com.starlightplayer`，versionName`1.1`、versionCode`6`（本轮没有改版本号）。
223,285,885字节；minSdk23、targetSdk35，arm64-v8a/armeabi-v7a/x86/x86_64四架构。
签名证书SHA-256：
`4a73c8dd86b5e71e73d9317f0cdb950c876344f470c998ff815ff5e15780767b`，
与前次复测包相同；v1/v2签名验证通过。适合作为本地复测包，不代表发行批准。
未进行自动安装到用户手机、上传下载站或TestFlight。

原始证据位于本机被Git忽略的`release/`，未归档至长期受控存储，不能作为远端
开发者可访问的完整证据。后续提交只包含本摘要、验证工具及代码，不包含用户原诊断原文。

| 本地证据路径 | SHA-256 |
| --- | --- |
| `release/android-video-validation/boundary-faults-20261119-r02/events.json` | `bc84153c6ab33c321d1bf44121c1fe63f535d56ee161c73e8cc9cb1a3d89841d` |
| `release/android-video-validation/boundary-faults-20261119-r02/analysis.json` | `ec54c121331f3735ec8d401f3b0cea08fba8a0fd75e7ddc50ca4c1f97bea34a0` |
| `release/video-native-validation/boundary-faults-20261119-r03/events.json` | `c6aec5772a00613aeaf7dbf3a691636f54ca431e3a8d9d0609396d22623eb892` |
| `release/video-native-validation/boundary-faults-20261119-r03/analysis.json` | `264a2fcecad41b979644dd37e8ee25b922b960f279238695b55f7eff0d2f3194` |

Android运行开始`2026-11-19T07:30:23.262Z`；
iOS运行身份时间`2026-11-19T07:30:56.720Z`。
首轮未带r后缀的目录及iOS的r02目录均保留。

## 5. 复现与真机复测

基础检查：

```sh
npm run typecheck
npm test -- --runInBand
node scripts/verify-video-assets.mjs
```

两端原生测试命令见[iOS工具](../../tools/video-native-validation/README.md)、
[Android工具](../../tools/android-video-validation/README.md)，每次选择新的输出目录。
Android Release在`android/`执行：

```sh
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
  ./gradlew :app:assembleRelease --offline --console=plain --max-workers=4
```

在原报障手机上安装后，加入一个处于有效窗口的视频任务：

1. 片段内连续观看至少两遍，记录是否仍反复出现“正在准备并追平”和明显卡顿。
2. 观察普通正文下一遍、正文转最后一遍的接缝；自然切换不应每次都强制seek。
3. 暂停数秒再恢复，确认加入公共进度；切后台再返回亦需验证。
4. 若复现，尽量不杀进程，立即从“我的”导出诊断，记录发生时间和当时片段。
   新包日志含原生`boundary_check`、`boundary_correction`、`prepare_late`等，
   可判断是边界重对齐还是片内真正的解码/缓冲问题。

本轮没有用模拟器通过来宣称已根治原设备卡顿，也未自动提交或推送代码。
