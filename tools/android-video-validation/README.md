# Android 原生视频边界同步验证

直接调用生产 `VideoProgramPlayerModule`、ExoPlayer、真实打包素材和 TextureView。
Debug 专用 Activity；通过 `.videovalidation` 独立包运行，不覆盖正常 App 数据。
不是 RN 界面 E2E，也不代表真机声学/掉帧验收。无需 Metro、额外测试库。

从仓库根目录：

```sh
cd android
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
  ./gradlew :app:assembleDebug --offline --console=plain --max-workers=4 \
  -PvideoValidation=true -PreactNativeArchitectures=arm64-v8a
cd ..
node tools/android-video-validation/run.mjs emulator-5554 release/android-video-validation/my-run
```

JDK、架构和设备序列号按本机调整；可用 `ADB` 环境变量指定 adb。
务必先按上述参数构建，普通 Debug 包不会执行故障注入。
正式 Release 不包含探针 Activity 或故障注入代码。

14 个场景覆盖五种素材/重复接缝、98 遍迟到加入、片段中途偏差不 seek、
边界落后/超前/跨多段纠偏、纠偏中取消、墙钟到期提前停、自然结尾和过期拒绝。
仅改变测试进程中的任务起点模拟偏差，不改变系统时间。
输出 `events.json`、`analysis.json`、`identity.json`；任一断言失败返回非零。
脚本有 200 秒截止，超时用 logcat 查看 `StarlightVideo` / `AndroidRuntime`。
