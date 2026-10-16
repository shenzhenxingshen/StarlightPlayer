# StarlightPlayer 贡献指南

> 本指南从当前仓库实践整理出可执行约定。播放、同步、持久化、音频和发布改动风险较高；“代码能编译”不是合并或发布的充分条件。

## 1. 开始前

1. 新开发者先完成 [60 分钟上手指南](docs/ONBOARDING.md)。
2. 播放相关改动必须先读 [播放架构](docs/PLAYBACK_ARCHITECTURE.md)。
3. 从最新 `main` 创建分支，开始前确认工作区没有他人未提交改动。
4. 用 issue/任务写清预期、非目标、兼容范围和验收方式；涉及产品语义时先确认，不从代码猜产品规则。

```bash
git fetch --prune
git switch main
git pull --ff-only
git status --short --branch
```

## 2. 分支约定

新分支使用小写英文和短横线，不把多个无关目标放在同一分支：

| 类型           | 格式              | 示例                         |
| -------------- | ----------------- | ---------------------------- |
| 新功能         | `feature/<topic>` | `feature/sleep-timer`        |
| 缺陷修复       | `fix/<topic>`     | `fix/sync-cycle-boundary`    |
| 测试           | `test/<topic>`    | `test/android-background`    |
| 文档           | `docs/<topic>`    | `docs/onboarding`            |
| 发布准备       | `release/vX.Y.Z`  | `release/v1.1.0`             |
| Codex 工作分支 | `codex/<topic>`   | `codex/playback-diagnostics` |

已有历史分支不需要为匹配新约定而重命名。不要在共享分支强制推送；发布后的 `main` 和 tag 不改写历史。

## 3. 提交约定

提交标题沿用仓库近期的 Conventional Commit 风格：

```text
feat: add ...
fix(playback): prevent ...
test: cover ...
docs: document ...
refactor: simplify ...
chore(release): bump version to X.Y.Z
```

要求：

- 一个提交只承担一个可解释目标；机械格式化、音频二进制、业务逻辑和版本发布尽量分开。
- 标题用祈使/结果表达，正文解释“为什么、关键不变量、验证证据”，不只复述 diff。
- 不提交 `node_modules`、`ios/Pods`、DerivedData、Gradle 缓存、`release/`、本地签名文件或诊断日志。
- 不提交密码、token、证书私钥、Provisioning Profile、`.p12`、release keystore 或用户设备信息。
- 改音频时在独立提交中写明来源记录、转码依据和 SHA-256；21 首音频授权仍须产品/法务确认。

提交前至少执行：

```bash
git status --short
git diff --check
git diff
```

## 4. Pull Request 与 Review

默认通过 Pull Request 合并到 `main`。紧急修复也要留下等价的变更说明、测试证据和发布记录；“紧急”不能跳过播放不变量评审。

PR 描述至少包含：

```text
问题/用户价值：
改动范围与明确非目标：
影响的平台和最低系统：
对 N 遍、四模式、同步、持久化、后台和布局的影响：
自动化命令与结果：
模拟器/真机设备、build 和结果：
截图/录屏/诊断证据：
文档和 CHANGELOG 更新：
风险、回滚方法、尚未验证项：
```

Review 必查：

- 每首 N 遍是否仍优先于四种模式，`cycleEligible` 是否可能被错误授予。
- 同步加入、恢复、自然结尾和换曲是否仍按共同时间基准对齐。
- TrackPlayer 命令是否全部串行，QueueEnded 是否保持 generation/active track/位置校验和幂等。
- 真换曲与恢复是否被正确区分，遍数和 `expected_playing` 是否跨重启一致。
- 响应式布局是否仅重排 UI，是否支持 iPhone/iPad/Android 的竖、方、横窗口。
- iOS 13/14 兼容意图、Android minSdk 23、离线能力和无障碍是否被无意破坏。
- 是否引入多余网络权限、用户数据、日志隐私或不可回滚的数据迁移。

播放状态机、原生后台、持久化迁移、音频或发布配置改动，至少需要一名理解对应文档的 reviewer。PR 可 squash 或保留有意义的逻辑提交，但进入 `main` 的历史必须能追溯需求和测试；不要用无说明的“fix”提交堆叠。

