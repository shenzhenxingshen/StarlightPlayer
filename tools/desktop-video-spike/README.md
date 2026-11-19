# 电脑版固定时间视频流程：隔离原型

这是**本机 macOS 视频原型**，不是正式电脑版的新版本，也不是可发给其他电脑的安装包。
只验证 49 遍流程；未接入 `apps/desktop`、手机版、定时任务、原音频数据或播放计数。
Android、Windows、Linux 视频适配尚未实现。

实测结论与限制见 [执行记录](../../docs/test-runs/2026-11-17-desktop-video-program-spike.md)。
同一流程的 iOS 对照见 [iOS 原型](../video-program-spike/README.md)。

## 1. 如何试用

构建后打开 `release/desktop-video-spike/StarlightVideoPrototype.app`。

| 按钮 | 行为 |
| --- | --- |
| 从流程开头 | 创建一秒后的模拟起点，提前准备，从片头 0 秒开始 |
| 模拟迟到10分钟 | 将流程起点设为十分钟前，定位到流程当前进度 |
| 暂停 | 停住播放，流程公共时间仍继续走 |
| 追上当前进度 | 根据同一流程起点重新定位，而非接着暂停位置播放 |
| 停止 | 停住且不自动恢复；保留发生实例，随后可明确选择追赶或新开流程 |

画面外的“流程第几遍”表示节目位置，不表示这台设备完整播放的次数。
默认原拆片仍含烧录数字；传入修订素材目录可预览数字清理版，见
[素材整理说明](../video-materials/README.md)。当前没有真实 05:30/20:00 任务入口。
手工预览初始音量为播放器内部的 30%，不会改系统音量。
关闭这个独立窗口即可退出，不影响正式版存储数据。

## 2. 架构及同步规则

```text
startEpochMs + 当前墙钟 + 素材 revision
                    ↓
packages/program-core：整数 ticks 时间轴
                    ↓
Swift / JavaScriptCore：执行同一 TS 编译产物
                    ↓
libmpv EDL：一条虚拟媒体时间轴（不是 51 首的播放器队列）
   片头 → 正文 ×48 → 特殊末遍 → 片尾
                    ↓
libmpv 软件渲染线程 → AppKit 独立窗口
```

- 复用 iOS 的四份素材、revision 和 `compileProgram` / `locateWallClock`。
- 51 个跨度、50 个内部边界；总长 `164818149/44100` 秒，约 62 分 17.373 秒。
- EDL 显式指定每段时长，不生成整条新视频；原拆片约 50.5 MB，v2 修订版约 62.8 MB。
- 首次加入/主动恢复时定位；内部边界由原生虚拟时间轴连续处理，不逐遍 seek。
- 已知未来起点目标为 0；中途加入通常预留 500 ms 准备窗口，定位到未来启播时刻。
  接近末尾时缩短窗口，避免仅因为准备预算较长便直接跳过剩余尾段。
- 等待 seek 回应、`playback-restart`、就绪位置后，在单调时钟截止时间发送解除暂停命令。
  **这不是 AVPlayer 的原生 host-clock 预约输出**；10 ms 主线程 timer、命令处理及输出缓冲
  均可能产生误差，必须以各平台实测为准。
- 过期准备最多重新定位三次。暂停、停止、新加入通过 generation 使旧回调失效。
- 整套结束后不取模重开；暂停/停止不会被后台 tick 自动拉起。
- TS `decide` 尚未作为所有原生适配器的共同生产状态机；原生意图仍在 Swift 中。

软件渲染仅供原型：固定 864×486 RGB0 缓冲，独立线程调用 libmpv render API，
主线程接收最新帧；不使用生产级 GPU 集成，不代表最终性能或视频画质。

## 3. 构建、复现和文件职责

前置条件：已有 macOS、Xcode、Node、仓库 TypeScript 依赖、Homebrew 的 libmpv 和 ffprobe。
脚本不安装依赖、不下载运行时，也不构建正式 App。
本次仅在 Apple Silicon Mac 上运行；链接的是本机 Homebrew 动态库。

```sh
node tools/desktop-video-spike/build.mjs
# 或明确使用修订素材：
node tools/desktop-video-spike/build.mjs release/video/49-2025V1-clean-v2
node --test tools/desktop-video-spike/*.test.mjs
node tools/desktop-video-spike/run.mjs quick
node tools/desktop-video-spike/run.mjs boundaries
```

