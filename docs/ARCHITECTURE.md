# StarlightPlayer 项目全景架构

> 适用于 1.0 源码，依据 2026-10-16 的 `main` 分支逐项核对。本文回答“模块如何协作、状态以谁为准、前台 UI 与后台播放怎样共同工作”。重复计数与同步算法的业务细节见 [PLAYBACK_ARCHITECTURE.md](PLAYBACK_ARCHITECTURE.md)，所有持久化字段见 [STORAGE_MODEL.md](STORAGE_MODEL.md)。

## 1. 系统边界与核心目标

StarlightPlayer 是一个完全本地运行的 React Native 音频播放器。21 首音频随安装包分发，不依赖账号、后端 API、数据库、推送、广告或云端消息队列。运行时的外部边界只有操作系统音频能力：

- React Native 负责页面、交互和业务编排；
- React Native Track Player（RNTP）负责原生音频队列、后台播放、音频焦点和锁屏/通知栏控制；
- MMKV 保存跨 UI 销毁、后台 Service 和 App 重启的业务状态；
- 两个自研原生模块分别提供播放器命令互斥和诊断文件分享；
- Android/iOS 安装包各自包含一份相同曲目集合。

产品设计有两个并列核心，任何重构都必须同时守住：

1. 每首先完成设定的 `N` 个有效完整周期，之后才执行四种播放模式；
2. 同步模式按设备本地时间把相同曲目对齐到共同位置，并在每个自然周期结束后重新对齐。

RNTP 的原生 RepeatMode 始终设置为 Off。重播、换曲、停止、遍数统计和同步全部由本项目的 JS 状态机实现。

## 2. 总体分层

```text
用户 / 锁屏 / 耳机 / 系统音频中断
                  │
        ┌─────────┴──────────┐
        │                    │
 React Navigation UI    RNTP PlaybackService
 screens + components    Remote*/QueueEnded/Error
        │                    │
        ├──── Zustand ───────┤
        │   仅 UI 响应镜像    │
        └─────────┬──────────┘
                  │
        playerCommandQueue（每个 JS context 内串行）
                  │
        PlayerCommandLock（原生进程级互斥）
                  │
        trackManager / playbackCycle / playbackDecision
             │                         │
             │                         └── MMKV 业务状态与日志
             │
        RNTP 原生播放器与单曲队列
             │
       Android MediaSession / iOS Now Playing
```

这不是传统的 Redux 单一状态树。当前系统同时存在四类状态，生命周期和权威范围不同：

| 状态层                    | 代表内容                                         | 生命周期                         | 权威范围                                                  |
| ------------------------- | ------------------------------------------------ | -------------------------------- | --------------------------------------------------------- |
| RNTP 原生播放器           | active track、position、duration、playback state | 可越过 UI 销毁；进程终止后不保证 | 实际声音、队列和播放状态                                  |
| MMKV                      | 曲目意图、模式、计数、资格、generation、日志     | 跨 App 重启，卸载前持续          | 可恢复的业务状态与 UI/Service 协调协议                    |
| Zustand / React state     | 设置响应镜像、统计响应镜像、页面展示状态         | 当前 JS context / 组件生命周期   | 当前 UI 渲染；不能单独作为后台 Service 的持久权威         |
| JS 模块变量、定时器和队列 | 初始化标志、事件去重、watchdog、Promise 命令链   | 当前 JS context                  | 短期协调；进程或 context 重建后允许丢失，不能承载业务真相 |

## 3. 模块地图

### 3.1 入口与应用壳

| 模块                        | 职责                                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------- |
| `index.js`                  | 最先加载 logger；注册 React 根组件和 RNTP PlaybackService。                             |
| `src/App.tsx`               | 初始化/复用 RNTP、恢复或接管队列、下发播放器能力、请求 Android 通知权限、创建底部 Tab。 |
| `src/screens/*`             | 播放页、曲目列表和“我的”设置页；把用户意图交给统一命令层。                              |
| `src/components/*`          | 曲目信息、唱片、五个控制按钮、横/竖进度条和竖屏/方屏/横屏组合布局。                     |
| `src/utils/playerLayout.ts` | 纯函数计算窗口分类和有界布局 token；旋转或分屏只改变展示，不得触发播放器命令。          |

`App.tsx` 中的 `_initialized`、`_initializing` 和 `PlayerScreen.tsx` 中的 `restoring` 都只是当前 JS context 的防重标志。它们重建后会重置，不能被视为持久状态。

### 3.2 UI 状态

