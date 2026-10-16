# 当前风险与已知问题

> 文档类型：活状态。源码核对基线：`0698f62`（2026-10-16）。这里记录尚未关闭的工程、测试、发布和接管风险；历史走查证据见 [CODE_REVIEW.md](CODE_REVIEW.md)。

## 状态定义

| 状态     | 含义                                            |
| -------- | ----------------------------------------------- |
| OPEN     | 已确认存在，尚未解决                            |
| BLOCKED  | 需要账号、设备、产品决定或外部资料才能推进      |
| ACCEPTED | 明确接受当前限制，并有负责人和复核日期          |
| RESOLVED | 已修复且有 commit、测试或制品证据；移入已解决区 |

所有 OPEN/BLOCKED 项应在项目使用的问题跟踪系统中补充负责人、目标版本和链接；仓库目前没有可核实的外部 issue ID，因此这里不虚构编号。

## 活跃问题

| ID          | 优先级 | 状态    | 问题与证据                                                                                                                                          | 影响                                                                       | 下一步/责任                                                                                 |
| ----------- | ------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| IOS-001     | P0     | OPEN    | 源码 deployment target 为 13.4，但已上传的 1.0.0 build 4 Archive 最终 `MinimumOSVersion=15.0`                                                       | build 4 无法支持 iOS 13/14 老用户                                          | 发布负责人生成更高 build，检查 Archive 并做 iOS 13/14 真机回归；否则由产品明确修改支持范围  |
| LEGAL-001   | P0     | BLOCKED | 仓库没有 21 首音频的来源、授权范围和到期信息，也没有源码 `LICENSE`                                                                                  | 无法仅靠技术校验证明拥有分发权或明确源码使用边界                           | 产品/法务补齐受控授权台账；项目所有者确认源码许可策略                                       |
| AUDIO-001   | P1     | OPEN    | Android/iOS 各维护一套音频，两个 `link-assets-manifest.json` 对 A05 哈希和 D15 文件名已过时                                                         | 改一端或依赖旧清单会造成跨端不一致                                         | 确立 canonical 音频源并自动生成双端清单；发布时按 [AUDIO_ASSETS.md](AUDIO_ASSETS.md)校验    |
| QA-001      | P1     | OPEN    | 无 CI、Android instrumentation、iOS UI test 或跨端 E2E；模拟器流程没有仓库化自动脚本                                                                | fresh clone 无法复现此前设备操作，高覆盖率不能证明原生行为                 | 先建立 JS 质量门禁，再增加原生 smoke/E2E；每个候选创建 [test-runs](test-runs/README.md)记录 |
| QA-002      | P1     | OPEN    | Jest 全局阈值仅 lines/statements 50%、functions 40%、branches 30%，远低于当前观测基线                                                               | 覆盖率大幅回退仍可能通过                                                   | 在 CI 建立后分阶段提高阈值，并为播放核心文件设置更高门槛                                    |
| QUALITY-001 | P1     | OPEN    | 当前 ESLint 有 31 个 warning，`format:check` 因 7 个源码文件失败                                                                                    | 噪声会掩盖新增问题，无法形成严格门禁                                       | 分批修复，随后收紧 warning 和格式门槛；详见 [LINTING.md](LINTING.md)                        |
| VERSION-001 | P1     | OPEN    | 版本分散在 npm、Android、iOS 和诊断页面，存在 `1.0`/`1.0.0` 两种写法                                                                                | 发版时容易漏改或展示不一致                                                 | 下一版本统一来源或增加发布校验脚本                                                          |
| OPS-001     | P1     | BLOCKED | Android keystore、Apple 证书/账号、商店维护人、下载服务器路径/Nginx/统计任务和回滚责任没有完整移交台账                                              | 发布、续签或回滚依赖个人记忆                                               | 项目所有者在受控系统登记保管人和恢复流程；Git 只保存非秘密索引                              |
| RELEASE-001 | P1     | OPEN    | 最新 Git tag 仍为 `v0.6.0`；1.0 只有事后恢复的 PARTIAL 发布记录，没有当时形成的 FINAL test-run/release record                                       | 源码、制品和商店版本难以追溯                                               | 核对公开版本事实后补签名 tag，并从下个候选开始绑定 test-run 和 release record               |
| DIST-001    | P1     | OPEN    | Android 自建下载页仍使用裸 IP 的 HTTP 地址                                                                                                          | 页面或 APK 传输可被篡改，SHA-256 展示不能替代 TLS                          | 迁移到受信任域名和 HTTPS，保留旧版本回滚链接                                                |
| BUILD-001   | P2     | OPEN    | `ios/.xcode.env` 硬编码 `/opt/homebrew/bin/node`；共享 Xcode scheme 的 Run/Launch 使用 Release                                                      | Intel Mac 或其他 Node 安装不可移植，日常调试也容易误以为在 Debug           | 改为可探测 Node；评估把 LaunchAction 恢复为 Debug，修复前遵循上手文档提示                   |
| PRIVACY-001 | P2     | OPEN    | Android 仍声明 `INTERNET`，iOS ATS 允许任意请求，但当前离线业务没有网络调用                                                                         | 扩大权限和审核面，和用户预期不够一致                                       | 确认无隐含依赖后收紧 Manifest/ATS，并重新做启动、播放和诊断回归                             |
| A11Y-001    | P2     | OPEN    | 仅核心播放控件有部分语义；VoiceOver/TalkBack、大字体、Reduce Motion、对比度未完整验收                                                               | 不能宣称全面无障碍支持                                                     | 按 [ACCESSIBILITY.md](ACCESSIBILITY.md)分阶段改造并做真机辅助技术测试                       |
| INPUT-001   | P2     | OPEN    | 自定义遍数会静默删除非数字字符，`-5` 变 `5`、`1.5` 变 `15`                                                                                          | 用户可能在未察觉时保存不同数值                                             | 显示转换结果，或改为明确校验并提示错误                                                      |
| CARE-001    | P2     | OPEN    | 关怀模式主要依赖不公布 SeekTo capability；异常 `RemoteSeek` 仅对同步模式显式纠正                                                                    | 特殊系统/厂商事件仍可能绕过简化目标                                        | 在关怀模式增加事件层防守，并做锁屏/耳机真机验证                                             |
| COUNT-001   | P2     | OPEN    | 静态路径显示：单曲播放完成 N 遍停止后，若冷启动时原生队列已丢失，restore 会保留 completed=N/session=N，但从 0 seek 可能重新令 `cycle_eligible=true` | 用户再次按播放前，页面可能暂时显示 N+1；尚无设备级复现记录，不能宣称已修复 | 增加“任务已完成→原生队列丢失→冷启动→尚未播放”回归测试，并在双端设备核验后决定修复或关闭     |

## 使用规则

1. 新问题先写复现证据和影响，再确定优先级；“可能有问题”不能直接写成事实。
2. 关闭问题时记录修复 commit、测试用例、候选 build 和验证设备；只有代码合并不等于已验证。
3. 外部阻塞项不能靠猜测关闭。证书、授权、服务器和账号资料应放在受控系统，这里只放索引和责任人。
4. 每次发版冻结前逐项评估 P0/P1；接受风险必须写负责人、原因和下次复核日期。

## 已解决问题

已完成的播放可靠性修复保留在 [CHANGELOG.md](../CHANGELOG.md) 和 [CODE_REVIEW.md](CODE_REVIEW.md)，避免在活跃表中重复。后续关闭项目可按以下格式移入这里：

```text
ID / 解决版本与 build / 修复 commit / 验证记录 / 关闭日期
```
