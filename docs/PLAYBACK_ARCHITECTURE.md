# 播放架构与状态机

## 1. 设计意图

这不是一个“播到结尾就算一次”的普通音乐播放器。产品有两个并列核心：严格的完整周期计数，以及多设备共修同步。对佛教功课来说，一个有效周期必须从有效起始区间连续播放到实际结尾；同步模式允许设备从共同时间对应的中间位置加入，但这个尾段是“第 0 遍”，不计入 N 遍。

## 2. 核心不变量

1. 同步模式是产品核心能力：相同曲目按共同时间基准对齐，不能被任意 seek 破坏。
2. `repeatCount` 始终先于四种 `playMode`；同步对齐不改变这个优先级。
3. 只有 `cycleEligible=true`，且 QueueEnded 事件位置和播放器实时位置都接近元数据时长，才计一遍。
4. 真换曲必须清零 `session_count`；后台恢复同一首必须保留它。
5. RNTP `RepeatMode` 固定为 Off；所有重播和列表行为由 JS 状态机决定。
6. TrackPlayer 命令必须进入 `enqueuePlayerCommand`；JS Promise 链保证正常 ReactContext 内串行，原生 `PlayerCommandLock` 防御额外 ReactContext 或桥接重入。
7. 用户明确暂停/停止时 `expected_playing=false`；只有意外 Ended/Error/Stopped/None 才自动恢复。

## 3. N 遍与四种模式

| 条件 | 动作 |
|---|---|
| `sessionCount < repeatCount` | 不看 playMode；普通模式从 0 重播，同步模式重新按墙钟对齐当前曲 |
| 达 N 遍 + `repeat-one` | session 清零；普通模式从 0 继续，同步模式重新按墙钟对齐 |
| 达 N 遍 + `play-one` | 停止，保留 N；用户再按播放时清零 |
| 达 N 遍 + `repeat-all` | 换下一首并清零，末尾回第一首 |
| 达 N 遍 + `play-all` | 非末尾换下一首；末尾停止 |

这个决策是纯函数 `decidePostCycleAction`，并有针对四种模式的单元测试。

## 4. `cycleEligible` 语义

`cycleEligible` 不是“正在播放”，而是“当前这一遍是否仍有资格在结尾计数”。

| 事件 | 资格变化 |
|---|---|
| 非同步换曲或自然下一遍从 0 开始 | true |
| 同步模式自然结束后逐遍对齐到 0–1.5 s | true |
| 同步模式自然结束后因严重延迟对齐到 1.5 s 以后 | false；先完成不计数的尾段 |
| 同步模式从中间加入 | false；这是第 0 遍 |
| UI/远程 seek 到 0–1.5 s | true；之后完整播到尾可计数 |
| UI/远程 seek 到其他位置 | false |
| 同步暂停/中断后恢复，对齐位移 ≤ 1.5 s | 保留之前资格 |
| 同步暂停/中断后恢复，对齐位移 > 1.5 s | false，因为播放不连续 |
| QueueEnded 位置与元数据时长不符 | 不计数 |

注意：同步模式在每次自然播到末尾后都会再次按墙钟对齐，而不是固定 `seekTo(0)`。已经同步的设备理论上会在共同周期边界到尾；由于 QueueEnded 回调和命令执行存在延迟，重新计算的位置通常是接近 0 的小偏移。小偏移落在有效起始区间时，下一周期仍可计数；若处理严重延迟导致对齐到中途，则该尾段不计数。

## 5. 同步模式

```text
alignedPosition = (当前时刻 - 设备本地当日 00:00) % 曲目时长
```

- 它不使用服务器时间，也不校时；设备时区或时钟不同会影响结果。
- App 进度条不可拖动。锁屏/通知栏不公布 `Capability.SeekTo`。
- 某些系统仍可能发 `RemoteSeek`；Service 不接受该位置，而是立即恢复对齐位置。
- 打开同步、按播放恢复、每次自然结束后的下一遍、可恢复的音频中断以及异常 watchdog 恢复都会重新对齐。

## 6. ReactContext 与后台生命周期