| 模块                         | 职责                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/store/settingsStore.ts` | 启动时从 MMKV 读取关怀模式、同步模式和重复遍数；每次 toggle/set 先持久化，再更新 Zustand。       |
| `src/store/statsStore.ts`    | 把当日完成次数映射到 Zustand；PlaybackService 通过它递增 MMKV 统计。当前页面没有展示这份统计。   |
| `PlayerScreen` 本地 state    | 保存当前 `playMode`、短暂的模式提示等组件状态；`playMode` 每次变化同步写入 `player_state`。      |
| RNTP React hooks             | `useActiveTrack`、`usePlaybackState`、`useProgress(500)`驱动实际曲目、播放态和 500 ms 进度刷新。 |

Zustand 不是后台播放状态的总线。PlaybackService 对设置、模式和计数的关键判断会直接读取 MMKV，避免依赖另一个 React context 中可能过期的内存快照。

### 3.3 播放业务内核

| 模块                              | 职责                                                                                                |
| --------------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/utils/trackManager.ts`       | 从持久化曲目计算索引；以 reset → add → seek 的协议替换单曲队列；区分 restore 和真实换曲；验证启动。 |
| `src/utils/playerCommandQueue.ts` | 把影响队列或播放状态的 TrackPlayer 写命令放进 JS Promise 链，并在执行期间取得原生进程锁。           |
| `src/utils/playbackCycle.ts`      | 唯一的业务 seek 入口；按 seek 原因维护 `cycle_eligible`；处理完成任务后再次播放的清零。             |
| `src/utils/playbackDecision.ts`   | 纯函数决定自然结束后重播、清零重播、下一首或停止；同时校验 QueueEnded 位置。                        |
| `src/services/playbackService.ts` | 监听远程控制、音频中断、换曲、QueueEnded 和错误；计数、执行播放模式并运行异常停止 watchdog。        |
| `src/utils/syncUtils.ts`          | 用“本地当天 00:00 至今的毫秒数 % 曲目业务时长”计算同步位置。                                        |
| `src/utils/playerOptions.ts`      | 根据同步/关怀模式收紧远程 capability，配置 Android 划掉 UI 后继续播放和前台 Service 宽限。          |
| `src/utils/storage.ts`            | MMKV schema、校验、旧字段兼容和跨生命周期协议。                                                     |
| `src/constants/tracks.ts`         | 曲目 ID、顺序、文件名和业务标准时长；同步取模和结尾校验依赖这里的 `durationMs`。                    |

### 3.4 诊断链路

