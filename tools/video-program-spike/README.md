# 固定时间视频流程：隔离原型

状态：实验工具，**没有接入手机版或电脑版生产入口**。本阶段验证 49 遍素材；
不是可发布功能，也没有替换原有音频计数、四种模式或午夜同步规则。

接续的本机 macOS/libmpv 验证见 [电脑版独立原型](../desktop-video-spike/README.md)；
两者共用时间轴与素材，但原生适配和实测报告相互独立。

实测结果、缺口及制品身份见
[2026-11-17 执行记录](../../docs/test-runs/2026-11-17-video-program-spike.md)。
后续数字清理和素材处理版本另见
[素材整理](../video-materials/README.md)及[修订版测试记录](../../docs/test-runs/2026-11-17-video-materials.md)；
两轮素材 revision 不同，不能混用验证结论。

## 验证的设计

```text
发生实例：固定的 startEpochMs + programId + 素材 revision
                           │
                    now - startEpochMs
                           │
                  packages/program-core
          片头 → 正文 × 48 → 特殊末遍 → 片尾
                           │
              iOS AVMutableComposition / AVPlayer
         初次加入、主动恢复时 seek；内部边界连续播放
```

- 整套流程有唯一的起点，不对每段重新做“本地午夜取模”。
- 使用 44,100 ticks/秒的整数边界，区间为 `[start, end)`。
- 到结束点为结束，不取模返回片头。
- “流程第几遍”是位置，不代表本机实际完整听过几遍。
- 主动暂停/停止后不被定时 tick 拉起；主动恢复按当前墙钟追赶。
- 已知未来起点提前准备，目标为 0。中途加入时，seek/preroll 后预约未来 host clock
  启播，默认准备窗口 350 ms。这个窗口不是每遍损耗，也不是实测硬件出声延迟。
- 每个异步操作带 generation；新的暂停、停止、加入会使旧回调失效。
- Swift 当前复用 `compileProgram` / `locateWallClock`，原生意图和 generation 仍由适配器
  管理；`decide` 只有纯函数测试，尚不是手机、桌面共用的完整生产状态机。
- 单个原生组合媒体项目处理片段衔接；不在每遍结束时等待 RNTP `QueueEnded` 再加载。
- 不导出整条长视频；组合轨引用四个小文件。为了 A/B 对照，**原型包额外包含原长视频**。

## 文件职责

| 文件                                       | 职责                                                                        |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| `../../packages/program-core/src/index.ts` | 纯 TS 时间轴编译、定位、意图决策，不依赖 UI/播放器                          |
| `core.test.cjs`                            | 时间轴边界、非法输入、迟到和恢复测试                                        |
| `Probe.swift`                              | 独立 UIKit App；JavaScriptCore 执行相同 TS 编译结果；原生播放适配及测试场景 |
| `AudioTap.c/.h`                            | 预分配音频诊断环形缓冲，不修改音频；实时回调不写文件或执行 Swift            |
| `build.mjs`                                | 哈希检查、编译、模拟器签名，以及独立 iOS 13.4 真机目标编译检查              |
| `run.mjs`                                  | 安装独立 App、运行场景、取回证据、调用断言分析                              |
| `analyze.mjs` / `analyze.test.mjs`         | 独立证据断言；故意缺帧/丢音频缓冲等负例验证                                 |

## 前置条件

在仓库根目录执行，需要已有 Xcode、Node、仓库 TypeScript 依赖、`ffprobe`。
脚本不会安装依赖或自动下载系统运行时。

输入默认来自 `release/video/49-2025V1/`：

- `manifest.json`：此前拆片输出，包含 `source.path/source.sha256`、
  `clips[].file/sha256`、`program.sequence[].file/repeat`；
- 四个 MP4 文件；
- manifest 指定的原长视频，供对照。

这些大文件和 manifest **不在 Git**，fresh clone 需要向维护者取得同一套拆片资产。
输入哈希见执行记录；路径变化可更新外部 manifest 的 `source.path`，不可伪造哈希。
素材缺失或哈希不匹配时构建失败，不会自动寻找其他视频替代。

## 构建与测试

```sh
node tools/video-program-spike/build.mjs
# 可选：传入包含 manifest.json 和四段素材的其他目录
node tools/video-program-spike/build.mjs /absolute/path/to/49-2025V1

node --test tools/video-program-spike/core.test.cjs
node --test tools/video-program-spike/analyze.test.mjs
node --test --experimental-test-coverage \
  --test-coverage-include='**/core/index.js' tools/video-program-spike/core.test.cjs
```

`core.test.cjs` 使用构建生成的 JS，修改 TS 后应先重新构建，不能对旧编译结果报通过。
build 会输出独立 `.app`、iOS 真机目标未签名可执行文件和 `build-evidence.json`。
后者记录 Git 基线、未提交源码哈希、素材 revision、二进制哈希和实际 Mach-O 最低版本。

