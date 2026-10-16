# MMKV 本地数据模型与恢复协议

> 适用于 1.0 源码，依据 2026-10-16 的 `src/utils/storage.ts`、`src/utils/logger.ts` 及全部调用方核对。本文是持久化 schema 的维护契约；新增、改名或删除 key 时必须同步更新本文和 `__tests__/utils/storage.spec.ts`。

## 1. 存储实现与约束

业务状态和诊断日志都使用 `new MMKV()` 的默认实例，没有自定义 instance ID，也没有传入应用层 encryption key。两个 JS 模块各自创建的包装对象最终访问同一个默认 MMKV 存储。数据位于 App 私有容器，跨 UI 销毁和正常 App 重启保留；清除 App 数据或卸载 App 后不应依赖其存在。

当前没有：

- schema version key；
- 集中迁移器或启动期批量迁移；
- 跨 key 事务；
- 统计/日志之外的批量清理 UI；
- 云同步、服务端备份或跨设备恢复；
- 对设置与播放状态的应用层加密。

兼容逻辑都位于各 getter 内，是“读取时回退”，通常不会把旧数据立即改写为新 schema。多个 key 的写入顺序属于播放协议，不能假设它们原子提交。

## 2. Key 总表

| MMKV key                 | 物理类型 | 逻辑内容                                     | 缺失/不可读默认值                       | 主要权威范围              |
| ------------------------ | -------- | -------------------------------------------- | --------------------------------------- | ------------------------- |
| `settings`               | string   | JSON：关怀、同步、重复遍数                   | `{false, true, 1}`                      | 用户设置                  |
| `player_state`           | string   | JSON：保存索引与四种播放模式                 | `null`；调用方再回退到索引 0/repeat-one | 队列丢失后的 UI 恢复      |
| `current_track`          | string   | JSON：当前逻辑曲目 ID 与索引                 | `null`，部分情况回退 `last_track_id`    | UI/Service 共享的曲目意图 |
| `last_track_id`          | string   | 旧版本当前曲目 ID                            | 不存在                                  | 只做兼容回退              |
| `pending_track_change`   | string   | JSON：多步换曲 token、目标、原因、generation | `null`                                  | 防过期换曲提交            |
| `track_generation`       | number   | 逻辑换曲代次                                 | `0`                                     | 识别迟到原生事件          |
| `session_count`          | number   | 当前曲本轮已完成的有效遍数                   | `0`                                     | 达到 N 后执行播放模式     |
| `playback_task_progress` | string   | JSON：当前播放任务累计完成遍数               | `null`                                  | UI 跨重启累计显示         |
| `cycle_eligible`         | boolean  | 当前周期是否具备结尾计数资格                 | 回退旧 key，最终 `false`                | 单周期计数资格            |
| `started_from_zero`      | boolean  | 旧版周期资格                                 | `false`                                 | 只读兼容                  |
| `expected_playing`       | boolean  | 用户/系统是否仍期望持续播放                  | `false`                                 | watchdog 是否可自动恢复   |
| `playback_paused_at`     | number   | 暂停/中断时间戳，毫秒                        | `null`                                  | 同步恢复的连续性判断      |
| `stats_<年>_<月>_<日>`   | string   | JSON：当天各 track ID 完成次数               | `{}`                                    | 每日有效完成统计          |
| `app_logs`               | string   | JSON：最多 1000 条日志字符串                 | `[]`                                    | 本地诊断                  |

日期 key 使用设备本地年月日且月/日不补零，例如 `stats_2026_10_6`。

## 3. 逐项字段契约

### 3.1 `settings`

- **值类型**：JSON string。
- **结构**：`{ isCareMode: boolean, isSyncMode: boolean, repeatCount: number }`。
- **默认值**：`{ isCareMode: false, isSyncMode: true, repeatCount: 1 }`。
- **读取方**：`settingsStore` 初始化；App 初始化播放器 capability；PlayerScreen/PlaybackService/trackManager/playbackCycle 在执行命令时直接读取。
- **写入方**：`settingsStore.toggleCareMode`、`toggleSyncMode`、`setRepeatCount`，统一经过 `setSettings()`。
- **生命周期**：用户设置，跨曲目、播放任务、后台和 App 重启长期保留。
- **清零/删除**：代码没有删除接口；只会被新的完整设置对象覆盖，清除 App 数据/卸载后回默认。
- **迁移**：若 `isCareMode` 不是 boolean，而旧字段 `isLargeTextMode` 是 boolean，则以旧字段作为关怀模式；不写回新字段。缺失 `isSyncMode` 默认 `true`。
- **损坏回退**：JSON 缺失/解析失败时整组回默认；字段类型错误时逐字段回默认。`repeatCount` 必须是 `>=1` 的 JavaScript 安全整数，字符串数字也会被 `Number()` 接受；其他值回退 1。setter 也会再次归一化。

