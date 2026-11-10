# 音频资产台账与校验

> 最后核对：2026-11-10。本文记录技术事实，不构成版权或授权证明。

## 1. 当前资产结构

应用内置 21 首 MP3，不在运行时下载。相同文件各保存一份：

- Android：`android/app/src/main/assets/audio/`
- iOS：`ios/StarlightPlayer/audio/`，并显式加入 Xcode Resources

2026-11-10 实测两端均为 21 个文件、文件名集合一致、逐文件 SHA-256 一致；每端总大小为 119,804,178 bytes（114.25 MiB）。业务文件名和同步用时长的代码源是 `src/constants/tracks.ts`。

当前仓库没有独立的 canonical 原始音频目录。`scripts/copyAssets.js` 默认源 `assets/audio` 不存在，而且脚本只会复制到 Android，因此它不能作为完整的双端资产流水线。

## 2. 21 首业务清单

| 编号 | 文件名                         | `durationMs` |
| ---- | ------------------------------ | -----------: |
| A01  | A01 大悲咒（跟我学）.mp3       |       273894 |
| A02  | A02 大悲咒（唱版）.mp3         |       174795 |
| A03  | A03 大悲咒（慢版）.mp3         |        83235 |
| A04  | A04 大悲咒（快版）.mp3         |        60008 |
| A05  | A05 大悲咒（共修版）.mp3       |        70385 |
| B06  | B06 发愿回向文.mp3             |        79944 |
| C07  | C07 南无阿弥陀佛（唱版）.mp3   |       608888 |
| C08  | C08 南无阿弥陀佛（慢版）.mp3   |       115083 |
| C09  | C09 南无阿弥陀佛（快版）.mp3   |        83667 |
| C10  | C10 阿弥陀佛（唱版）.mp3       |       917708 |
| C11  | C11 阿弥陀佛（慢版）.mp3       |        98691 |
| C12  | C12 阿弥陀佛（快版）.mp3       |        62595 |
| C13  | C13 南无观世音菩萨（唱版）.mp3 |       412865 |
| C14  | C14 南无观世音菩萨（慢版）.mp3 |        76515 |
| D15  | D15 期盼.mp3                   |       196089 |
| D16  | D16 回向偈.mp3                 |       200787 |
| D17  | D17 观音灵感歌.mp3             |       264497 |
| D18  | D18 观音菩萨如秋月.mp3         |       307275 |
| D19  | D19 一声佛号一声心.mp3         |       318733 |
| D20  | D20 观音菩萨偈.mp3             |       241503 |
| D21  | D21 愿做菩萨那朵莲.mp3         |       244766 |

`durationMs` 不是纯展示字段：同步位置取模和 QueueEnded 完整周期判断都依赖它。替换音频却不更新时长，可能造成多设备错位、错误计数、结尾恢复或“吞音”表现。

## 3. A05 的特殊历史

A05 曾是 Xing VBR 文件，包大小分布从 96 到 768 bytes；在同步模式每遍结束后的重新对齐场景中，它比其他曲目更容易暴露播放器时间轴/编码延迟差异。V1.0 使用 70.684 秒固定帧版本。V1.1 按产品确认，改用 21 遍录音按解码时间轴平均切分后的第一遍，增加 250 ms 前导静音，并转为与 A04 相同的音频规格；因此 V1.0/V1.1 不保证跨版本同步，用户应升级到相同版本。

当前 A05 是重新编码后的版本：

| 属性         | 当前值                                                             |
| ------------ | ------------------------------------------------------------------ |
| 容器/编码    | MP3                                                                |
| 采样率       | 44,100 Hz                                                          |
| 声道         | 2                                                                  |
| 流码率       | 128,000 bit/s                                                      |
| ffprobe 时长 | 70.384875 s                                                        |
| 起始时间     | 0.025057 s（MP3 解码延迟/Skip Samples 元数据）                     |
| 大小         | 1,127,278 bytes                                                    |
| 包大小       | 2,585 个 418 bytes、109 个 417 bytes（另有 Skip Samples side data） |
| 帧布局       | CBR / 固定帧长，不是旧版可变包大小 Xing VBR                        |
| SHA-1        | `e908aaf671d0e99041804ad4b78501745a029484`                         |
| SHA-256      | `28aafa6f7797d9d873325bb90c50659b2c33237052b7032d0173d6395b842c7a` |

当前文件保持 CBR 固定帧布局，避免重新引入旧 A05 独有的 VBR 变量。但“固定帧长”不等于可以保证没有首音丢失：RNTP/AVPlayer 的 QueueEnded 回调、MP3 priming/padding 和重新 seek 的调度延迟仍要通过真机日志验证。

## 4. 历史 manifest 的定位

`android/link-assets-manifest.json` 与 `ios/link-assets-manifest.json` 是历史资源链接工具的 bookkeeping，两份文件都记录 iOS 源路径。V1.1 已把 A05 SHA-1 和 D15 文件名更新为当前值，但当前项目没有直接依赖 `react-native-asset`，因此不能把这两个文件当作发布完整性清单。发布仍须执行下方双端逐文件 SHA-256、解码和时长校验。

## 5. 每次发布的只读校验

以下命令需要 macOS/zsh、`ffprobe`/`ffmpeg`。它们不会修改仓库文件。

### 5.1 文件数与文件名