| 模块/边界                             | 职责                                                                                          |
| ------------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/utils/logger.ts`                 | 拦截全局 JS 错误和 `console.error/warn`，保存最多 1000 条 MMKV 日志；单条消息最多 2000 字符。 |
| `src/screens/ProfileScreen.tsx`       | 合并设备信息、App/RN 版本、导出时间和全部日志，调用原生分享接口。                             |
| `src/utils/diagnosticExporter.ts`     | 对 `NativeModules.DiagnosticExporter` 做薄封装，原生模块缺失时明确报错。                      |
| Android `DiagnosticExporterModule.kt` | 写入 `cacheDir/diagnostics`，通过非导出的 FileProvider 临时授权 URI，并打开系统分享面板。     |
| iOS `DiagnosticExporter.mm`           | 写入 `NSTemporaryDirectory()`，打开 `UIActivityViewController`；在 iPad 上配置 popover 锚点。 |

诊断导出没有上传动作，也不访问项目服务器；分享目标完全由用户在系统面板中选择。日志中会包含时间、设备信息和播放事件，字段范围和隐私注意事项见 [PRIVACY.md](../PRIVACY.md)。

## 4. 启动与恢复流程

### 4.1 JS 注册阶段

1. `index.js` 先 import logger，使初始化期错误也能记录；
2. 向 `AppRegistry` 注册 `StarlightPlayer`；
3. 向 RNTP 注册 `PlaybackService` 工厂；只有 RNTP 请求播放服务时才执行其监听器注册逻辑；
4. `serviceInitialized` 防止同一 JS context 重复挂监听器，context 重建后会自然重置。

### 4.2 App 初始化阶段

1. `App.tsx` 进入命令队列调用 `TrackPlayer.setupPlayer`；Android 前台条件不满足时最多尝试 5 次、间隔 500 ms；“已经初始化”视为复用成功。
2. 从 MMKV 读取 `player_state` 和 `current_track`，优先按持久化 track ID 在静态曲目表中找恢复索引，索引不可用时再回退到保存索引或 0。
3. 在同一串行命令中执行 `updateOptions`、把 RNTP RepeatMode 设为 Off，并丢弃上次异常中断遗留的 `pending_track_change`。
4. 查询 RNTP 当前 active track，再进入两条恢复路径。

### 4.3 原生队列仍存在：接管

若 RNTP active track 的 ID 能在 `TRACKS` 中找到，App 不 reset 队列：

- 原生 ID 与 MMKV `current_track` 一致：保留 `session_count` 与累计任务遍数，并保证任务记录存在；
- 原生 ID 与 MMKV 不一致：以实际原生曲目为准，当前曲的两类计数清零，并根据原生 position 是否在 0～1.5 s 判断当前周期资格；
- 最后把原生曲目和索引回写 `current_track` / `player_state`；
- 只有此路径中原生状态已经是 Playing、Buffering 或 Loading，才恢复 `expected_playing=true`。

这是“实际播放器优先”的冲突处理规则。MMKV 的 `current_track` 不是队列存在性的证明。

### 4.4 原生队列不存在：重建

若没有可识别 active track，App 调用 `replaceTrackInCommand(initialIdx, 'restore')`：

1. 创建 pending token 并递增 generation；
2. reset RNTP；
3. add 一首带 `starlightGeneration` 元数据的本地曲目；
4. 保存当前曲目；
5. restore 路径保留已完成遍数，seek 到 0 并重新获得当前周期资格；
6. 冷启动重建队列不自动播放，避免 RNTP 短暂 Loading 被误判成用户播放意图。

初始化至少展示 500 ms 启动画面。Android 13+ 通知权限请求失败不会阻止进入 App。

## 5. UI 与后台播放的双生命周期

### 5.1 UI 生命周期

React 页面存在时：

- RNTP hooks 提供实际曲目、状态与进度；
- 设置由 Zustand 触发即时重绘，同时已经写入 MMKV；
- 当前遍数由 `playback_task_progress.completedCount + cycle_eligible` 计算，随 500 ms 进度轮询刷新；
- 切换播放模式、active track 变化或 App 进入后台时保存 `player_state`；
- 窗口旋转、iPad 分屏和尺寸变化只重新计算布局，不触碰队列和计数。

### 5.2 PlaybackService 生命周期

UI 不在前台时，RNTP 仍可通过 PlaybackService 接收锁屏、通知栏、耳机、系统中断和队列结束事件。Android 配置为从最近任务划掉 UI 后继续播放；这不等于完整进程被系统杀死后还能无条件续播。

RNTP Android HeadlessJS 正常会复用应用 ReactContext，并非设计上固定有两个永久独立的 JS runtime。但工程必须按“UI 可销毁、context 可重建、事件可交错”来编写，原因包括：

- Android Activity 与 MusicService 生命周期不同；
- JS 模块变量、Promise 链和定时器会随 context/进程消失；
- RNTP 原生队列可能在 UI 重建时仍存在；
- 迟到的 ActiveTrackChanged/QueueEnded 可能与新命令交错；
- 额外 ReactContext 或桥接重入必须保持安全。

因此跨生命周期的业务状态放在 MMKV，实际播放状态向 RNTP 查询；JS 队列只负责当前 context，原生锁负责进程内互斥。

### 5.3 iOS Scene 与 AppState

iOS 使用 `UIScene`，`SceneDelegate.mm` 把 scene 的 active/inactive/background 回调转发为 React Native 监听的 UIApplication 通知，保证 `PlayerScreen` 的 AppState 保存逻辑能工作。`Info.plist` 声明后台 audio；后台音频的真正执行仍由 RNTP/AVFoundation 管理。

## 6. 主要数据与事件流

### 6.1 用户播放/暂停

```text
PlayerScreen 按钮
  → enqueuePlayerCommand
  → PlayerCommandLock.acquire
  → 必要时恢复/重建当前单曲队列
  → 同步模式重新计算位置，普通模式必要时回到 0
  → expected_playing=true → TrackPlayer.play → 验证进入 Playing/Buffering/Loading
  → release lock
```

暂停会先写 `expected_playing=false` 与 `playback_paused_at`，再调用 RNTP pause，因此 watchdog 不会把用户主动暂停当作故障恢复。远程 Play/Pause 走同一协议。

### 6.2 用户选曲或上下首

所有选曲最终进入 `replaceTrackInCommand`，RNTP 队列始终只装当前一首：

```text
beginPendingTrackChange（token + generation）
  → RNTP reset
  → token 仍有效？
  → RNTP add（曲目携带 generation）
  → token 仍有效？
  → 保存 current_track
  → 非 restore：session/task 清零并按普通或同步起点 seek
  → restore：保留完成数并从 0 建立新周期
  → 只由本操作清除自己的 pending token
