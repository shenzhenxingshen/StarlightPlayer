# iOS生产视频引擎独立验证

从仓库根目录运行：

```sh
node tools/video-native-validation/run.mjs BOOTED_IOS_SIMULATOR_UDID [OUTPUT_DIRECTORY]
```

需要本机Xcode、已启动的iOS15+模拟器、Node；不下载依赖。工具编译、签名并安装独立
`org.starlight.video-native-validation`测试App，不修改星光播放器的数据或原始媒体。
结果写入被Git忽略的`release/video-native-validation/`。

`Probe.mm`直接导入生产`VideoProgramPlayer.mm`，React头仅为注册宏/类型桩；
实际使用生产AVPlayer、AVMutableComposition、视频文件和AVPlayerLayer。
测试49遍组合的五类接缝、98遍迟到加入、暂停/同一起点恢复、结束不回绕/拒绝重启。
每100ms记录墙钟目标、播放器位置、rate和错误；检查接缝跨越、时间倒退/大跳、
正常稳定期250ms播放器时钟误差上限。新增片段中途注入1秒偏差不纠偏、
边界落后/超前/跨多段纠偏、纠偏中取消、媒体落后仍按公共窗口停止；共24项断言。
另以AVPlayer子类对单次真实preroll完成回调延迟2秒，验证600ms重试及迟到回调隔离；
其余解码、seek、画面和播放时钟仍是实际AVPlayer，不把该注入当作真机故障复现。
故障注入仅修改独立测试进程中的任务起点，不修改系统时钟。
注入场景在片段中途**允许并要求**偏差保留，下一边界之后才检查恢复对齐，
不能沿用旧的“所有稳定播放采样必须小于250ms”要求。
另用设备SDK进行13.4 API availability编译检查，
不安装真机、不改变生产deployment target。

输出：

- `identity.json`：源码hash、媒体revision、时间、SDK/build/minimumOS和模拟器ID。
- `events.json`：原始本机事件；含环境信息，不直接上传公开仓库。
- `analysis.json`：检查结果。任何断言失败工具以非零状态退出。

局限：不是完整RN桥接/UI E2E，不测扬声器/声卡输出，不验证解码画面每帧的连续性，
不证明听感无缝，不连续播放完整一小时/两小时，不是iOS13/14真机验收。
时钟误差特别小是host-clock调度的结果，不能当作跨设备声音同步精度。
Android需要独立真实引擎验证，不能借用本工具的iOS结果。
