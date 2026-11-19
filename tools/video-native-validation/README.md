# iOS生产视频引擎独立验证

从仓库根目录运行：

```sh
node tools/video-native-validation/run.mjs BOOTED_IOS_SIMULATOR_UDID
```

需要本机Xcode、已启动的iOS15+模拟器、Node；不下载依赖。工具编译、签名并安装独立
`org.starlight.video-native-validation`测试App，不修改星光播放器的数据或原始媒体。
结果写入被Git忽略的`release/video-native-validation/`。

`Probe.mm`直接导入生产`VideoProgramPlayer.mm`，React头仅为注册宏/类型桩；
实际使用生产AVPlayer、AVMutableComposition、视频文件和AVPlayerLayer。
测试49遍组合的五类接缝、98遍迟到加入、暂停/同一起点恢复、结束不回绕/拒绝重启。
每100ms记录墙钟目标、播放器位置、rate和错误；检查接缝跨越、时间倒退/大跳、
稳定期250ms时钟误差上限。另用设备SDK进行13.4 API availability编译检查，
不安装真机、不改变生产deployment target。

输出：

- `identity.json`：源码hash、媒体revision、时间、SDK/build/minimumOS和模拟器ID。
- `events.json`：原始本机事件；含环境信息，不直接上传公开仓库。
- `analysis.json`：检查结果。任何断言失败工具以非零状态退出。

局限：不是完整RN桥接/UI E2E，不测扬声器/声卡输出，不验证解码画面每帧的连续性，
不证明听感无缝，不连续播放完整一小时/两小时，不是iOS13/14真机验收。
时钟误差特别小是host-clock调度的结果，不能当作跨设备声音同步精度。
Android需要独立真实引擎验证，不能借用本工具的iOS结果。
