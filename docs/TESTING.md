# 测试手册

## 自动化测试

```bash
npm test
npm run test:watch
npm run test:coverage
```

| 文件                                       | 覆盖内容                                                      |
| ------------------------------------------ | ------------------------------------------------------------- |
| `utils/syncUtils.spec.ts`                  | 本地当日对齐算法                                              |
| `utils/storage.spec.ts`                    | MMKV 设置、当前曲、换曲 token、计数资格、累计任务恢复         |
| `utils/trackManager.spec.ts`               | 上下首回绕、手动重选清零和队列恢复保留计数                    |
| `utils/playbackRecovery.spec.ts`           | Ended/Stopped/空队列恢复                                      |
| `utils/playbackCycle.spec.ts`              | 同步暂停时长、seek 与当前遍资格                               |
| `utils/playbackDecision.spec.ts`           | N 遍优先于四模式、QueueEnded 位置校验                         |
| `utils/playerCommandQueue.spec.ts`         | 命令严格串行和失败后队列续行                                  |
| `utils/playerOptions.spec.ts`              | 同步/关怀远程能力与 Android 后台策略                          |
| `utils/repeatDisplay.spec.ts`              | 四种模式、重复遍数和关怀模式的遍数显示矩阵                    |
| `services/playbackService.spec.ts`         | 四模式、N 遍、远程控制、去重、generation、动作重试和 watchdog |
| `services/playbackService.android.spec.ts` | Android 专有 PlayerError、播放状态和恢复分支                  |
| `components/ProgressBar.spec.tsx`          | 时间/遍数显示、拖动只在松手时提交一次                         |
| `App*.spec.tsx`                            | iOS/Android 初始化、队列接管、失败重试和生命周期恢复          |
| `screens/*.spec.tsx`                       | 三个主页面交互、遍数显示规则和异常路径                        |

Jest 中的 TrackPlayer、MMKV、`PlayerCommandLock` 和诊断导出都是内存 mock。这些测试能验证业务决策，不能证明原生后台服务在特定手机上不会被杀。

## 当前自动化基线

Jest/RNTL 依赖与 `package-lock.json` 已同步。当前 26 个测试套件、242 个测试可运行并全部通过。

`npm run test:coverage -- --runInBand` 已通过配置阈值。2026-10-14 基线：全局 statements 98.51%、branches 89.21%、functions 98.68%、lines 98.88%；`playbackService.ts` statements 99.62%、branches 90.36%、functions/lines 100%。未覆盖部分主要是原生模块、平台硬件交互和少量异常防御分支；高覆盖率仍不能替代真机后台播放验证。

## 必做真机回归

1. 四种模式分别验证 repeatCount=1 和 108，并验证自定义 5000000 可保存和完整显示。
2. 列表模式至少连续听完两首，确认第二首不会只播一遍。
3. 同步开启后验证 App 和锁屏都无法改到任意进度。
4. 暂停少于/大于 1.5 秒后恢复，检查 `cycleEligible` 的计数差异。
5. Android 播放时锁屏、切后台、从最近任务划掉 UI，确认声音和通知继续。
6. 来电/蓝牙断开/其他 App 抢音频焦点后恢复。
7. 在“我的”导出诊断 `.txt`，确认文件未被截断。
8. 完成若干遍后主动关闭/意外退出并重开，确认累计遍数延续；手动重选当前曲和单曲播放结束后再次播放则从第 1 遍开始。

完整矩阵见 [PLAYBACK_ARCHITECTURE.md](PLAYBACK_ARCHITECTURE.md#10-必测矩阵)。