## 5. 改动类型、必跑测试和必更文档

下表是最低要求；影响多个类型时取并集。命令结果和设备证据应记录在 PR/发布单，不把个人绝对路径写进共享文档。

| 改动类型               | 最低自动化/构建                                                                     | 最低人工验证                                                 | 必须评估并更新的文档                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| 纯文档                 | Markdown Prettier、链接/图片检查、`git diff --check`                                | 打开渲染结果核对链接、表格和图片                             | README 文档索引；被事实变化影响的所有文档                                                                              |
| 普通 TS 工具/Store     | `typecheck:app`、`typecheck`、`lint`、相关 Jest、全量 Jest                          | 受影响页面/持久化冒烟                                        | `TESTING.md`；用户可感知时更新 `USER_MANUAL.md`、`CHANGELOG.md`                                                        |
| UI/响应式/无障碍       | 上述检查 + 组件/页面 Jest + coverage                                                | iPhone、iPad、Android 的竖/方/横；大字体、旋转、关怀模式     | `USER_MANUAL.md`、截图、`ACCESSIBILITY.md`、`DEVICE_TEST_MATRIX.md`                                                    |
| 计数/四模式/QueueEnded | 全量质量门槛 + playbackService/playbackCycle/decision/storage/trackManager 定向测试 | 四模式 × N=1/7/大数；自然结束、seek、中断、重启              | `PLAYBACK_ARCHITECTURE.md`、`ARCHITECTURE.md`、`TESTING.md`、`QA_PLAYBOOK.md`、`DEVICE_TEST_MATRIX.md`、`CHANGELOG.md` |
| 同步模式               | 上述播放测试 + syncUtils/recovery 测试                                              | 至少两台真机、A05 连续 21 遍、A04 对照、暂停恢复和跨周期听感 | 上述播放文档 + `USER_MANUAL.md`；改变基准时更新 `AUDIO_ASSETS.md`                                                      |
| MMKV/数据迁移          | storage/store/App 初始化测试 + 全量 Jest                                            | 旧版升级、主动关闭/意外退出、同任务续数、新任务清零          | `STORAGE_MODEL.md`、`PLAYBACK_ARCHITECTURE.md`、`TESTING.md`、`RELEASE.md`、`PRIVACY.md`（字段变化时）                 |
| RNTP/原生模块/平台配置 | 全量质量门槛 + Android Debug/Release 编译 + iOS Debug/Archive 核验                  | 双端真机后台、锁屏、中断、蓝牙、诊断导出                     | `ARCHITECTURE.md`、`DEVELOPMENT.md`、`TROUBLESHOOTING.md`、`DEVICE_TEST_MATRIX.md`、`RELEASE.md`                       |
| 音频文件/时长/曲目     | 全量质量门槛 + 双端 21 首文件名/哈希/ffmpeg 解码 + 包内资源检查                     | 改动曲目完整自然结束、普通/同步重复、多设备基准              | `AUDIO_ASSETS.md`、`CHANGELOG.md`、`USER_MANUAL.md`（清单变化时）、发布记录                                            |
| 诊断/日志/隐私         | 相关 Jest + 双端原生构建                                                            | 生成、分享、取消、失败路径；核对导出字段                     | `PRIVACY.md`、`TROUBLESHOOTING.md`、`USER_MANUAL.md`                                                                   |
| 版本/签名/发布         | [发布手册](docs/RELEASE.md) 的全量门槛、AAB/APK 验签、Archive 产物核验              | 完整发布候选设备矩阵和升级验证                               | `CHANGELOG.md`、`RELEASE.md`、`test-runs/`、`release-records/`、README 版本表、商店文案和下载页                        |

全量 JS/TS 质量门槛：

```bash
npm run typecheck:app
npm run typecheck
npm run lint
npm run format:check
npm test -- --runInBand
npm run test:coverage -- --runInBand
git diff --check
```

若 [Lint 文档](docs/LINTING.md) 的当前基线记录了历史 warning 或格式失败，PR 必须报告“与权威基线相同、减少或增加”，不能只写“通过”；新增代码不得借历史债务增加 warning 或格式失败。模拟器不能替代锁屏、真机后台、来电、蓝牙和多设备同步测试。