输入默认为 `release/video/49-2025V1/manifest.json` 和四个 MP4，也可传入其他已审查
目录；校验所选 manifest 中的素材哈希、
音频轨的 44,100 ticks/秒时长及 H.264 视频。缺少素材或身份不符时直接失败。
这些素材不在 Git；fresh clone 须向维护者取得相同 revision，不得拿其他视频代替。
构建证据记录输入目录和 manifest 哈希；测试同时校验输入及实际打包副本，不能把
原拆片的测试结果冒充修订素材的结果。修订版实测见 [素材记录](../../docs/test-runs/2026-11-17-video-materials.md)。

| 文件 | 职责 |
| --- | --- |
| `prepare.mjs` | 校验素材，生成共享 Definition 与 EDL |
| `Engine.c/.h` | libmpv 控制接口、独立软件渲染线程、事件与时钟采样 |
| `Preview.swift` | AppKit 预览、异步控制、自动场景及证据记录 |
| `build.mjs` | 编译 TS/C/Swift、复制四份素材、临时签名及身份取证 |
| `run.mjs` | 验证源码与二进制身份、启动测试、超时退出、独立分析 |
| `analyze.mjs` | 检查实际日志，不能仅凭测试驱动结束就判通过 |
| `*.test.mjs` | EDL/素材与分析器正反例；合成日志只测试分析器，不是播放证据 |

`quick` 约 42 秒：四类接缝及七种控制场景。
`boundaries` 约 4 分 9 秒：全部 50 处接缝及七种控制场景。
自动测试隐藏窗口、不抢焦点、播放器静音；**不要同时启动手工实例或另一轮测试**。
自动化仍解码音视频并渲染离屏帧，但没有验证真实窗口显示或扬声器听感。

证据在 `release/desktop-video-spike/runs/<timestamp>-<suite>/`：

- `run-context.json`：构建身份、源码/制品哈希、分析器版本；
- UUID 子目录中的 `events.jsonl`、`complete.json`、末帧 PNG；
- 外层 `analysis.json`：独立断言、统计和原始事件哈希。

runner 会拒绝与构建记录不一致的源码/可执行文件。修改播放源码后必须重建。
`complete.json` 仅为驱动完成标记，不等于验收通过。
手工日志默认在 `~/Library/Logs/StarlightVideoPrototype/<UUID>/`。

## 4. 证据口径与已知限制

1. 每个接缝测试是先定位到接缝前再真实播放跨越，**不是连续播完整套 62 分钟**。
2. `time-pos`、`audio-pts`、渲染帧计数是引擎采样值，不是逐帧显示 PTS、解码音频缓冲
   或扬声器录音。本原型不证明“绝无吞字”、无声学接缝或多设备出声误差。
3. 本阶段预算：媒体和可用音频时钟偏差 ≤250 ms，A/V 偏差 ≤150 ms。
   这是可行性检查阈值，不是正式同步精度承诺，也不能与 iOS 的逐帧/tap 证据混用。
4. mpv 0.42 的 `mp_property_audio_pts` 在音频达到 EOF 后返回 unavailable。
   分析器只允许自然结束前最后 300 ms、且距整体 EOF ≤350 ms 的音频属性空窗；
   明确报告排除数量。其他时段丢失音频时钟仍失败，末尾空窗不作为连续性证据。
5. 本机 libmpv 构建最低版本高于本机系统，引发链接警告；本机能运行不代表兼容其他
   macOS。未做 Universal、依赖内置、发行签名/公证，**不能当作离线分发包**。
6. 未测试长期漂移、休眠/唤醒、系统时间大幅变化、进程重建、蓝牙/耳机、多设备同步。
7. 尚未实现正式任务、原音频播放所有权仲裁、后台策略或任何平台的视频发行包。
8. 组合版比原49遍视频短 760 ms，不允许两种素材用同一 elapsed 混播；98 遍需独立验证。
9. 正式接入仍须处理 05:30 视频约 06:32:17 结束与既有 06:30 音频任务冲突。

上游依据（按本机 mpv 0.42.0 固定版本核对）：
`mpv-player/mpv` 的 `DOCS/edl-mpv.rst`、`libmpv/render.h`、`DOCS/man/input.rst`、
`player/command.c:mp_property_audio_pts`。EDL 不是稳定不变的外部规范，升级引擎后须重测。