维护注意：Zustand 是当前 JS context 的响应镜像，MMKV 才是后台事件能读取到的持久设置。新增字段时必须同时扩展 `getSettings` 默认值、`setSettings`、store 类型、旧数据回退和测试。

### 3.2 `player_state`

- **值类型**：JSON string。
- **结构**：`{ trackIndex: number, playMode: 'play-one' | 'repeat-one' | 'play-all' | 'repeat-all' }`。
- **默认值**：getter 返回 `null`；调用方在没有有效值时使用索引 0 和 `repeat-one`。
- **读取方**：App 选择冷启动恢复索引；PlayerScreen 初始化本地 `playMode`；PlaybackService 在 QueueEnded 决策；trackManager 做索引回退。
- **写入方**：App 接管原生曲目；PlayerScreen 切换模式、active track 变化和进入后台；`saveCurrentTrack()` 也会更新其中的 trackIndex，并保留已有模式或补 `repeat-one`。
- **生命周期**：跨曲目与 App 重启长期保留，是队列丢失时的恢复提示，不是实际 active track。
- **清零/删除**：无显式删除。真实换曲更新索引但保留模式。
- **迁移**：没有旧 key 迁移。
- **损坏回退**：缺失或 JSON 解析失败返回 `null`；有效 JSON 内，非整数/负数索引改为 0，未知模式改为 `repeat-one`。getter 不校验索引是否小于 `TRACKS.length`，真正装载时会 clamp。

### 3.3 `current_track`

- **值类型**：JSON string。
- **结构**：`{ id: string, index: number }`。
- **默认值**：通常为 `null`；若可读的旧 `last_track_id` 存在，则返回 `{ id: legacyId, index: -1 }`。
- **读取方**：App 启动接管/重建；PlayerScreen 当前任务；trackManager 的 current/next/previous；PlaybackService 的换曲、QueueEnded、远程控制和 watchdog。
- **写入方**：成功 add 后的 `replaceTrackInCommand`；App 接管现存原生队列；PlaybackService 对 ActiveTrackChanged/QueueEnded 的补偿协调；仅恢复/测试用的 `setCurrentIndex`。
- **写入副作用**：同时写 `last_track_id`，并调用 `savePlayerState` 更新 trackIndex、保留原 playMode。
- **生命周期**：记录最近一次逻辑曲目，跨后台和重启保留；不因停止或任务完成删除。
- **清零/删除**：无显式删除；新曲覆盖旧值。
- **迁移**：当前 key 缺失，或 JSON 可解析但字段无效时，尝试 `last_track_id`。索引为 `-1` 的 legacy 结果会由 track ID 重新映射。
- **损坏回退**：ID 必须为非空 string，index 只要求 integer、未在 getter 中做范围检查。特别注意：若 `current_track` 是无法解析的坏 JSON，函数直接 catch 并返回 `null`，不会继续尝试 legacy key；这是当前真实行为。

### 3.4 `last_track_id`（兼容 key）

- **值类型**：string。
- **结构**：非空 track ID；读取时不验证该 ID 是否仍在 `TRACKS`。
- **默认值**：不存在。
- **读取方**：仅 `loadCurrentTrack()` 在新 key 不可用的特定路径回退。
- **写入方**：每次 `saveCurrentTrack()` 同步写入，供已安装旧版本兼容。
- **生命周期**：长期保留。
- **清零/删除**：无。
- **迁移**：它本身就是迁移桥；读取后不会立即删除，也不会单独回填 `current_track`，后续正常保存才写新 key。
- **损坏回退**：MMKV 返回空/无 string 时忽略；未知 ID 由上层在 `TRACKS` 映射失败后回退其他索引。

### 3.5 `pending_track_change`