```

用户手动重选当前曲目也属于新播放任务，计数清零。`PlaybackActiveTrackChanged` 会再次核对 generation、原生 active track、pending 原因和 MMKV 当前曲目，防止迟到事件覆盖新状态。

### 6.3 自然结束、计数与四种模式

`PlaybackQueueEnded` 处理顺序固定：

1. 以曲目 ID + generation 生成事件 key，同 key 5 秒内重复事件或并发事件被忽略；
2. 在命令锁内复核 MMKV generation、RNTP track ID、track metadata generation；
3. 同时检查事件 position 和实时 RNTP position 是否都在业务时长允许范围；
4. 只有 `cycle_eligible=true` 且结尾有效，才增加每日 stats、`session_count` 和累计任务遍数；
5. 计数完成后立即把 `cycle_eligible=false`；
6. 先判断是否达到 repeatCount，再根据 play-one/repeat-one/play-all/repeat-all 决定动作；
7. 动作最多尝试两次，但计数只执行一次。

若用户仍期望播放而动作失败，PlaybackService 启动 watchdog。完整决策表见 [PLAYBACK_ARCHITECTURE.md](PLAYBACK_ARCHITECTURE.md)。

### 6.4 同步模式

同步位置是：

```text
(设备本地当前时间 - 本地当天 00:00) % TRACKS 中的曲目 durationMs
```

打开同步、恢复播放、自然进入下一遍、可恢复的音频中断和 watchdog 恢复都会重新计算。所有 seek 必须经 `seekWithReasonInCommand`，由 seek 原因和前后距离统一维护计数资格。

同步/关怀模式会同时禁用 App 内进度条拖动，并从锁屏/通知栏 capabilities 中移除 Seek。若系统仍发送 RemoteSeek，同步模式不会接受外部位置，而是重新对齐。

### 6.5 系统音频中断与异常恢复

- 临时 duck/pause：记录原播放意图和暂停时间；中断解除时仅在原本期望播放的情况下恢复，同步模式会重对齐；
- permanent interruption：清除播放意图和计数资格，停止播放器；
- PlaybackError、Android PlayerError 或 PlaybackState 进入 Ended/Error/Stopped/None：若 `expected_playing=true`，按 1.5/3/6 秒最多三轮检查和恢复；
- 每轮取得命令锁后再次检查用户意图，用户后来按暂停/停止时必须取消恢复；
- 三轮失败后清除 `expected_playing`，停止无限重试。

### 6.6 设置与远程能力

“我的”页面修改关怀、同步或重复遍数时，`settingsStore` 同步写入 MMKV。`PlayerScreen` 监听关怀/同步状态并串行调用 `TrackPlayer.updateOptions`：

- 普通非同步：Play/Pause/Previous/Next/Seek/Stop；
- 普通同步：不公布 Seek；
- 关怀模式：只公布 Play/Pause，同时 App 内隐藏列表、遍数和诊断入口。

后台 Service 不依赖 UI 中的 Zustand 快照，处理事件时通过 `getSettings()` 读取持久化最新值。

## 7. 并发、一致性与幂等

系统使用三层防线，三者用途不同，不能删掉其中一层来“简化”：

1. **JS Promise 命令链**：保证同一 JS context 内 TrackPlayer 命令按提交顺序执行；失败不会阻断后续命令。
2. **原生 PlayerCommandLock**：Android/iOS 进程内共享 FIFO 锁，保护可能来自不同 context 的操作。租约 30 秒，持锁期间每 10 秒续约；context 消失后锁最终自动释放。
3. **MMKV pending token + generation**：保护 reset/add 这类多步操作的业务提交，识别迟到事件。锁只能防同时执行，不能证明事件仍属于当前曲目，因此 generation 仍然必要。

MMKV 多个 key 的写入不是一个跨 key 事务；调用顺序就是协议的一部分。例如替换曲目必须先建立 pending/generation，再 reset/add，确认 token 后才提交 `current_track` 和计数状态。修改顺序前应增加故障注入测试，而不是只跑正常路径。

`queueEndedInFlight`、5 秒去重 key、watchdog timer、`serviceInitialized` 和 `commandQueue` 都是 context 内的短期保护。它们丢失后，系统应依靠 generation、MMKV 状态和 RNTP 实际状态恢复正确性。

## 8. 原生边界

### 8.1 RNTP

- Android：ExoPlayer/MediaSession、前台 MusicService、音频焦点、通知栏；Manifest 由 RNTP library 合并 Service；
- iOS：AVFoundation/Now Playing、后台 audio；
- JS 只向 RNTP 放一首当前曲，且在 metadata 中附带项目 generation；
- 本地 URL：Android 使用 `file:///android_asset/audio/<filename>`，iOS 传 bundle 文件名；
- RNTP active track/progress/state 是实际播放事实，不能由 MMKV 推断代替。

