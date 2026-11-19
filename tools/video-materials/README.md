# 视频素材整理

## 当前正式 App：六份用户素材

`prepare-bundled.mjs` 对应 `media/video/manifest.json` 的六份素材。
当前 revision 为 `video-2026-11-19-v2`，不是下面历史四段原型的处理链。
源件仅校验、读取；输出必须是新目录，不覆盖原件。

```sh
node tools/video-materials/prepare-bundled.mjs --help
node tools/video-materials/prepare-bundled.mjs /path/to/素材集合 /path/to/new-output
node --test tools/video-materials/qr-treatment.test.mjs
node scripts/verify-video-assets.mjs
```

- 统一856×482、H.264 High@3.1、30fps、CRF21；原AAC音频包直接复制。
- 正文和最后一遍的固定二维码区域 `684,281,122,122` 使用局部插值；
  只允许匹配已审查源SHA-256和画布尺寸的素材。未增加标题、未裁字幕。
- 六段均校验视频帧数、44,100 tick/秒下逐包PTS/持续时间、总时长、
  AAC数据包哈希、完整解码和压缩SSIM。带二维码处理的SSIM参考先应用相同处理，
  不能用该值宣称无痕修复。
- 当前工具**不降音量、不淡化、不重新编码音频**。不要将下文历史原型的
  `process.py` 应用到这套正式素材。

已知二维码图案的逐帧回归检查（需已有Python/OpenCV；不扫描二维码内容）：

```sh
python3 tools/video-materials/audit-qr.py --help
python3 tools/video-materials/audit-qr.py \
  --template /path/to/素材集合/可重复多次的一遍-去数字2.mp4 \
  media/video/intro-49.mp4 media/video/intro-98.mp4 media/video/salutation.mp4 \
  media/video/regular-cycle.mp4 media/video/final-cycle.mp4 media/video/outro.mp4
```

默认使用原件第300帧的 `688,285,114,113` 图案、0.75相关性阈值，逐帧全画幅搜索。
JSON写stdout，进度/错误写stderr；可重定向保存结果。它只检查这个已知图案，
不是通用二维码不存在的证明，也不代替字幕、修补背景的人工视觉验收。
详见[本轮记录](../../docs/test-runs/2026-11-19-video-ui.md)。
两项CLI目前只在macOS执行，未做Windows/Linux工具运行验收。

正式六份衍生MP4进入Git并随App离线打包；原件和大体量检查产物放在忽略的
`release/`。下面“未随Git交付”的描述仅指历史隔离原型。

## 历史：49遍四段隔离原型（2026-11-17）

这是隔离视频原型的素材处理工具，不修改正式 App 音频、任务或同步规则。
本轮产物及播放验证见 [2026-11-17 素材记录](../../docs/test-runs/2026-11-17-video-materials.md)。

## 范围和处理原则

只接受已审查的 `49-2025V1` 四份拆片和对应原长视频，逐个校验 SHA-256。
**不能直接用于 98 遍视频或其他版本**；字号、字幕、切点不同，需要重新审查。
原输入不改写，输出目录必须全新且与输入分离。失败产物保留供诊断，不能当成功结果。

| 部分 | 处理 |
| --- | --- |
| 片头 | 保留原片头及原有文字，不额外加标题或播放器名称；保留短淡入，仅清理末端旧计数 |
| 正文、特殊末遍 | 对旧固定数字所在区域做局部插值；保留底部正文字幕 |
| 片尾 | 保留回向、礼敬、署名等内容；仅在最后画面加短淡出 |
| 音频 | 四段统一降低 2 dB，各切点端部作 221 采样点（约 5 ms）微淡化 |
| 时间轴 | 不改变音频采样时长、视频帧数或播放顺序；不加速、不重叠、不额外增删静音 |

局部插值不是恢复被文字遮住的原始背景，可能留下模糊痕迹，需要人工看画面。
AAC/H.264 都经过有损重编码，不能称为无损修复。
统一降增益是为原素材解码峰值超过满刻度留余量；没有逐段拉平原有响度差异。
不能只根据低电平阈值剪掉换气和停顿：正文接缝有连续背景音，末遍到片尾原有约
0.56 秒低电平区（10 ms 窗、双声道较大 RMS、−40 dBFS 阈值），本轮保留。

## 复现

在仓库根目录运行。需已有 Python 3 / numpy / Pillow、FFmpeg / ffprobe；
OCR 审计另外需要 macOS Xcode Swift / Vision。处理工具使用本机系统中文字库
`/System/Library/Fonts/STHeiti Medium.ttc`。脚本不会安装依赖或下载素材。

```sh
# 小型计划与保护测试；不是播放测试
python3 -m unittest discover -s tools/video-materials -p 'test_*.py' -v

# 检查原件：每次使用全新的输出目录
python3 tools/video-materials/audit.py \
  release/video/49-2025V1 release/video/49-2025V1-audit-new

# 生成、完整解码校验、时间轴核对、声音对照和短预览
python3 tools/video-materials/process.py \
  release/video/49-2025V1 release/video/49-2025V1-clean-new

# 检查修订后的素材；OCR 只是抽样，不代表逐帧人工审阅
python3 tools/video-materials/audit.py \
  release/video/49-2025V1-clean-new release/video/49-2025V1-clean-audit-new
```

输出包含四份 MP4、`manifest.json`（父版本、原片身份、命令、探测及检查结果）、
`SHA256SUMS.txt`、`before-after.jpg` 对比图、`review-36s.mp4`；不生成额外标题卡。
36 秒短片顺序是片头 7 秒、四类接缝各前后 3 秒、片尾 5 秒。
短片是供观察的再次编码样片，不是原型播放输入，也不证明整个流程无缝。

`audit.py` 的静音检查使用 10 ms RMS 窗和双声道中较大值，避免左右声道反相抵消；
报告采样跳变量、黑帧检测和抽样 OCR。固定阈值测得的“低电平长度”会随增益变化，
不能把它直接解释成素材增加或删除了多少静音。

## 接入隔离原型

当前修订目录是 `release/video/49-2025V1-clean-v2`。
按用户反馈，v2 撤销 v1 新增的“大悲咒 / 星光播放器”标题卡，恢复原片头画面；
原视频自身的“49 遍”等文字属于原有内容，未另外删除。其他处理及时间轴不变。
v1 保留作为历史版本，不再作为当前推荐审阅稿。
两个构建脚本仍默认使用原拆片，明确传参才使用修订版：

```sh
node tools/video-program-spike/build.mjs release/video/49-2025V1-clean-v2
node tools/desktop-video-spike/build.mjs release/video/49-2025V1-clean-v2
node --test tools/desktop-video-spike/*.test.mjs
```

播放测试分别见 [iOS 原型](../video-program-spike/README.md) 和
[macOS 原型](../desktop-video-spike/README.md)。不要在同一设备同时运行两轮。
即使时长相同，处理后的媒体哈希改变，必须使用新 revision；
不要将旧版与修订版混称为同一制品。

## 文件与证据保存

处理脚本、测试和记录进入 Git；MP4、图片、完整原始日志都在被忽略的 `release/`。
当前没有上传远端制品存储，fresh clone 无法凭 Git 自动取得视频。
本阶段先提供本机审阅版本；人工确认后再决定最终媒体版本、分发和正式集成。