- **值类型**：JSON string。
- **结构**：`{ token: string, trackId: string, index: number, reason: 'restore' | 'user' | 'auto-next' | 'remote', generation: number }`。
- **默认值**：`null`。
- **读取方**：trackManager 在 reset/add 后用 token 判断操作是否仍有效；PlaybackService 在 ActiveTrackChanged 中区分预期换曲、恢复和意外换曲。
- **写入方**：`beginPendingTrackChange()` 在每次逻辑换曲开始前写入；token 为时间戳与随机数组合，同时先递增 generation。
- **生命周期**：仅覆盖一次 reset → add → seek 多步操作；不应成为长期状态。
- **清零/删除**：操作 `finally` 只在 token 仍属于自己时删除；新操作不会被旧操作误删。App 初始化时无条件 `discardPendingTrackChange()`，清理崩溃/中止遗留。
- **迁移**：无。
- **损坏回退**：JSON 解析失败、token/trackId 类型错误、index 非整数、reason 不在枚举、generation 非整数或负数都返回 `null`。当前不要求 trackId 非空，也不做 index/trackId 曲目表范围校验。

### 3.6 `track_generation`

- **值类型**：number。
- **默认值**：`0`。
- **读取方**：PlayerScreen 丢弃跨换曲的迟到 UI seek；PlaybackService 校验 ActiveTrackChanged/QueueEnded；pending 记录。
- **写入方**：`beginPendingTrackChange()` 通过 `bumpTrackGeneration()` 递增；该 generation 也写入 RNTP track metadata 的 `starlightGeneration`。
- **生命周期**：每次逻辑 replace 单调递增，跨 App 重启保留；不是播放次数。
- **清零/删除**：无正常清零。
- **迁移**：无。
- **损坏回退**：缺失、读取异常、非整数或负数回退 0。没有显式最大安全整数饱和处理；正常产品寿命内不应接近上限。

### 3.7 `session_count`

- **值类型**：number。
- **结构**：非负 JavaScript 安全整数。
- **默认值**：`0`。
- **读取方**：QueueEnded 后与 repeatCount 比较；UI/Service 日志；任务迁移；`resetCycleIfCompleted()`。
- **写入方**：每个有效 QueueEnded 加 1；到达 N 的单曲循环重播前归 0；真实换曲、用户重选和意外真换曲归 0；单曲播放完成后用户再次按播放时归 0。
- **生命周期**：只表示“当前曲当前一轮距离 N 还完成多少”，跨关闭/重开保留；单曲循环到达 N 后会清零，因此不能用于 UI 长期累计显示。
- **清零/删除**：用数值 0 覆盖，不删除 key。play-one/play-all 到达终点停止时暂时保留 N，下一次用户播放由 `resetCycleIfCompleted()` 清零。
- **迁移**：首次建立 `playback_task_progress` 时可作为累计任务的 legacy 初始值。
- **损坏回退**：save/load 都把负数、非整数、非安全整数和异常归 0。

### 3.8 `playback_task_progress`

- **值类型**：JSON string。
- **结构**：`{ trackId: string, completedCount: number }`，completedCount 为非负安全整数。
- **默认值**：`null`；指定曲目的 `loadTaskCompletedCount()` 最终返回 0。
- **读取方**：PlayerScreen 计算跨重启当前遍数；storage helper 在计数或恢复任务时读取。
- **写入方**：有效 QueueEnded 通过 `incrementTaskCompletedCount()` 加 1；新播放任务通过 `resetPlaybackTask(trackId)` 写 0；恢复时 `ensurePlaybackTask()` 补记录。
- **生命周期**：只保留一个“当前播放任务”，跨 App 重启保留。与 `session_count` 不同，repeat-one 每达到 N 后不会清零累计值，所以 UI 可继续显示 N+1、N+2。
- **清零/删除**：真实换曲、用户手动重选当前曲，或已完成的单曲播放由用户再次播放时，写入目标 track ID + 0；从不直接删除。
- **迁移**：当 getter 返回 `null`（key 缺失、坏 JSON 或无有效 trackId）时，第一次 `ensurePlaybackTask(trackId)` 用现有 `session_count` 初始化；若已存在另一个 track 的有效任务，则切到新 track 从 0 开始，防止串曲。
- **损坏回退**：坏 JSON、缺失/空 trackId 返回 `null`；非法 completedCount 归 0。递增在 `Number.MAX_SAFE_INTEGER` 处饱和。

### 3.9 `cycle_eligible`

