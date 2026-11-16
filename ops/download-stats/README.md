# 下载站统计（Android v1.1 + 电脑版 v0.1.0）

2026-11-15 从 116 下载服务器现有脚本接管，代码、页面、测试一起维护。只涉及下载网站，不影响 App 播放或电脑版程序。

## 入口与部署映射

| 仓库文件 | 服务器路径 |
| --- | --- |
| `update_stats.py` | `/var/www/app-download/starlight/v1.1/update_stats.py` |
| `stats.html` | `/var/www/app-download/starlight/v1.1/stats.html` |
| 生成的统计 JSON（不入库） | `/var/www/app-download/starlight/v1.1/api/stats.json` |

统计页：<http://116.196.86.84/starlight/v1.1/stats.html>。Nginx 站点根 `/var/www/app-download`；读取 `/var/log/nginx/access.log*`（包括 `.gz`），只精确匹配脚本资产清单内的下载路径，可带 query string。

沿用 root 的 cron，不另加重复任务：

```cron
*/5 * * * * /usr/bin/python3 /var/www/app-download/starlight/v1.1/update_stats.py >/dev/null 2>&1
```

服务器 Python 3.12，沿用已经安装的 `qqwry` 和 `/var/www/app-download/qqwry.dat`；本次不更新 IP 库或安装依赖。IP 库用于地域估算，不能证明实际所在地。原 v1.0 统计任务不变。

## 统计口径

- 合计 = Android v1.1 APK + 电脑版 v0.1.0 四个 ZIP；iOS/TestFlight/App Store 不在本站服务器下载，标为不可观测，不伪造数量。
- Android：保留旧脚本的同一 IP + 本地日历固定 5 分钟窗口，成功 `GET`、状态 200/206 计一次；为避免改变历史口径，APK 小字节请求仍按旧规则计数。手机品牌算法沿用原脚本，图表改名为「APK 下载设备 / 浏览器分布」，不是安装设备分布。
- 电脑版：按同一 IP、同一安装包，以 **30 分钟无活动间隔** 划分下载会话。小于 30 分钟的相邻有效请求合并；恰好 30 分钟另计。先按实际时间排序，跨日志、跨午夜及跨时区均有效。不同架构包分别计数。
- 只计成功 `GET` 的 200/206；过滤 HEAD、错误状态、UA 包含 `Starlight-Stats-Probe/` 的测试请求，以及电脑版发送字节数 ≤ 1024 的响应。后续人工探测均应显式携带这个 UA。
- `206` 说明发送部分内容，并不说明下载完毕；当前 combined 日志没有 Range 区间，**无法严格拼出完整下载**。不将发送字节相加冒充完整文件，也不把去重请求数叫安装人数。
- 同一 NAT 出口的不同用户可能被合并；间隔超过 30 分钟的续传可能另计；中途取消但已发送 > 1KB 的请求仍可能计数。浏览器缓存不经过本站，也无法统计。
- 地域图合并两端，品牌图仅 APK；IP 和完整 UA 仅在扫描内存中处理，输出 JSON 不含个人明细。
- 从服务器当前保留的日志重算，而不是累加上一次 JSON，所以重复执行幂等。日志删除将缩短历史范围；不得声称是永久累计台账。当前服务器 logrotate 保留期很长，配置 `rotate 36500`、`nocompress`，本次未修改。
- IP 库加载失败、日志不可读/损坏时不发布部分结果；单行不可解析以聚合 diagnostics 记录。新 JSON 在相同目录生成临时文件后原子替换，避免网页读取半份 JSON。`last_updated` 是成功生成时间，不再冒用日志文件 mtime。
- 页面请求失败不归零；保留已有数据并提示失败。数据超过 15 分钟显示陈旧提示，页面每 5 分钟刷新一次。图表 CDN 不可用不影响数字表格。

新版本发布时必须人工更新 `ARTIFACTS`/版本常量、页面范围及测试，不能用泛化 `.zip` 匹配把无关文件/旧版本纳入。

## 测试和试算

在仓库根目录执行，无需安装额外测试依赖：

```bash
python3 -m unittest discover -s ops/download-stats/tests -p 'test_*.py' -v
node --test ops/download-stats/tests/stats-page.test.cjs
```

服务器试算（不会写统计文件）：

```bash
STARLIGHT_STATS_DRY_RUN=1 /usr/bin/python3 /var/www/app-download/starlight/v1.1/update_stats.py
```

维护人部署前需走备份、试算、回滚准备和通知流程；备份必须放在非 Web 目录。不要直接在网站公开目录存放原始日志或 IP 列表。新文件先上传到备份/暂存目录，确认 hash 后通过相邻临时文件 + `mv` 安装，先脚本与 JSON、再页面；不需要重启 Nginx。

至少验证：

1. 新脚本 `android_downloads` 与旧脚本在同批日志上生成的 `total_downloads` 一致，品牌汇总一致。
2. 合计等于两端之和，电脑版等于四个架构之和；历史 HEAD/1KB 探针不进入数字。
3. 执行两次数据数量不增长，JSON 权限为 0644。
4. 统计页/API 返回 200，无缓存；原下载页面及包 HEAD 均正常。
5. 桌面和手机宽度无横向溢出；API 失败、图表失败和陈旧数据显示正确。
6. 等待下一次 cron 自动更新，确认不是只成功手动生成一次。

此次变更的服务器备份：`/var/backups/starlight/desktop-stats-20261115/`。备份包含旧脚本、旧页面、旧 JSON、cron 快照及回滚脚本，不含安装包副本（本次不改安装包）。

回滚（恢复 APK-only 页面和统计逻辑，不撤下电脑版下载）：

```bash
ssh root@116.196.86.84 'sh /var/backups/starlight/desktop-stats-20261115/ROLLBACK.sh'
```

回滚后原 cron 会继续按旧脚本每 5 分钟重算；若已有新任务正在执行，等它结束后再次执行回滚并验证 JSON。SSH 鉴权沿用维护者现有配置，文档不保存凭据。

## 2026-11-15 上线验收

- 09:24（Asia/Shanghai）完成脚本、JSON 与页面部署；未重启 Nginx，未修改安装包、下载路径或原 cron。
- 服务器历史日志试算：Android 为 1,704，与旧脚本的总数及品牌汇总一致；电脑版为 1（Windows x64），合计 1,705。其余三个架构为 0；四次 1KB 电脑版校验请求被排除。这是验收时快照，不是固定数字。
- Python 16 项、页面 JavaScript 6 项测试全部通过；重复扫描的计数不增长。
- 页面、JSON、两个下载入口和 APK / 四个 ZIP 的 HEAD 均返回 200；页面及 JSON 返回禁止缓存的响应头；线上 HTML 与仓库候选文件 SHA-256 一致。
- Playwright 实际打开线上页面，检查 1440×1000 与 390×844 视口：数字和四架构明细正确，页面宽度未溢出，无数据/图表错误提示；三张图表实例成功建立，浏览器无控制台错误。截图保存在本地忽略目录 `output/playwright/stats-{desktop,mobile}-20261115.png`，未作为逐像素视觉审查结论。
- 09:25:01 的 cron 执行记录及 JSON 更新时间均已核对，确认自动更新 schema v2 成功，并非仅手工生成一次。
- 原脚本、页面、JSON 与 cron 快照已保存在上述非公开备份目录，回滚脚本已检查；本项目未指定运维通知群，开始及完成通知记录在本次维护会话。
