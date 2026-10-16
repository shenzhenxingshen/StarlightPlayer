# 全盘代码走查结论

> 文档类型：历史审计快照。最后复核：2026-10-16，基于源码 commit `0698f62`。本文不替代当前源码、[活跃风险台账](KNOWN_ISSUES.md)或真机发布验收；后续修复不要直接删除这里的历史结论。

## 已修复的高风险问题

- `last_track_id` 被提前写入导致真换曲可能误判为恢复：已改为 `current_track + pending_track_change + track_generation` 协议。
- Service 依赖 JS 内存 `currentIndex`：已改为从持久化当前曲目推导索引。
- UI/Service 并发调用 TrackPlayer：已增加 JS Promise 队列，以及 Android/iOS 原生进程锁、租约与续约。
- 迟到的换曲或 QueueEnded 污染新曲：处理前校验 generation、原生 active track、持久曲目和实时位置。
- QueueEnded 缺少防护：已增加 5 秒去重、计数幂等、动作重试、异常捕获和 watchdog 恢复。
- seek 后错误计完整遍：已统一为 `cycleEligible + seekWithReasonInCommand`；只有从 0～1.5 秒附近开始且自然到尾才计数。
- 同步模式仍可被远程 seek 破坏：已移除 SeekTo capability，并对异常 RemoteSeek 重新按墙钟对齐。
- Android 后台行为依赖 RNTP 默认值：已显式设置划掉 UI 后继续播放和 30 秒前台宽限，并删除旧 Service 声明。
- 诊断复制易截断或假报成功：已改为双端原生 `.txt` 文件导出。
- 当前播放任务遍数丢失：每次有效完成后持久化，关闭重开续数；真换曲（上下首或列表自动换曲）、手动重选，或完成后的单曲播放重启才清零。
- 响应式重排风险：竖屏、方屏、横屏只改变展示，不参与播放器初始化、seek、队列或计数状态。

## 1.0 新增规则的复核

- 快捷遍数为 1、108、1,000、10,000；自定义值接受正安全整数，5,000,000 已覆盖测试。
- 当前遍数和总遍数按重复值、播放模式、关怀模式决定是否显示；大数字使用千分位。
- RNTP 始终使用单曲队列，RepeatMode 固定 Off；N 遍完成后才由 JS 执行四种播放模式。
- 同步模式每个自然结尾后重新按墙钟对齐；中间加入的尾段不计数。只有尚无已完成遍数的新任务显示第 0 遍，已有任务保留累计数。
- 关怀模式隐藏高风险操作并放大播放按钮，但不会删除已有曲目、模式、重复遍数或同步设置。
- iPhone/iPad 使用同一 Universal 包；布局由当前窗口比例决定，而非设备型号。

详细不变量见 [PLAYBACK_ARCHITECTURE.md](PLAYBACK_ARCHITECTURE.md)。

## 自动化证据

2026-10-16 实测：

- TypeScript `typecheck:app` 和完整 `typecheck` 通过。
- Jest 28/28 个 suites、298/298 个 tests 通过。
- 全局覆盖率：statements 98.61%、branches 91.92%、functions 98.77%、lines 98.97%。
- `playbackService.ts`：statements 99.62%、branches 90.36%、functions/lines 100%。
- ESLint 无 error，但有 31 个 warning。
- `format:check` 失败，涉及 7 个文件，详见 [LINTING.md](LINTING.md)。

覆盖率主要证明 JS/TS 可控分支，不覆盖操作系统杀进程、音频焦点、AVPlayer/MediaSession 时序或厂商省电策略。

## 当前仍需处理的工程风险

| 优先级 | 风险                                                                 | 影响/处置                                                                    |
| ------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| P0     | iOS 源码目标 13.4，但已上传 1.0.0 build 4 的 Archive 实际最低为 15.0 | build 4 不能支持 iOS 13/14；须构建更高 build、核验最终 Info.plist 并真机回归 |
| P0     | 音频来源和授权台账缺失                                               | 技术上能证明文件一致，不能证明拥有分发权；产品/法务须补齐                    |
| P1     | 双端各保存一套 21 首音频，且两个 asset manifest 已过时               | 容易漏同步；建立 canonical 源、重新生成校验清单                              |
| P1     | 没有 CI、Android instrumentation 或跨端 E2E                          | 建立 typecheck/lint/format/test/build 门禁并补关键原生流程                   |
| P1     | 版本散落在 package、Android、iOS 和诊断文本                          | 下一版本统一来源或自动读取，发布清单逐项校验                                 |
| P1     | 31 个 lint warning、7 个格式失败                                     | 分批清理后收紧 `--max-warnings` 和 CI 门槛                                   |
| P2     | Android `INTERNET` 和 iOS 宽松 ATS 对当前离线业务非必需              | 确认无隐含依赖后移除，减少权限和审计面                                       |
| P2     | `ios/.xcode.env` 硬编码 Homebrew Node 路径                           | 在 Intel Mac、其他 Node 安装方式上不可移植；改为可探测配置                   |
| P2     | 关怀模式依赖“不公布 SeekTo capability”阻止远程 seek                  | 异常 `RemoteSeek` 事件仅显式防守同步模式；可增加关怀模式二次校验             |
| P2     | 自定义遍数输入会静默删除非数字字符                                   | 粘贴 `-5` 会变成 `5`、`1.5` 会变成 `15`；应显示转换结果或改为明确校验报错    |

## 必须由真机证明的场景

1. 华为、小米、OPPO、vivo 等厂商后台策略下，锁屏、切后台、划掉 UI 后的持续播放。
2. iOS/Android 锁屏、控制中心和通知栏按钮在同步、普通、关怀模式下是否符合能力配置。
3. 来电、其他 App 抢音频焦点、有线/蓝牙断开后的暂停、恢复和计数资格。
4. 两台及以上设备跨平台同步，尤其 A05 连续 21 遍和周期边界听感。
5. iOS 13/14 的安装、后台音频与旋转；前提是候选 Archive 的最终最低系统确为 13.4。
6. 完整无障碍：VoiceOver/TalkBack、动态字体、减弱动态效果和键盘/D-pad。

逐项记录模板见 [DEVICE_TEST_MATRIX.md](DEVICE_TEST_MATRIX.md)。