RNTP Android `MusicService` 是 `HeadlessJsTaskService`，正常情况下复用应用的 ReactContext，并不是固定存在两个互相独立的 JS runtime。仍不能把 JS 模块变量当作持久权威状态：UI 可被销毁、进程可重建，事件回调也可能交错；额外 ReactContext 或桥接重入亦应安全。

因此，正常上下文内由 JS Promise 链排队，Android/iOS 原生 `PlayerCommandLock` 再做进程级互斥。锁的租约为 30 秒，持锁命令每 10 秒续约；若持锁 ReactContext 消失，租约最终会自动释放。

MMKV 持久化协议：

| key | 含义 |
|---|---|
| `settings` | 关怀模式、同步开关、repeatCount |
| `player_state` | UI 使用的 trackIndex 与 playMode |
| `current_track` | Service/UI 共享的当前曲目 ID + index |
| `pending_track_change` | 换曲 token、目标和原因，防止过期 reset/add 提交 |
| `track_generation` | 每次逻辑换曲递增，识别迟到的 ActiveTrackChanged/QueueEnded |
| `session_count` | 当前曲已完成的有效遍数 |
| `cycle_eligible` | 当前这一遍的计数资格 |
| `expected_playing` | 用户是否期望持续播放，供 watchdog 判断 |
| `playback_paused_at` | 同步暂停/中断时间，用于判断当前遍是否仍连续 |
| `last_track_id` | 仅为已安装旧版本迁移保留，不再用它判断换曲 |
| `started_from_zero` | 仅为旧数据迁移读取，新代码统一使用 `cycle_eligible` |

## 7. 换曲协议

1. 从持久化当前曲目计算 next/previous，不使用 JS 内存 `currentIndex`。
2. 写入 `pending_track_change`，再执行 reset 和 add。
3. 同时递增 `track_generation`，并把 generation 写入 RNTP track 的 `starlightGeneration` 元数据。
4. reset/add 后都检查 token；已被新操作取代则立即放弃提交。
5. add 成功后写 `current_track`。真换曲清零 session，restore 保留 session。
6. `PlaybackActiveTrackChanged` 校验 generation 和当前原生曲目；仍是同一 ID 时当作恢复，只有未预期的真换曲才补做清零和 seek。接管已存在的原生曲目不会再次递增 generation，避免原生 metadata 与 MMKV 脱节。

## 8. QueueEnded 幂等、重试和恢复

- 同一曲 5 秒内的重复 QueueEnded 被忽略；正常曲目最短约 60 秒，不会误伤下一个自然结尾。
- 处理前同时比对 generation、原生 active track 与持久化 ID，并复核原生实时进度，忽略用户刚换曲或新一遍开始后迟到的旧事件。
- `completeCycle` 每个事件最多执行一次。重启/换曲动作可重试，但不再加 session/stats。
- `play()` 失败时会先调 `retry()` 再尝试一次。
- PlaybackState 进入 Ended/Error/Stopped/None 且 `expected_playing=true` 时，1.5 秒后二次确认；状态仍异常才重建空队列并验证实际启动。普通模式从 0 恢复，同步模式按墙钟恢复并重新判定当前遍资格；执行恢复前还会再次检查用户是否已经暂停/停止。失败后按 1.5/3/6 秒最多恢复三轮，耗尽后清除 `expected_playing`，避免无限重试。

## 9. Android 后台策略

- `AppKilledPlaybackBehavior.ContinuePlayback`：从最近任务划掉 UI 后继续播放。
- `stopForegroundGracePeriod: 30`：暂停/短暂结尾后给重启更长的前台宽限。
- Manifest 不再声明已废弃的 `com.guichaguri.trackplayer.service.PlayerService`；RNTP 4.1 的 `MusicService` 由 library manifest 合并。

## 10. 必测矩阵

| 维度 | 值 |
|---|---|
| 模式 | repeat-one / play-one / repeat-all / play-all |
| 遍数 | 1 / 7 |
| 同步 | 开 / 关 |
| 控制源 | App / 锁屏 / 耳机 / 通知栏 |
| 生命周期 | 前台 / 锁屏 / 切后台 / 划掉 UI / Service 重建 |
| 中断 | 来电、音频焦点、长时暂停、手动 seek、连续点按上下首 |

验收时必须同时检查声音、UI 当前曲、`session_count`、每日 stats 和导出日志，不能只听“是否还在播”。
