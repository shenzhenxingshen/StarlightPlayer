# StarlightPlayer 文档门户

> 目标读者：开发、测试、发布和项目维护人员。源码核对基线：`0698f62`（2026-10-16）。

这里是工程文档的统一入口。根目录 `README.md` 负责介绍产品和最短启动路径；本页负责告诉维护者“先读什么、哪份文档是权威、改动后必须同步什么”。

## 1. 按角色阅读

### 第一次接手项目

1. [新开发者上手](ONBOARDING.md)：从 fresh clone 到双端启动和测试基线。
2. [项目全景架构](ARCHITECTURE.md)：理解 JS、原生、播放器与持久化边界。
3. [播放架构与状态机](PLAYBACK_ARCHITECTURE.md)：掌握 N 遍计数和同步模式的不变量。
4. [本地数据模型](STORAGE_MODEL.md)：理解 MMKV 字段、迁移和清零规则。
5. [测试手册](TESTING.md)：知道自动化能证明什么、不能证明什么。
6. [当前风险](KNOWN_ISSUES.md)：开始修改前先查看未关闭问题。

[项目接管手册](TAKEOVER.md)保留一次完整接管视角，适合快速建立背景，但长期事实应以本页列出的专项文档和源码为准。

### 日常开发与排障

- 环境、启动、构建：[开发环境](DEVELOPMENT.md)
- 贡献、评审与完成定义：[`CONTRIBUTING.md`](../CONTRIBUTING.md)
- 初始化、播放、计数、同步和后台异常：[故障排查](TROUBLESHOOTING.md)
- 代码风格与当前静态检查状态：[Lint 与格式](LINTING.md)
- 关键方案的选择理由：[设计决策记录](DECISIONS.md)

### 测试与发布

1. [测试策略与自动化](TESTING.md)
2. [人工 QA 操作手册](QA_PLAYBOOK.md)
3. [设备与验收矩阵](DEVICE_TEST_MATRIX.md)
4. [版本测试执行记录](test-runs/README.md)
5. [双端发布手册](RELEASE.md)
6. [版本发布记录](release-records/README.md)

原始录屏、完整诊断、安装包、Archive、coverage HTML 和 `.xcresult` 不应直接堆进 Git；仓库中的版本执行记录必须写明 commit、build、制品 SHA-256、设备结论和受控证据位置。

### 产品、内容和用户支持

- 用户操作：[图文用户手册](USER_MANUAL.md)
- 离线传播与打印：[单文件 HTML](USER_MANUAL.html)、[A4 PDF](../output/pdf/StarlightPlayer-User-Manual-1.0.pdf)
- 用户手册图片来源与更新规则：[截图说明](images/user-manual/README.md)
- 隐私：[`PRIVACY.md`](../PRIVACY.md)
- 音频文件、时长与哈希：[音频资产台账](AUDIO_ASSETS.md)
- 关怀模式和无障碍边界：[无障碍与关怀模式](ACCESSIBILITY.md)
- 用户可见变化：[`CHANGELOG.md`](../CHANGELOG.md)

`USER_MANUAL.md` 是手册的唯一内容源。更新文字或截图后，在仓库根目录运行
`python3 scripts/build_user_manual.py`，同时重建图片和样式均已内嵌的 HTML，以及适合
A4 打印的 PDF。生成命令依赖 Pandoc 和 Google Chrome/Chromium；可以通过
`CHROME_BIN` 指定浏览器可执行文件。

## 2. 唯一权威范围

| 事实                                                           | 唯一权威文档                                                                     | 其他文档的规则                                                 |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| N 遍、四模式、同步、QueueEnded、恢复的业务语义、阈值与决策顺序 | [PLAYBACK_ARCHITECTURE.md](PLAYBACK_ARCHITECTURE.md)                             | 全景架构可摘要事件编排，但不得重新定义业务规则                 |
| 系统组件、生命周期、数据/事件流和 JS/原生边界                  | [ARCHITECTURE.md](ARCHITECTURE.md)                                               | 领域阈值链接播放架构，物理字段链接数据模型                     |
| MMKV 物理 schema、默认值、清零、迁移与坏数据回退               | [STORAGE_MODEL.md](STORAGE_MODEL.md)                                             | 其他文档只列流程所需字段子集；冲突时以数据模型为准             |
| Jest 范围、覆盖率口径、自动化命令                              | [TESTING.md](TESTING.md)                                                         | README 不长期复制测试数字                                      |
| 人工测试步骤和验收标准                                         | [QA_PLAYBOOK.md](QA_PLAYBOOK.md)、[DEVICE_TEST_MATRIX.md](DEVICE_TEST_MATRIX.md) | 每次结果不得直接覆盖测试规范                                   |
| 某个 build 的实际测试结果                                      | [test-runs/](test-runs/README.md)                                                | 发布文档必须链接具体记录                                       |
| 当前构建、签名和发布流程                                       | [RELEASE.md](RELEASE.md)                                                         | 实际渠道状态写入 [release-records/](release-records/README.md) |
| 某个版本的制品、渠道与回滚事实                                 | [release-records/](release-records/README.md)                                    | 没有证据的字段保持 UNKNOWN                                     |
| 音频技术事实                                                   | [AUDIO_ASSETS.md](AUDIO_ASSETS.md)                                               | 用户手册不复制哈希和编码参数                                   |
| 当前工程风险                                                   | [KNOWN_ISSUES.md](KNOWN_ISSUES.md)                                               | [CODE_REVIEW.md](CODE_REVIEW.md)只作为时间点审计快照           |
| 用户如何操作                                                   | [USER_MANUAL.md](USER_MANUAL.md)                                                 | 开发文档不替代用户说明                                         |