```bash
find ios/StarlightPlayer/audio -type f -name '*.mp3' | wc -l
find android/app/src/main/assets/audio -type f -name '*.mp3' | wc -l

STARLIGHT_AUDIO_AUDIT="$(mktemp -d)"
rg -o "audioUrl: '[^']+'" src/constants/tracks.ts \
  | sed -E "s/audioUrl: '([^']+)'/\1/" \
  | sort > "$STARLIGHT_AUDIO_AUDIT/expected.txt"
find ios/StarlightPlayer/audio -type f -name '*.mp3' -exec basename {} \; \
  | sort > "$STARLIGHT_AUDIO_AUDIT/ios.txt"
find android/app/src/main/assets/audio -type f -name '*.mp3' -exec basename {} \; \
  | sort > "$STARLIGHT_AUDIO_AUDIT/android.txt"
diff -u "$STARLIGHT_AUDIO_AUDIT/expected.txt" "$STARLIGHT_AUDIO_AUDIT/ios.txt"
diff -u "$STARLIGHT_AUDIO_AUDIT/expected.txt" "$STARLIGHT_AUDIO_AUDIT/android.txt"
```

三份均应是 21 行，两个 `diff` 应无输出。

### 5.2 双端哈希一致

```bash
(
  cd ios/StarlightPlayer/audio
  for file in *.mp3; do shasum -a 256 "$file"; done | sort -k2
) > "$STARLIGHT_AUDIO_AUDIT/ios-sha256.txt"
(
  cd android/app/src/main/assets/audio
  for file in *.mp3; do shasum -a 256 "$file"; done | sort -k2
) > "$STARLIGHT_AUDIO_AUDIT/android-sha256.txt"
diff -u "$STARLIGHT_AUDIO_AUDIT/ios-sha256.txt" "$STARLIGHT_AUDIO_AUDIT/android-sha256.txt"
```

`diff` 应无输出。把最终哈希清单附到发布记录；不要只记录总目录哈希。

### 5.3 元数据、解码与时长

```bash
for file in ios/StarlightPlayer/audio/*.mp3; do
  echo "=== $(basename "$file") ==="
  ffprobe -v error \
    -show_entries stream=codec_name,sample_rate,channels,bit_rate \
    -show_entries format=duration,size,bit_rate \
    -of default=noprint_wrappers=1 "$file"
  ffmpeg -v error -i "$file" -f null -
done
```

`ffmpeg` 不应报告解码错误。将 `duration × 1000` 四舍五入后与清单的 `durationMs` 逐项比对；任何差异都要先分析，不能随意扩大 QueueEnded 容差来掩盖资源问题。

### 5.4 安装包内资源

Android APK 构建后：

```bash
unzip -l android/app/build/outputs/apk/release/app-release.apk \
  | rg 'assets/audio/.*\.mp3$'
```

iOS Archive 构建后：

```bash
find "$STARLIGHT_ARCHIVE_PATH/Products/Applications/StarlightPlayer.app" \
  -type f -name '*.mp3' -print
```

两端产物内仍应各有 21 首。最后在目标设备上抽测所有曲目能开始播放，并让 A05 至少自然完成一个同步周期。

## 6. 替换或新增音频的标准流程

1. 产品方提供原始文件、曲目名称、来源和授权证明；先存入受控原始资产库，不直接覆盖仓库文件。
2. 记录原始文件 SHA-256、采样率、声道、编码、精确解码时长和转码命令/工具版本。
3. 若需转码，输出新文件到独立临时目录，完整解码并试听首尾、静音、爆音、削波和响度。
4. 产品确认最终文件后，同时替换 Android/iOS 两份；文件名必须与 `audioUrl` 完全一致。
5. 更新 `src/constants/tracks.ts` 的名称和 `durationMs`，并解释取值依据。
6. 执行第 5 节全部检查，确认两端哈希一致。
7. 运行自动化测试，再做普通/同步、重复、自然结尾、暂停恢复、后台和多设备真机测试。
8. 在 CHANGELOG 和发布记录写明资源变化及新 SHA-256；不要把音频变化藏在普通代码提交中。

不要用“加一点空白”作为默认修复。它会改变共同同步周期；只有在产品明确改变所有用户的业务音频基准、旧新版本同步影响已评估后才能采用。

## 7. 授权与来源台账：待产品方补齐

仓库和现有文档不足以确认 21 首音频的版权归属、表演者许可、录音制品权、改编/转码权和分发地域。**不得根据文件名、宗教用途、免费应用或历史上能下载来推断拥有授权。**

产品方应为每首补齐至少以下字段，并把证明文件存入受控文档系统，而不是把个人证件或合同原件直接提交到公开 Git：

| 字段               | 内容                                            |
| ------------------ | ----------------------------------------------- |
| 编号/曲名          | 与 App 清单一致                                 |
| 原始文件 SHA-256   | 可追溯到源文件                                  |
| 来源/提供方        | 组织、个人或正式渠道                            |
| 涉及权利           | 词曲、表演、录音制品、改编、转码、网络/应用分发 |
| 授权主体与证明编号 | 合同、邮件或公开许可的可核验引用                |
| 授权范围           | 平台、地域、期限、商业/非商业、是否允许离线内置 |
| 署名/声明要求      | 商店页或 App 内需要展示的内容                   |
| 到期/复核日期      | 负责人和提醒时间                                |
| 产品/法务确认      | 姓名、日期、结论                                |

在台账完成前，技术团队只能证明“文件是什么、被如何打包”，不能替产品或法务作授权结论。