- **值类型**：boolean。
- **默认值**：若自身缺失则读取 legacy `started_from_zero`，两者都无效时 `false`。
- **读取方**：QueueEnded 判断本周期能否计数；PlayerScreen 在已完成数上决定是否显示“正在进行的下一遍”；同步恢复算法。
- **写入方**：所有业务 seek 经 `seekWithReasonInCommand()` 根据起点、原因、暂停时长和循环距离统一写入；QueueEnded 完成处理后置 false；远程停止/永久中断置 false；App 接管与 MMKV 不一致的原生曲目时按实时位置重算。
- **生命周期**：表示当前单个周期的资格，跨 UI 销毁和 App 重启保留；不是“是否播放中”，也不是“是否开启同步”。
- **清零/删除**：使用 false 覆盖；没有 delete。真换曲后的同步位置若不在 0～1.5 s，资格会为 false；普通从 0 开始则为 true。
- **迁移**：仅在新 key 不存在时读取 `started_from_zero`；不会自动复制或删除旧 key。新代码的 `saveStartedFromZero/loadStartedFromZero` 只是新函数的别名。
- **损坏回退**：`getBoolean` 返回 null/undefined 时再尝试旧 key/false；若读取直接抛出异常则立即返回 false。

### 3.10 `started_from_zero`（兼容 key）

- **值类型**：boolean。
- **默认值**：`false`。
- **读取方**：仅 `loadCycleEligible()` 在新 key 缺失时读取。
- **写入方**：当前代码不再写这个物理 key；兼容导出的 save 函数实际写 `cycle_eligible`。
- **生命周期**：旧安装遗留数据。
- **清零/删除**：无；可长期残留，但一旦新 key 存在就不再影响行为。
- **迁移**：懒读取兼容，无迁移版本标记。
- **损坏回退**：无有效 boolean 时 false。

### 3.11 `expected_playing`

- **值类型**：boolean。
- **默认值**：`false`。
- **读取方**：PlaybackService 的错误、状态监听和 watchdog；中断恢复；App 启动恢复判断。
- **写入方**：每次实际 play 尝试前置 true；用户 UI/Remote pause、stop、UI 发起的播放/选曲失败、终止型播放动作、永久中断、watchdog 耗尽时置 false；后台事件动作失败通常保留 true 以允许 watchdog 恢复。App 启动接管原生队列时根据 active track + 原生 state 重新计算。
- **生命周期**：跨 UI 销毁保留，表达“播放器异常停下时是否应该恢复”的用户意图。
- **清零/删除**：使用 false 覆盖，不删除。
- **迁移**：无。
- **损坏回退**：缺失、类型无效或读取异常时保守返回 false，避免未经用户同意自动播放。

注意：它不是 RNTP 当前状态。任何恢复动作仍会读取 `getPlaybackState()` 和 active track；用户暂停时必须先写 false 再调用原生 pause。

### 3.12 `playback_paused_at`

- **值类型**：number，Unix epoch 毫秒。
- **默认值**：`null`。
- **读取方**：仅 `seekWithReasonInCommand(..., 'sync-resume')` 计算暂停秒数和连续性。
- **写入方**：UI/Remote 主动暂停，以及仍有播放意图的临时系统中断；默认写 `Date.now()`。
- **生命周期**：短期恢复上下文，允许跨 UI 销毁；不代表当前一定暂停。
- **清零/删除**：成功执行 sync-resume seek 后删除；成功开始播放会删除；RemoteStop 和永久中断也删除。
- **迁移**：无。
- **损坏回退**：只接受有限、非负 number，否则返回 null；保存非法值时不会覆盖现有 key。系统时钟回拨导致 elapsed 为负时，playbackCycle 会按不连续处理。

### 3.13 `stats_<年>_<月>_<日>`

- **值类型**：每个日期一个 JSON string。
- **结构**：`Record<trackId, nonNegativeInteger>`。
- **默认值**：`{}`。
- **读取方**：`statsStore` 初始化/refresh；每次递增前读取当天 bucket。
- **写入方**：只有有效完整周期在 `completeCycle()` 中通过 statsStore 递增；一次只计算一个本地日期 key，避免跨午夜时从旧日读、向新日写。
- **生命周期**：按“完成时设备本地日期”永久分桶。跨零点的一遍归自然结束所在日。
- **清零/删除**：没有清理、保留期或 UI；历史日期 key 会持续累积，当前 API 也只读取今天。
- **迁移**：无。
- **损坏回退**：坏 JSON、null、数组或非对象返回 `{}`；仅保留非空 key 且值为非负整数的项。当前不验证 track ID 是否存在于 `TRACKS`，递增也没有安全整数饱和处理。

