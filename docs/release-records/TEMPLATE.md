# StarlightPlayer 发布记录（模板）

> 复制后填写，不要直接修改模板。详细 SOP 见 [`../RELEASE.md`](../RELEASE.md)。

## 1. 身份

| 字段                           | 值                                         |
| ------------------------------ | ------------------------------------------ |
| 状态                           | DRAFT / FINAL / SUPERSEDED / RECONSTRUCTED |
| 营销版本                       | TODO                                       |
| Git commit（完整 40 位）       | TODO                                       |
| 分支 / annotated tag           | TODO                                       |
| 发布负责人                     | TODO                                       |
| 冻结、批准、发布时间（含时区） | TODO                                       |
| 替代/被替代记录                | 无 / TODO                                  |

## 2. 平台制品

| 平台            | build | 文件/受控制品 ID | 字节数 | SHA-256 | 签名证书指纹 | 最低系统/设备族                      |
| --------------- | ----- | ---------------- | ------ | ------- | ------------ | ------------------------------------ |
| Android AAB     | TODO  | TODO             | TODO   | TODO    | TODO         | minSdk TODO                          |
| Android APK     | TODO  | TODO             | TODO   | TODO    | TODO         | minSdk TODO                          |
| iOS Archive/IPA | TODO  | TODO             | TODO   | TODO    | TODO         | MinimumOSVersion/UIDeviceFamily TODO |

不得写入签名密码、私钥或 Provisioning Profile。iOS 必须记录 Archive 内最终值，不能只抄 Build Settings。

## 3. 测试与批准

- Android test-run：TODO
- iOS test-run：TODO
- 未执行/失败/阻塞项：TODO
- 已接受风险、批准人和日期：TODO
- GO / NO-GO / CONDITIONAL GO：TODO

## 4. 分发状态

| 渠道                         | 提交/上传时间 | 状态 | 版本/build | 渠道 URL/记录 ID | 核验人/时间 |
| ---------------------------- | ------------- | ---- | ---------- | ---------------- | ----------- |
| Android 商店                 | TODO          | TODO | TODO       | TODO             | TODO        |
| Android 自建下载             | TODO          | TODO | TODO       | TODO             | TODO        |
| App Store Connect/TestFlight | TODO          | TODO | TODO       | TODO             | TODO        |
| App Store 公布               | TODO          | TODO | TODO       | TODO             | TODO        |

“上传成功”“提交审核”“审核通过”“可下载”是不同状态，必须分开记录。自建下载还要核对服务器文件哈希与本地候选一致。

## 5. 元数据与内容

- 用户更新说明：TODO
- 商店截图/素材 ID 与候选 build：TODO
- 隐私政策/App Privacy/年龄分级/加密声明：TODO
- 音频授权确认人和受控记录 ID：TODO
- 下载页版本、文件大小、SHA-256 与统计说明：TODO

## 6. 发布后冒烟与回滚

- 真实渠道安装的设备/系统：TODO
- 版本、升级、A05/长曲、后台/锁屏验证：TODO
- 监控/用户反馈窗口：TODO
- 上一稳定制品与回滚 URI：TODO
- 停止推广/回滚条件及执行人：TODO

## 7. 更正说明

`FINAL` 后只能追加：

| 日期/作者 | 原记录 | 更正 | 证据 | 是否产生新候选 |
| --------- | ------ | ---- | ---- | -------------- |
| 无        | —      | —    | —    | —              |