### 8.2 PlayerCommandLock

- Android 模块由 `DiagnosticExporterPackage` 手工注册；共享 companion object 保存 owner 和等待队列；
- iOS 模块通过 `RCT_EXPORT_MODULE` 注册；串行 GCD queue 保存 owner 和等待队列；
- 两端均为进程内锁，不跨设备、不跨进程重启，也不持久化。

### 8.3 DiagnosticExporter

该模块只处理临时文件和系统分享 UI，不解析日志内容。Android 必须有当前 Activity；iOS 必须能取得 presenting controller。原生模块签名变化时必须同步更新 `diagnosticExporter.ts`、双端实现和测试 mock。

### 8.4 平台生命周期配置

- Android Manifest 声明 WAKE_LOCK、前台媒体播放和通知权限；`AppKilledPlaybackBehavior.ContinuePlayback` 允许划掉 UI 后继续播放；
- iOS `Info.plist` 声明 `UIBackgroundModes=audio`，SceneDelegate 转发 AppState；
- 这些能力必须在真机验证，Simulator/Emulator 不能证明锁屏、来电、蓝牙和厂商后台保活行为。

## 9. 权威边界速查

| 问题                           | 应读取的权威来源                                                    |
| ------------------------------ | ------------------------------------------------------------------- |
| 此刻真正播放哪一首？           | `TrackPlayer.getActiveTrack()` / `useActiveTrack()`                 |
| 此刻播到哪里、播放器什么状态？ | RNTP progress / playback state                                      |
| 队列丢失后应恢复哪一首？       | MMKV `current_track`，再回退 `player_state.trackIndex`              |
| 用户选择的四种模式是什么？     | MMKV `player_state.playMode`；PlayerScreen 本地 state 只是 UI 镜像  |
| 是否应该意外停止后自动恢复？   | MMKV `expected_playing`，并再次查询 RNTP 状态                       |
| 当前周期是否可计数？           | MMKV `cycle_eligible` + QueueEnded 双 position 校验                 |
| 是否已完成每首 N 遍？          | MMKV `session_count` 对比 `settings.repeatCount`                    |
| UI 跨重启应显示累计多少遍？    | MMKV `playback_task_progress`                                       |
| ActiveTrackChanged 是否过期？  | 事件采样的 MMKV generation + pending/current track + RNTP active ID |
| QueueEnded 是否过期？          | 上述业务代次 + RNTP track metadata generation（存在时）             |
| 同步周期长度和曲目顺序？       | `src/constants/tracks.ts`                                           |

原生队列与 MMKV 的更完整冲突规则见 [STORAGE_MODEL.md](STORAGE_MODEL.md#4-rntp-原生队列与-mmkv-的权威边界)。

## 10. 修改入口与验证要求

| 需求类型                | 首要修改位置                                              | 必须联动检查                                                 |
| ----------------------- | --------------------------------------------------------- | ------------------------------------------------------------ |
| 新增/调整曲目           | `constants/tracks.ts`、双端音频资产                       | duration、同步、QueueEnded、manifest/hash、双端文件一致性    |
| 调整播放模式或 N 遍规则 | `playbackDecision.ts`、`playbackService.ts`               | 两类计数、四模式、同步开关、停止后再播放                     |
| 新增 seek 场景          | `playbackCycle.ts` 的 reason 模型                         | 资格、暂停连续性、同步锁定、远程控制                         |
| 修改换曲/恢复           | `trackManager.ts`、`App.tsx`、Service reconcile           | pending/generation、队列存在/丢失、UI 被销毁后恢复           |
| 新增设置                | `settingsStore.ts` + `storage.ts`                         | 默认值、损坏回退、旧版本迁移、Service 直接读取               |
| 修改锁屏按钮            | `playerOptions.ts` + PlaybackService Remote 事件          | 普通/同步/关怀三种 capability、Android/iOS 真机              |
| 修改响应式 UI           | `playerLayout.ts`、`PlayerLayouts.tsx`、组件              | 边界比例、旋转/分屏不产生 TrackPlayer 命令                   |
| 修改诊断信息            | `logger.ts`、`ProfileScreen.tsx`、双端 DiagnosticExporter | 隐私、1000 条上限、无 Activity/controller 错误、iPad popover |

任何播放内核变更至少运行 TypeScript、ESLint、全部 Jest/覆盖率，并按 [TESTING.md](TESTING.md) 做相关设备场景；后台、锁屏、来电、蓝牙与多设备同步必须保留真机验收。
