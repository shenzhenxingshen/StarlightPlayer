# StarlightPlayer 测试执行记录（模板）

> 复制本文件后填写；不要直接在模板中记录某次执行。方法见 [`../TESTING.md`](../TESTING.md) 和 [`../QA_PLAYBOOK.md`](../QA_PLAYBOOK.md)。

## 1. 记录身份

| 字段                      | 值                                 |
| ------------------------- | ---------------------------------- |
| Record ID                 | TODO                               |
| 状态                      | DRAFT / FINAL / SUPERSEDED         |
| 替代/被替代记录           | 无 / TODO                          |
| 平台                      | iOS / Android                      |
| 营销版本                  | TODO                               |
| 构建号                    | TODO                               |
| Git commit（完整 40 位）  | TODO                               |
| 分支/Tag                  | TODO                               |
| 制品名称                  | TODO                               |
| 安装来源                  | 本地 release / TestFlight / 商店等 |
| 制品 SHA-256              | TODO                               |
| iOS MinimumOSVersion      | N/A / TODO                         |
| iOS UIDeviceFamily        | N/A / TODO                         |
| Android 签名证书 SHA-256  | N/A / TODO（不要记录私钥或密码）   |
| 测试负责人                | TODO                               |
| 执行开始/结束（含时区）   | TODO                               |
| 记录状态变为 FINAL 的时间 | TODO                               |

## 2. 范围与变更风险

- 本候选用户可感知变更：TODO
- 影响模块/原生依赖/音频：TODO
- 必须全量执行的 P/S/L/U：TODO
- 经评审可不执行的项目、原因和批准人：TODO
- 上一份可比较记录：TODO

## 3. 测试环境

| Environment ID | 设备/Simulator/Emulator | OS/API | 屏幕或窗口 | 时区/自动时间 | 安装路径 | 字体/辅助技术 | 电池/后台策略 |
| -------------- | ----------------------- | ------ | ---------- | ------------- | -------- | ------------- | ------------- |
| ENV-01         | TODO                    | TODO   | TODO       | TODO          | TODO     | TODO          | TODO          |

安装路径填写“全新安装”“从 0.6.0 升级”“从 0.7.0 升级”“覆盖同 build”等精确信息。多设备同步还要记录设备间系统时间偏差和共同录音方式。

## 4. 自动化与静态检查

| 检查                                   | 结果                            | 数量/覆盖率/警告 | 证据 ID | 备注 |
| -------------------------------------- | ------------------------------- | ---------------- | ------- | ---- |
| `npm ci`                               | PASS / FAIL / BLOCKED / NOT RUN | TODO             | TODO    | TODO |
| `npm run typecheck:app`                | PASS / FAIL / BLOCKED / NOT RUN | TODO             | TODO    | TODO |
| `npm run typecheck`                    | PASS / FAIL / BLOCKED / NOT RUN | TODO             | TODO    | TODO |
| `npm run lint`                         | PASS / FAIL / BLOCKED / NOT RUN | TODO             | TODO    | TODO |
| `npm run format:check`                 | PASS / FAIL / BLOCKED / NOT RUN | TODO             | TODO    | TODO |
| `npm run test:coverage -- --runInBand` | PASS / FAIL / BLOCKED / NOT RUN | TODO             | TODO    | TODO |
| `git diff --check`                     | PASS / FAIL / BLOCKED / NOT RUN | TODO             | TODO    | TODO |
| iOS XCTest                             | PASS / FAIL / BLOCKED / NOT RUN | TODO tests       | TODO    | TODO |
| Android JVM tests（当前未建立）        | PASS / FAIL / BLOCKED / NOT RUN | TODO tests       | TODO    | TODO |
| Android instrumentation（当前未建立）  | PASS / FAIL / BLOCKED / NOT RUN | TODO tests       | TODO    | TODO |

覆盖率必须同时写百分比和命中/总数：

