# 全盘代码走查结论

> 状态：2026-10-12 播放稳定性修复后。

## 已修复的高风险问题

- `last_track_id` 预写导致真换曲被误认为恢复：已改为 `current_track + pending_track_change`。
- Service 依赖 JS 内存 `currentIndex`：已改为持久化曲目 ID 推导索引。
- UI/Service 并发 TrackPlayer 命令：已加 JS 队列 + Android/iOS 进程级锁。
- 长命令超过原生锁租约：已加 10 秒 lease heartbeat，并以 generation 防止旧超时回调释放新租约。
- QueueEnded 无异常保护：已加位置校验、5 秒去重、计数幂等、动作重试和 watchdog。
- 迟到的换曲/结束事件污染新曲目：已增加持久 generation、原生 track 元数据和双重校验。
- seek 未统一改变当前遍资格：已统一为 `cycleEligible + seekWithReasonInCommand`。
- 同步模式锁屏仍可 seek：已移除 SeekTo capability，并对异常 RemoteSeek 强制回正。
- Android 旧 RNTP Service 声明：已删除。
- Android 后台策略依赖默认值：已显式设置 ContinuePlayback 和 30 秒 grace period。
- 诊断复制会截断/假报成功：已改为 Android/iOS 原生 `.txt` 文件导出。

## 仍需真机证明的风险

1. 不同 Android 厂商的省电策略可以在系统层杀掉前台服务；应用内无法绝对防止。
2. RNTP HeadlessJS 正常复用同一 ReactContext；若额外 ReactContext 在持锁时消失，仍会依赖最多 30 秒 lease 超时释放，需压测快速划掉/重进。
3. 音频元数据 `durationMs` 是同步与 QueueEnded 判定的业务数据；替换 MP3 必须重新测量。
4. 自动化测试不能模拟 Android 前台服务、iOS 音频中断和锁屏中心；必须保留真机回归。
5. 当前全局行/分支覆盖率为 55.72%/48.71%，PlaybackService 为 87.98%/70.39%；App 页面交互和原生分支仍需补测。

## 中低风险债务

- Android `INTERNET` 与 iOS 宽松 ATS 对当前离线功能不是必需。
- 音频在两个平台目录双份保存，容易产生版本偏差。
- `scripts/copyAssets.js` 的默认源目录当前不存在。
- 日志保留 1000 条可能在长时运行中仍不足；实机压测后决定是否改为滚动文件。