模拟器：

```sh
xcrun simctl list devices available
# 自行选择已有且已启动的 iOS Simulator，用其 UDID 替换 <DEVICE>。
node tools/video-program-spike/run.mjs --device <DEVICE> --suite boundaries --mode composition
node tools/video-program-spike/run.mjs --device <DEVICE> --suite quick --mode original
node tools/video-program-spike/run.mjs --device <DEVICE> --suite quick --mode composition --tap off
node tools/video-program-spike/run.mjs --device <DEVICE> --suite continuity --mode composition
```

| suite        | 行为                                                    | 时长约      |
| ------------ | ------------------------------------------------------- | ----------- |
| `quick`      | 四类边界 + 迟到/暂停/恢复/取消/未来起点/自然结束/已结束 | 42 秒       |
| `boundaries` | 全部 50 个内部边界各自真实播放 4.8 秒，再测五组控制场景 | 4.5 分钟    |
| `continuity` | 从片头连续播放前三遍正文，并跨入第四遍；没有中途 seek   | 4.5 分钟    |
| `full`       | 从未来起点连续播放完整 49 遍流程，不加速                | 62 分钟以上 |

逐边界测试是“seek 到边界前两秒，真实播放越过边界”，**不是连续播完 49 遍**。
`continuity`、`full` 的断言边界定位当前仅针对组合模式，勿用原视频模式替代。
同一个设备不要并行启动多轮（后启动会终止前一轮原型）。
测试只安装/重启 `org.starlight.video-program-spike`，不清除正式 App 数据。

每轮证据在 `release/video-program-spike/runs/<run-id>/`：

- `run-context.json`：构建身份、设备、参数；
- `events.jsonl`：seek、preroll、预约启播、状态、墙钟、视频 PTS、音频时间戳；
- `complete.json`：测试驱动完成，不代表所有断言通过；
- `analysis.json`：独立判定结果；失败会令 runner 非零退出；
- `completed.png`：结束截图，只作为辅助证据。

重新分析：

```sh
node tools/video-program-spike/analyze.mjs release/video-program-spike/runs/<run-id>
```

手工预览（先构建并安装）：

```sh
xcrun simctl launch --terminate-running-process <DEVICE> org.starlight.video-program-spike \
  --suite manual --mode composition
```

等待媒体就绪后操作；“从流程开头”用一秒后的模拟起点准备媒体，不是真实每日调度。
手工 UI 尚未做加载期间快速连点的完整防护，不能据此作为正式交互验收。

## 证据边界

1. AVPlayerItemVideoOutput 测的是输出帧可用性；音频 tap 测的是硬件输出前的解码数据，
   不是扬声器实录，也不是多设备同步精度。
2. preroll/停止后的无效音频时间范围单独统计并排除，不当作有效音频连续性证据。
   音频缓冲可能延迟采集，分析同时约束源 host time 和媒体 PTS。
3. 断言阈值写在 `analyze.mjs`：稳定媒体时钟偏差 50 ms、25 fps 视频 PTS 间隔
   不超过 40.1 ms、模拟器帧回调间隔不超过 120 ms、音频时间戳缝隙不超过一个采样点
   加 0.005 ms 数值余量。这些是原型预算，不是外部承诺。
4. iOS 13.4 真机目标编译成功只证明本原型的 API/链接最低版本；Apple Silicon
   Simulator 实际最低为 14.0。没有 13/14 实机测试时不宣称已兼容验证。
5. 默认原拆片仍有固定遍数字样。可显式构建数字清理修订版，但它仍待人工视觉与听感
   审阅，不能直接当最终发行素材；原型显示独立的流程遍次。
6. 墙钟依赖设备时间。尚未实现网络校时、持续漂移修正、系统时间大幅变更的生产策略。
7. 没有实现锁定任务编辑规则、真实 05:30/20:00 调度、冲突仲裁、RNTP 音频焦点交接、
   进程重建、来电/蓝牙/后台恢复、横屏/iPad 正式布局或 Android/桌面视频适配。
8. iOS 在挂起/被结束状态下的自动定时启动不能由本前台原型证明。

## 接入正式 App 前

- 冻结每套流程的素材 revision、采样时长和完整流程结束时间；98 遍需独立素材审查。
- 原有音频与新视频共用播放所有权仲裁；视频期间禁止音频 watchdog 抢回播放。
- 处理 05:30 视频预计 06:32:17 结束与既有 06:30 音频任务冲突。
- 加入真实多设备录音、旧 iOS 真机、整套长播和生命周期验收。
- 原视频与四段组合不是完全相同的媒体时间轴；当前组合短 760 ms，不能按相同
  `elapsed` 混播两套版本，必须由同一 revision 定义公共时间轴。