| statements | branches | functions | lines | 相对上一基线 |
| ---------- | -------- | --------- | ----- | ------------ |
| TODO       | TODO     | TODO      | TODO  | TODO         |

## 5. P：播放、模式和计数

| ID  | Environment | 参数/变体          | 状态    | 实际结果 | 证据 ID | 问题/备注 |
| --- | ----------- | ------------------ | ------- | -------- | ------- | --------- |
| P01 | TODO        | N=1                | NOT RUN | TODO     | TODO    | TODO      |
| P02 | TODO        | N=7                | NOT RUN | TODO     | TODO    | TODO      |
| P03 | TODO        | N=1/7              | NOT RUN | TODO     | TODO    | TODO      |
| P04 | TODO        | N=2                | NOT RUN | TODO     | TODO    | TODO      |
| P05 | TODO        | N=2                | NOT RUN | TODO     | TODO    | TODO      |
| P06 | TODO        | 1/108/1,000/10,000 | NOT RUN | TODO     | TODO    | TODO      |
| P07 | TODO        | 5,000,000/非法输入 | NOT RUN | TODO     | TODO    | TODO      |
| P08 | TODO        | 手动重选           | NOT RUN | TODO     | TODO    | TODO      |
| P09 | TODO        | 主动/意外退出      | NOT RUN | TODO     | TODO    | TODO      |
| P10 | TODO        | 3 轮高频操作       | NOT RUN | TODO     | TODO    | TODO      |

## 6. S：同步模式

| ID  | Environment | 参数/变体                | 状态    | 实际结果 | 证据 ID | 问题/备注 |
| --- | ----------- | ------------------------ | ------- | -------- | ------- | --------- |
| S01 | TODO        | 中段加入                 | NOT RUN | TODO     | TODO    | TODO      |
| S02 | TODO        | ≥3 周期                  | NOT RUN | TODO     | TODO    | TODO      |
| S03 | TODO        | <、=、>1.5 秒            | NOT RUN | TODO     | TODO    | TODO      |
| S04 | TODO        | App/远程 seek            | NOT RUN | TODO     | TODO    | TODO      |
| S05 | TODO        | 两台同型号               | NOT RUN | TODO     | TODO    | TODO      |
| S06 | TODO        | iOS+Android/A05/A04/长曲 | NOT RUN | TODO     | TODO    | TODO      |
| S07 | TODO        | 时钟/时区                | NOT RUN | TODO     | TODO    | TODO      |
| S08 | TODO        | A05 21 遍                | NOT RUN | TODO     | TODO    | TODO      |
| S09 | TODO        | 其余 20 首               | NOT RUN | TODO     | TODO    | TODO      |

## 7. L：生命周期、系统控制和硬件

| ID  | Environment | 参数/变体            | 状态    | 实际结果 | 证据 ID | 问题/备注 |
| --- | ----------- | -------------------- | ------- | -------- | ------- | --------- |
| L01 | TODO        | 锁屏 30 分钟         | NOT RUN | TODO     | TODO    | TODO      |
| L02 | TODO        | Android 后台/划掉 UI | NOT RUN | TODO     | TODO    | TODO      |
| L03 | TODO        | 默认/严格省电        | NOT RUN | TODO     | TODO    | TODO      |
| L04 | TODO        | iOS 后台 30 分钟     | NOT RUN | TODO     | TODO    | TODO      |
| L05 | TODO        | 来电/中断            | NOT RUN | TODO     | TODO    | TODO      |
| L06 | TODO        | 短/长期抢焦点        | NOT RUN | TODO     | TODO    | TODO      |
| L07 | TODO        | 有线/蓝牙            | NOT RUN | TODO     | TODO    | TODO      |
| L08 | TODO        | Service/进程重建     | NOT RUN | TODO     | TODO    | TODO      |
| L09 | TODO        | 分享完成/取消/失败   | NOT RUN | TODO     | TODO    | TODO      |
| L10 | TODO        | A05 21 遍/≥2 小时    | NOT RUN | TODO     | TODO    | TODO      |