## 6. 测试代码约定

- 缺陷修复先增加能复现问题的失败测试，再实现修复；对无法自动化的原生时序，至少提供稳定复现步骤和设备证据。
- Jest 中 TrackPlayer、MMKV 和原生模块是 mock。mock 断言证明业务决策，不证明 AVPlayer/MediaSession/前台服务真实行为。
- 测试文件按源码层级放在 `__tests__/`，名称使用 `*.spec.ts` 或 `*.spec.tsx`。
- 改分支条件时覆盖正常、失败、边界、并发/迟到事件和恢复路径；不要为了覆盖率删除防御分支。
- 覆盖率下降必须解释；高于阈值不代表可以跳过设备矩阵。

详细命令和覆盖范围见 [测试手册](docs/TESTING.md)，真机要求见 [设备测试矩阵](docs/DEVICE_TEST_MATRIX.md)，每次实际结果写入 [`docs/test-runs/`](docs/test-runs/README.md)。

## 7. 版本、发布分支与 tag

### 7.1 版本定义

- 营销版本采用 SemVer：`X.Y.Z`。
- Android `versionCode` 和 iOS `CFBundleVersion` 是各平台单调递增的构建号，不要求彼此相等。
- 每次发版必须按 [发布手册](docs/RELEASE.md) 核对 npm、Android、iOS、诊断页面及当时存在的全部版本声明；已知一致性风险以 [当前风险](docs/KNOWN_ISSUES.md) 为准。
- `CHANGELOG.md` 记录自上个公开版本以来的用户可感知变化、兼容变化和重要修复。

### 7.2 发布流程

1. 从已评审的 `main` 创建 `release/vX.Y.Z`（只在需要发布稳定化时创建）。
2. 只接受版本、文案、测试修复和明确批准的 blocker 修复；不继续叠加新功能。
3. 从模板创建 Android/iOS test-run 和版本发布记录；构建并验证 AAB/APK 与 iOS Archive，记录 commit、build、SHA-256、签名证书和最终 `MinimumOSVersion`。
4. 候选修复回合并到 `main`，确保 tag 指向 `main` 中可追溯的发布 commit。
5. 稳定版使用 annotated tag：

```bash
git tag -a vX.Y.Z -m 'StarlightPlayer X.Y.Z'
git push origin vX.Y.Z
```

需要预发布标识时使用 `vX.Y.Z-rc.N`。不要创建轻量且无说明的发布 tag，不要删除后重建或强制移动已推送 tag；发现问题应增加构建号或下一个补丁版本。

tag 只能在以下条件全部满足后创建：

- 候选 commit 已进入 `main`，工作区干净。
- 全量自动化和双端构建结果已记录。
- 制品版本/签名/哈希/包内音频通过核验。
- 必要真机矩阵已完成，未完成项有风险批准。
- `CHANGELOG`、商店文案、用户文档、下载页和 [`release-records/`](docs/release-records/README.md) 一致。

不要根据源码中的版本字符串推断 tag 或渠道状态；发布前以 Git tag、[版本发布记录](docs/release-records/README.md) 和实际渠道三方核对为准。当前追溯缺口记录在 [当前风险](docs/KNOWN_ISSUES.md)，不要把时间点事实长期复制到本规范。

## 8. 安全与回滚

- 发布前保留上一稳定制品及其签名/哈希，不用同名文件静默覆盖。
- 持久化格式变化必须向前兼容旧数据；无法安全回滚时在 PR 和发布说明中显式标记。
- 自建 Android 下载必须使用受信任域名和 HTTPS；SHA-256 展示不能替代传输安全。渠道当前状态见 [当前风险](docs/KNOWN_ISSUES.md)。
- iOS 支持声明必须以候选 Archive 的最终 `MinimumOSVersion` 和对应旧系统真机结果为准，不能只看工程 Build Settings；具体 build 事实写入 [版本发布记录](docs/release-records/README.md)。
- 严重播放/计数/同步问题应停止推广并发布新 build，不复用已上传过的构建号。

故障采证与安全恢复见 [故障排查手册](docs/TROUBLESHOOTING.md)，双端构建和回滚见 [发布手册](docs/RELEASE.md)。