### 3.14 `app_logs`

- **值类型**：JSON string。
- **结构**：string 数组，每项格式近似 `[ISO timestamp] LEVEL: message`。
- **默认值**：`[]`。
- **读取方**：logger 每次追加前；“我的 → 诊断信息”预览和导出。
- **写入方**：`addLog()`；全局 ErrorUtils handler、重写后的 `console.error/warn` 以及各播放模块均会调用。
- **生命周期**：跨 UI 销毁与 App 重启保留；最多最近 1000 条，超出从最旧处删除。单次格式化后的 message 截到 2000 字符。
- **清零/删除**：`clearLogs()` 会 delete，但当前没有页面按钮调用；清除 App 数据/卸载也会移除。
- **迁移**：无。
- **损坏回退**：JSON 解析失败或非数组返回 `[]`；数组中只保留 string，其他项过滤。

日志可能包含设备信息、曲目 ID、播放器状态和时间戳，但导出前不会写回 `app_logs`。诊断文件本身存放在临时/cache 目录，不是 MMKV key。

## 4. RNTP 原生队列与 MMKV 的权威边界

### 4.1 各自负责什么

| 事实/意图                                    | 权威来源                                                                    |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| 实际 active track、position、duration、state | RNTP 原生播放器                                                             |
| 队列丢失后希望恢复的曲目                     | `current_track`，再回退 `player_state.trackIndex`                           |
| 用户选择的 playMode、repeatCount、同步/关怀  | MMKV                                                                        |
| 业务计数、当前周期资格、恢复播放意图         | MMKV                                                                        |
| ActiveTrackChanged 属于哪一代                | 事件采样的 MMKV `track_generation`、pending/current track 与 RNTP active ID |
| QueueEnded 属于哪一代                        | MMKV generation、active ID，以及存在时的 RNTP metadata generation           |
| 曲目顺序和业务标准时长                       | `src/constants/tracks.ts`                                                   |

`current_track` 只是逻辑协调状态。它既不保证 RNTP 中已有队列，也不证明播放器正在播放。反过来，RNTP 原生 active track 也不包含完整的 N 遍任务、playMode 或同步资格，所以不能只恢复原生队列而忽略 MMKV。

### 4.2 启动冲突规则

App 启动后必须先查询 RNTP：

1. **有可识别的原生 active track**：不 reset；原生曲目是实际事实。若它与 MMKV 相同，保留计数；若不同，以原生曲目回写 MMKV，并清零目标曲的 session/task、按原生位置重算资格。
2. **没有可识别 active track**：以 MMKV `current_track.id` 选择恢复曲，找不到再用 `player_state.trackIndex`/0；重建单曲队列。
3. **冷启动重建**：保留同一播放任务已完成遍数，但新队列从 0 开始；不因 Loading 自动恢复播放。
4. **接管仍在播放的队列**：只有 active track 存在且 state 为 Playing/Buffering/Loading，才把 `expected_playing` 恢复为 true。

### 4.3 运行期一致性协议

- 所有影响队列或播放状态的 TrackPlayer 写命令必须经过 `enqueuePlayerCommand`；hooks、监听器注册和只读查询可以直接调用；
- 多步换曲开始前写 pending + generation，并把 generation 放入 RNTP track metadata；
- reset/add 后都检查 token，过期操作不能提交 `current_track`；
- ActiveTrackChanged 比较事件采样的 MMKV generation、pending/current track 和原生 active ID；QueueEnded 还会在 metadata generation 存在时附加比较；
- QueueEnded 还必须比较事件 position 与实时 progress，避免迟到事件给新周期计数；
- App 初始化会丢弃遗留 pending，但不会随意清掉 generation 或计数。

原生锁提供“同一时刻只有一个命令”，pending/generation 提供“这个命令/事件仍属于当前业务代次”。两者不能互相替代。

### 4.4 当前非事务一致性窗口

MMKV 的单次 `set` 是一个 key 的写入，但本项目没有把一项业务动作封装成跨 key 事务。当前源码中的实际顺序包括：