## 8. U：布局、可用性和无障碍

| ID  | Environment | 参数/变体              | 状态    | 实际结果 | 证据 ID | 问题/备注 |
| --- | ----------- | ---------------------- | ------- | -------- | ------- | --------- |
| U01 | TODO        | 高/宽>1                | NOT RUN | TODO     | TODO    | TODO      |
| U02 | TODO        | 高/宽=1、=0.75、区间内 | NOT RUN | TODO     | TODO    | TODO      |
| U03 | TODO        | 高/宽<0.75             | NOT RUN | TODO     | TODO    | TODO      |
| U04 | TODO        | 旋转/分屏              | NOT RUN | TODO     | TODO    | TODO      |
| U05 | TODO        | 刘海/手势/圆角         | NOT RUN | TODO     | TODO    | TODO      |
| U06 | TODO        | 5,000,000/大累计       | NOT RUN | TODO     | TODO    | TODO      |
| U07 | TODO        | 关怀模式               | NOT RUN | TODO     | TODO    | TODO      |
| U08 | TODO        | 100%/135%/200%         | NOT RUN | TODO     | TODO    | TODO      |
| U09 | TODO        | VoiceOver/TalkBack     | NOT RUN | TODO     | TODO    | TODO      |
| U10 | TODO        | Reduce Motion/对比度   | NOT RUN | TODO     | TODO    | TODO      |

## 9. 安装、升级、资源和发布后冒烟

| 场景                     | Environment | 状态    | 实际结果 | 证据 ID | 问题/备注 |
| ------------------------ | ----------- | ------- | -------- | ------- | --------- |
| 全新安装默认值           | TODO        | NOT RUN | TODO     | TODO    | TODO      |
| 0.6.0 → 当前             | TODO        | NOT RUN | TODO     | TODO    | TODO      |
| 0.7.0 → 当前             | TODO        | NOT RUN | TODO     | TODO    | TODO      |
| 21 首文件名/哈希/可播放  | TODO        | NOT RUN | TODO     | TODO    | TODO      |
| 无网络启动和播放         | TODO        | NOT RUN | TODO     | TODO    | TODO      |
| 真实分发渠道安装后的冒烟 | TODO        | NOT RUN | TODO     | TODO    | TODO      |

## 10. 证据索引

| Evidence ID | 测试 ID | 采集时间 | 文件/格式 | 大小 | SHA-256 | 受控 URI | 脱敏/审阅 | 访问与保留期 |
| ----------- | ------- | -------- | --------- | ---- | ------- | -------- | --------- | ------------ |
| EV-TODO-001 | TODO    | TODO     | TODO      | TODO | TODO    | TODO     | TODO      | TODO         |

不要在此粘贴密钥、密码、签名私钥、真实用户诊断全文或含敏感信息的临时本机路径。

## 11. 缺陷、阻塞和例外

| Issue ID | 关联测试 | 严重级别 | 状态 | 复现摘要 | 发布影响 | 负责人/计划 |
| -------- | -------- | -------- | ---- | -------- | -------- | ----------- |
| TODO     | TODO     | TODO     | TODO | TODO     | TODO     | TODO        |

已接受的 FAIL/BLOCKED/NOT RUN（逐项写风险、理由、批准人和日期）：

- TODO

## 12. 结论

- 自动化结论：TODO
- iOS/Android 原生测试结论：TODO
- P/S/L/U 通过、失败、阻塞、未执行数量：TODO
- 是否满足 `RELEASE.md` 发布门槛：是 / 否 / 有条件
- 发布建议：GO / NO-GO / CONDITIONAL GO
- 已知用户影响：TODO
- 测试负责人签署/日期：TODO
- 发布负责人批准/日期：TODO

## 13. 更正说明（FINAL 后只能追加）

| 日期/作者 | 原值 | 更正值 | 原因 | 是否需要新执行记录 |
| --------- | ---- | ------ | ---- | ------------------ |
| 无        | —    | —      | —    | —                  |