源码和最终制品始终高于文档：文档与源码不一致时先停止发布，复核行为并同步修正文档；不能因为文档写了“支持”就把未经测试的场景标为通过。

## 3. 文档类型

| 类型     | 示例                             | 维护规则                                 |
| -------- | -------------------------------- | ---------------------------------------- |
| 长期规范 | 播放架构、数据模型、贡献规范     | 相关实现变化必须在同一提交更新           |
| 活状态   | 已知问题、音频台账、发布手册     | 状态变化后立即更新，并保留证据           |
| 执行记录 | `test-runs/<version>-<build>.md` | 创建后只允许补证据或纠错，不改写历史结论 |
| 历史快照 | 全盘代码走查、旧发布记录         | 标明日期与 commit，不伪装成当前状态      |
| 用户文档 | 用户手册、隐私、更新记录         | UI、数据、权限或产品规则变化时同步更新   |

## 4. 代码变化到文档变化

| 改动类型                 | 必须同步                                                          |
| ------------------------ | ----------------------------------------------------------------- |
| 播放、计数、同步、恢复   | 播放架构、测试手册、QA 用例；用户可感知时更新用户手册和 CHANGELOG |
| MMKV key、默认值、迁移   | 数据模型、迁移测试、隐私政策；必要时补升级 QA                     |
| UI、布局、关怀模式       | 用户手册与截图、无障碍文档、布局/设备用例                         |
| 原生桥接、后台能力、权限 | 全景架构、故障排查、设备矩阵、隐私和发布清单                      |
| 音频文件、时长或曲目表   | 音频台账、双端校验、同步回归、用户手册曲目说明                    |
| 版本或构建号             | CHANGELOG、发布手册、测试执行记录、下载页/商店文案                |
| 构建工具、依赖、最低系统 | 开发环境、上手手册、发布手册、设备矩阵                            |
| 新风险或已知缺陷         | 已知问题；若改变发布决策，同时更新 release/test-run 记录          |

## 5. 文档完成标准

- 相对链接和图片有效，Markdown 通过 Prettier，`git diff --check` 无错误。
- 所有易变数字都注明日期与基准 commit，或只引用权威文档。
- 命令从仓库根目录说明执行位置，不隐含个人绝对路径。
- 不提交证书、私钥、密码、设备完整诊断、个人账号、UDID 或未脱敏日志。
- 截图只证明界面外观，不当作后台、锁屏、硬件或长时间播放证据。
- 模拟器、mock 和覆盖率的边界必须写清；未执行场景标为 `NOT RUN`，不能凭推断写 `PASS`。

若发现文档缺口，优先补到已有权威文档；只有受众、生命周期或权威范围确实不同，才新增文件。

## 6. 维护节奏

文档不是发版结束后的补写项，应和事实变化保持同一个提交或同一个发布批次：

- 每个 PR：作者按“代码变化到文档变化”表判断影响面；reviewer 核对命令、链接、兼容声明和测试边界。
- 每个发布候选：新建不可变的 `test-runs/` 记录；通过后再补 `release-records/`、CHANGELOG、用户手册和渠道文案。
- 每次工具链升级：fresh clone 重跑上手步骤，更新 DEVELOPMENT/ONBOARDING/TESTING，不覆盖旧 build 的历史事实。
- 每季度或负责人交接前：检查外链、截图、当前风险、证书/服务器受控台账索引，以及文档基准 commit 是否仍可追溯。
- 发现文档与源码不一致：先把相关发布结论标为待复核，再按源码、测试和最终制品修正文档；不要只改文字来“满足”旧结论。

## 7. 下一阶段文档闭环

当前文档已经覆盖接手、开发、架构、测试、排障和发布方法，但以下内容必须由后续真实执行补齐，不能用推断代替：

1. 下一候选 build 的 Android/iOS 正式 test-run，包括真机、后台、锁屏、中断、蓝牙和多设备同步证据。
2. Android 原生测试、iOS UI Test、跨端 E2E 和 CI 建成后的实际命令、失败排查与责任边界。
3. iOS 13/14 可安装候选的 Archive 核验和旧系统真机结果；当前 build 4 不能作为兼容证据。
4. Android 下载服务器、Apple/Android 签名、商店账号和回滚责任人的受控运维台账索引；秘密本身不得进入 Git。
5. 音频授权/来源和源码许可的法务结论，以及可审计的 canonical 音频资产来源。

逐项状态、优先级和关闭证据统一维护在 [当前风险](KNOWN_ISSUES.md)，避免在多份文档各写一套待办。
