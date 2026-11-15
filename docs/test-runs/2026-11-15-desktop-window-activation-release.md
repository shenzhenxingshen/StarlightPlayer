# 2026-11-15 电脑版窗口唤起修订：构建与发布记录

状态：源码已提交并推送；四平台 CI 构建、安装后验证通过。**公开下载站已于北京时间 2026-11-15 23:18:56 更新，23:19:50 完成首轮下载与备份验证。** 版本仍为 `0.1.0`，请按源码提交和 SHA-256 区分不同修订。

## 范围与源码

- 分支：`codex/desktop-mvp`；本次没有合并主分支。
- 安装包源码提交：`5ae16f84acc0e6d6c7feb8f4cb049c4c484b4e43`。
- 提交说明：`fix(desktop): restore background window on app activation`。
- [CI run 43724645546](https://github.com/shenzhenxingshen/StarlightPlayer/actions/runs/43724645546)：四个 job 全部 `success`，最后完成于北京时间 2026-11-15 22:42:37。
- 本次只修改桌面窗口激活、单实例通信和相关测试，没有修改播放业务状态机、同步算法、N 遍规则、任务配置、音频文件或手机版。
- 保留 Windows 启动不弹出终端的上一修订；后台再次启动只恢复原窗口，不新建播放任务。实现及本地 GUI 证据见[窗口唤起测试记录](2026-11-15-desktop-window-activation.md)。

## 构建与验证

| 目标 | CI 系统 | 安装包形式 | 打包的音频 / 原生库文件数 | 结果 |
| --- | --- | --- | --- | --- |
| macOS ARM64 | macOS 15 | DMG | 21 / 50 | 成功 |
| macOS x64 | macOS 15 Intel | DMG | 21 / 48 | 成功 |
| Windows x64 | Windows Server 2022 | NSIS EXE | 21 / 265 | 成功 |
| Linux x64 | Ubuntu 24.04 | AppImage | 21 / 223 | 成功 |

每个平台均执行：

1. `npm test`：34/34 通过；随后 TypeScript/Vite 构建与 21 首音频资产检查通过。
2. `cargo test --locked --manifest-path src-tauri/Cargo.toml --no-default-features`：4 通过、5 默认忽略。默认忽略用例没有计入通过数；本地另行执行的两个原生契约测试见前述测试记录。
3. 打包前调用实际 libmpv，逐首验证 21 首音频能够开始解码并推进播放进度；额外执行 A05 的 5 次 Host 销毁/恢复，验证偏好持久化且重启不自动播放。
4. 构建后挂载 DMG、实际安装 NSIS 或解包 AppImage，核对完整资源清单及全部文件哈希，再对解包后的播放库和音频重复第 3 项。
5. 安装后播放测试去除开发机的 libmpv 环境变量，并限制 `PATH`，避免用 Homebrew/MSYS 的播放库补齐遗漏。

播放 smoke test 使用 `ao=null`，每首确认进度超过 50ms 后切换，**不是完整播放 21 首，也不是同步循环 21 遍测试**；不能据此声称扬声器无缝、蓝牙无延迟或断网全新系统首次安装已经验收。

### Windows 安装后窗口回归

北京时间 22:41:28–22:41:43，已验证实际安装后的主程序为 `WINDOWS_GUI (2)`，UI 原生 IPC 就绪且没有控制台。随后验证关闭到后台、隐藏后再次运行 EXE、隐藏/最小化后打开真实 `.lnk`、前台重复打开 `.lnk`；每轮均恢复同一窗口，原 PID `6628` 和窗口句柄 `131626` 不变，配置哈希不变、只有一次 `host-start`。

这是 CI 中通过 Windows Shell 启动快捷方式的实测，不等同于 Windows 10/11 真机桌面双击、固定任务栏入口或托盘鼠标点击。空闲状态窗口回归也不能替代播放中声音连续性的验收。

### 本地补充核验

两个下载到本机的 Mac DMG 均通过 `hdiutil verify`。每个原安装包均与 CI 的 `SHA256SUMS.txt` 匹配，清单源码统一为 `5ae16f8`，21 首音频与仓库逐个哈希、字节数一致。四个 ZIP 已全部通过本地 `unzip -t` CRC 检查，并通过服务器 Python 标准库 `zipfile.testzip()` 的逐项 CRC 检查。

## 制品清单

ZIP 内含对应安装包、安装指引、安装包校验清单、`runtime-manifest.json`、`THIRD_PARTY.md`。此处的 ZIP 哈希与原安装包哈希不同；请勿混用。以下四个 ZIP 已发布到[电脑版下载页](http://116.196.86.84/starlight/desktop/v0.1.0/)。

| 平台 | ZIP 字节数 | 原安装包字节数 |
| --- | ---: | ---: |
| macOS ARM64 | 149,595,820 | 149,568,811 |
| macOS x64 | 152,208,269 | 152,181,848 |
| Windows x64 | 424,750,326 | 424,696,187 |
| Linux x64 | 280,080,025 | 280,009,208 |

ZIP SHA-256：

```text
9d05538a939fb5e515172985ceefcdba358407a596ca50088079f1d38edc1966  Starlight_Desktop_0.1.0_macos-arm64.zip
ce805251c49a3931fada557c5b68dd2a6e3381037cdb287bc7659ffa2e19bbd1  Starlight_Desktop_0.1.0_macos-x64.zip
80912bbae9dd8944daa211400c522fc09e0595d3ca850a5a660c6aeb46fe944b  Starlight_Desktop_0.1.0_windows-x64.zip
d150ebd408a5f1408666240aedcb632780503581606b743fe49ff03d98f4c4e7  Starlight_Desktop_0.1.0_linux-x64.zip
```

原安装包 SHA-256：

```text
4e1ca93bfb19a58e33d36a9c1a73273b69104754403d88987d280e244fa5f344  Starlight_Desktop_Preview_0.1.0_aarch64.dmg
6f8abaf789850ad9501284493401c8b03c0939c61e0e82e94552e15722226b96  Starlight_Desktop_Preview_0.1.0_x64.dmg
452ffc384c483b46fdf0349776d80aa18b025e39b78a90855ba216f6d40cb577  Starlight_Desktop_Preview_0.1.0_x64-setup.exe
6e7384d11ce7d22c636b20ee3669851d33043714f8b6eb57065b1495ed246821  Starlight_Desktop_Preview_0.1.0_amd64.AppImage
```

四个平台均为本轮新构建，没有沿用上一轮 Mac/Linux 安装包。GitHub Actions 制品保留期为 30 天；本地 ZIP 包含新增安装指引，哈希不同于 GitHub 下载用的外层 artifact ZIP。

## 下载站发布结果

目标仍为 `/starlight/desktop/v0.1.0/`。保留四个 ZIP 的原文件名，页面链接追加构建标识 `?build=5ae16f8`；不调整下载统计规则，不恢复手机版 v1.1 页面中已隐藏的电脑版入口。

用户已确认以本聊天作为发布通知渠道，并由用户担任回滚联系人。按 `change-window` / `devops-engineer` 检查要求，发布前、发布后均已在聊天发送通知。没有向其他群或人员发送消息。

实际执行：

1. 四个 ZIP、`index.html`、`INSTALL.md`、`SHA256SUMS.txt` 已上传到权限为 `700` 的非公开暂存目录 `/var/www/.starlight-staging-window-r03-5ae16f8`。
2. 第一次只读预检查因服务器未安装 `unzip` 停止，未替换公开文件、未创建备份。改用服务器已有 Python 标准库检查 ZIP CRC，没有安装额外依赖；随后完整预检查通过。
3. 北京时间 **23:16:57–23:18:56** 执行发布脚本，耗时 119 秒（含重复哈希、CRC、备份和发布后校验）。
4. 发布前重新核对暂存 SHA-256、ZIP CRC、线上旧文件清单及手机版页面哈希。将线上七个目标文件备份到 `/var/backups/starlight/window-activation-5ae16f8`；备份非空、七项旧哈希全部通过后才开始替换。
5. 使用同目录临时文件加重命名逐项替换，最后替换 `index.html`；脚本配置失败自动回滚，本轮未触发。未重启或修改 Web 服务。
6. 发布后全部新文件哈希再次通过，随后完成以下 HTTP 与服务检查。

### 下载与影响面验证

| 检查 | 结果与范围 |
| --- | --- |
| 外网四个 ZIP | HEAD 返回 200，字节数精确匹配；首尾各 1,024 字节 Range 返回 206，`Content-Range` 和字节内容均与本地 ZIP 一致 |
| 服务器本机完整 HTTP 下载 | 通过 nginx、指定公开站点 Host，完整读取四个 ZIP，逐一计算 SHA-256；全部与上方公开清单一致 |
| 外网页面及附件 | `index.html`、`INSTALL.md`、`SHA256SUMS.txt` 均返回 200，完整响应体哈希与待发布文件一致；四个下载链接和页面 SHA 均为本轮修订 |
| 旧包备份 | 发布后再次校验七个旧文件 SHA-256 全部通过；回滚脚本存在、非空且 Bash 语法检查通过 |
| 手机版与统计 | v1.1 主页、`stats.html`、`update_stats.py` 的文件哈希均与发布前一致；外网手机版页面内容相同，统计页返回 200 |
| Web 服务 | nginx 为 `active`；截至 23:19:50，错误日志仍为 51,680 字节，最后修改时间仍为 20:52:44，无本轮新增错误 |
| 磁盘空间 | 发布及保留备份后余量约 9.6GiB，使用率 75% |

外网 ZIP 验证为 HEAD/Range 抽样，**不是在外网重新下载四个完整 ZIP**；完整 HTTP 内容哈希在服务器本机验证，不混淆这两类证据。当前检查没有独立监控告警系统或真实用户下载验收，不声称覆盖它们。

所有 HTTP 验证使用 `Starlight-Stats-Probe/window-r03-5ae16f8` User-Agent；现有统计程序排除此类探测，避免计入用户下载。没有修改统计数据库、定时器或规则。

旧文件 SHA-256 清单用于发布前并发变更检查；ZIP 文件名保持不变，验收时须刷新下载页面，确认构建为 `5ae16f8` 后重新核对哈希。手机版页面内已隐藏的电脑版入口保持原样，用户可通过电脑版直达链接下载。

### 回滚

服务器备份目录已实际创建，权限为 `700`，包含七个旧文件、`EXPECTED_BEFORE.sha256` 和可执行回滚脚本。需要回退时，在 116 服务器执行：

```sh
bash /var/backups/starlight/window-activation-5ae16f8/rollback.sh
```

脚本先验证备份 SHA-256，再恢复四个 ZIP、安装指引、校验清单及页面，最后验证恢复后的全部哈希。备份已校验，但本轮没有实际执行回滚演练；预计同盘恢复约 1–2 分钟，未测得真实回滚耗时。不涉及统计数据库或用户播放数据。

本轮本地制品与发布、验证脚本保存在忽略目录 `release/desktop/0.1.0/window-activation-r03/`，不随 Git 克隆提供；服务器暂存目录及备份保留。后续接手者可从下载页取得本轮 ZIP，按源码提交重建，或在 CI 制品保留期内下载。执行回滚前应重新检查备份与哈希，并确认没有更晚的发布覆盖本轮。

## 仍需实机验收

- macOS Dock 和菜单栏图标实际点击、Windows 固定任务栏及托盘点击。
- Windows 10/11 真机、Linux 不同桌面环境。
- 播放 A05 时反复唤回窗口的音频回录、蓝牙与睡眠恢复。
- 全新目标系统的断网首次安装、真实声卡输出。
- 旧版彻底退出后的覆盖升级及个人数据保留。

用户升级提示：安装新文件不会替换仍在后台运行的旧进程。应先从旧版托盘/菜单栏彻底退出，再安装并启动本次修订；无需清空设置、任务或累计遍数。发行签名、公证及平台基线限制仍见[安装指引](../desktop/INSTALL.md)。