- 有效周期完成：先写每日 stats，再递增 `playback_task_progress`，再递增 `session_count`，最后把 `cycle_eligible` 置 false；
- 保存当前曲目：先写 `current_track`，再写兼容用 `last_track_id`，最后更新 `player_state`；
- 开始换曲：先递增 `track_generation`，再写 `pending_track_change`，然后执行 RNTP reset/add，最后提交当前曲目、计数和 seek 资格；
- 新播放任务：`current_track`、`session_count=0`、`playback_task_progress=0` 与新 seek 分多步完成。
- 日志追加是 `get app_logs → push/裁剪 → set app_logs` 的读改写序列，不经过播放器命令锁；若将来真的同时运行多个写日志的 JS context，彼此覆盖最后一次追加是需要处理的风险。

原生锁和 generation 能处理并发及迟到事件，但不能让这些写入在进程突然终止时一起成功或一起回滚。例如进程若恰好终止在有效周期的多步写入中，stats、累计任务和 session 理论上可能短暂不一致；当前没有 journal 或启动期 reconciliation 修复它。涉及这几条路径的重构应增加“每个 await/写入点后终止”的故障注入设计，并在引入恢复协议前保留现有写入顺序。

## 5. 数据生命周期与重置矩阵

| 场景                         | settings/mode  | current track | session | task progress | eligible   | expected    | pausedAt     | stats/logs |
| ---------------------------- | -------------- | ------------- | ------- | ------------- | ---------- | ----------- | ------------ | ---------- |
| UI 旋转/分屏                 | 保留           | 保留          | 保留    | 保留          | 保留       | 保留        | 保留         | 保留       |
| App 进入后台                 | 保留并保存模式 | 保留          | 保留    | 保留          | 保留       | 保留        | 视暂停而定   | 保留       |
| 关闭后重开且恢复同一任务     | 保留           | 保留/重建     | 保留    | 保留          | 按接管路径 | 重算        | 视恢复清除   | 保留       |
| 用户选择另一首或重选当前首   | 保留           | 覆盖          | 0       | 目标曲 0      | 按新起点   | true 后播放 | 播放成功清除 | 保留       |
| 自动/远程下一首              | 保留           | 覆盖          | 0       | 目标曲 0      | 按新起点   | true        | 播放成功清除 | 保留       |
| repeat-one 达到 N            | 保留           | 保留          | 0       | 继续累计      | 按下一起点 | true        | 不变/清除    | 有效周期+1 |
| play-one/play-all 到终点停止 | 保留           | 保留          | 暂留 N  | 暂留累计      | false      | false       | 不变         | 有效周期+1 |
| 上述停止后用户再次播放       | 保留           | 保留          | 0       | 当前曲 0      | 按新起点   | true        | 播放成功清除 | 保留       |
| RemoteStop / 永久音频中断    | 保留           | 保留          | 保留    | 保留          | false      | false       | 删除         | 保留       |
| 清除 App 数据/卸载           | 默认           | 无            | 0       | 无            | false      | false       | 无           | 无         |

“expected=true 后播放”是命令协议，不代表写入后必然已经有声音；play 失败的调用方必须把它恢复为 false 或由 watchdog 最终处理。

## 6. Schema 变更规则

新增或修改 MMKV 字段时，至少执行以下步骤：

1. 在 `storage.ts` 集中定义 key、类型、默认值、validator 和 getter/setter；业务模块不得直接散写 MMKV。
2. 明确旧安装的四种输入：key 缺失、旧结构、坏 JSON、字段类型错误；对每种写单元测试。
3. 明确新旧 App 是否会交替运行；需要降级兼容时，不要立即删除旧 key。
4. 决定迁移是懒读取还是一次性写回；一次性迁移应引入明确 schema version，避免每次启动重复执行。
5. 若一次操作修改多个 key，记录写入顺序、崩溃中点和恢复动作；必要时增加 transaction-like journal，而不是假设多次 `set` 原子。
6. 检查 UI runtime 与 PlaybackService 都能看到最新值；不要把仅存在 Zustand/React state 的值用于后台业务判断。
7. 更新本文件、[ARCHITECTURE.md](ARCHITECTURE.md)、[PLAYBACK_ARCHITECTURE.md](PLAYBACK_ARCHITECTURE.md) 中相关权威边界，并运行 storage、App 恢复、trackManager 和 PlaybackService 测试。

禁止直接复用现有 key 保存新语义。例如 `session_count` 与 `playback_task_progress` 看似都是遍数，但前者会按 N 清零，后者为任务累计；合并会破坏单曲循环展示和四模式决策。
