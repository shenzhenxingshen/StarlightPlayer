# 电脑版 0.1.0 离线安装包构建验收

- 状态：DRAFT，测试预览制品；不是正式发行批准。
- 分支：`codex/desktop-mvp`，不合并手机主分支、不发布 GitHub Release。
- 范围：删除播放页两条说明文字，封装 21 首音频、libmpv 及平台依赖。
- 手机播放实现、同步时长和音频文件均未修改。共享 `PlayMode` 仅拆为纯类型，原手机存储模块继续兼容导出。
- 构建与复现：[电脑版离线打包](../desktop/PACKAGING.md)。

## 1. 已执行的源码验证

| 检查 | 结果 | 边界 |
| --- | --- | --- |
| 手机版 Jest | 33 suites / 331 tests 通过 | mock 回归，不是手机真机验收 |
| 手机版 `typecheck:app` | 通过 | 类型检查 |
| 桌面 `npm test` | 31 项通过 | 播放、任务、纯类型依赖边界、Debian 许可证收集、macOS 最低版本解析 |
| 桌面 TypeScript / Vite | 通过 | 不等于各系统 WebView 已人工检查 |
| UI 自动化 | 两种同步状态下均无被删除的提示；五种窗口尺寸通过 | Chromium + mock IPC |

播放页仍保留关怀模式标识。同步开关、同步时禁止 seek、每首先完成 N 遍的判断没有因删除文案而改变。

## 2. 安装包验证方法

每个平台依次执行：

1. 从手机版同源目录复制音频，不转码；核对 21 首源文件 SHA-256。
2. 收集该平台 libmpv 和非系统库，保存版本与版权清单。
3. 使用 staging 内库逐首解码，检查播放进度增长。
4. 构建原生安装包。
5. macOS 只读挂载 DMG；Windows 在一次性 CI runner 静默安装 EXE；Linux 解包 AppImage。
6. 对安装包内音频和库逐文件复核 SHA-256。
7. 清除开发库路径、限制 PATH 为系统目录，使用包内资源再次逐首解码播放。连续销毁并重建引擎 5 次，每次核对偏好持久化、恢复不自动播放，并再次播放 A05。
8. 验收成功后才上传安装包、资源清单与 SHA256SUMS。

`bundle_smoke` 使用 `ao=null` 和独立临时数据，不碰用户现有预览数据。它证明包内引擎和 21 首资源可用，**不证明扬声器声学效果、同步换遍无吞音、UI/托盘/媒体键全部通过**。

## 3. 首轮构建暴露的问题

- `537ed4b`：桌面 `ScheduledTask` 类型间接引用手机版 MMKV 存储，干净桌面构建环境失败。`1c2cdd7` 拆出纯类型并增加完整 TypeScript 文件图检查；未通过安装手机依赖掩盖问题。
- `1c2cdd7`：Linux runner 的可选 `NEWS.gz` 文档链接失效，递归收集整个文档目录失败。`cfb494b` 改为收集 Debian 必需的 `copyright`；版权文件缺失仍然失败，新增回归测试。
- `7598ad3`：发现 macOS 包内库要求 15.0，而 App 默认声明 10.13。改为从全部 Mach-O 库读取最低版本并取最高值，写入打包配置；解包后再验证 `Info.plist` 与资源清单一致。该修复不涉及手机版 iOS 部署设置。
- `cfb494b` 的 Windows 安装后测试：21 首均成功解码，销毁并重建引擎时发生 `GGML_ASSERT(prev != ggml_uncaught_exception)`，进程返回 `3221226505`。GGML 的静态初始化会注册进程级 C++ terminate handler，动态库卸载后再加载存在该断言风险。`73c58bd` 使用 libloading 的 Windows `pin()`，让同一路径的播放库及其依赖驻留到进程退出；每个 mpv handle 仍正常销毁，并非保留播放线程或让暂停音频继续运行。新增连续 5 次销毁、重建、恢复和播放回归，不以删除失败测试代替修复。
- 本机 Apple Silicon DMG 已独立通过解包、哈希、21 首解码及恢复测试。它由 macOS 27 开发机生成，不作为 macOS 15 基线制品交付。

## 4. 本轮候选与 CI 结果

四个平台使用同一源码提交 `73c58bdcc0b65c35b62729fd140e7c84b5211c91`，桌面版本 `0.1.0`。后续仅补文档的提交不会改变此批安装包身份。

[GitHub Actions run 43656848776](https://github.com/shenzhenxingshen/StarlightPlayer/actions/runs/43656848776) 四个 job 均为 SUCCESS，执行于 2026-11-15 00:10～00:20 UTC（北京时间 08:10～08:20）。下列“播放库数量”只统计 manifest 中的 `runtime/lib`，不包括系统 WebView 或 AppImage 外层所有 UI 库。

| 平台 | 精确候选记录 | 音频 / 播放库 | 安装后资源及解码 | 5 次宿主重建 |
| --- | --- | --- | --- | --- |
| macOS ARM64 | [DMG、大小与 SHA-256](2026-11-15-v0.1.0-macos-arm64-73c58bd-r01.md) | 21 / 50 | PASS | PASS |
| macOS Intel | [DMG、大小与 SHA-256](2026-11-15-v0.1.0-macos-x64-73c58bd-r01.md) | 21 / 48 | PASS | PASS |
| Windows x64 | [EXE、大小与 SHA-256](2026-11-15-v0.1.0-windows-x64-73c58bd-r01.md) | 21 / 265 | PASS | PASS |
| Linux x64 | [AppImage、大小与 SHA-256](2026-11-15-v0.1.0-linux-x64-73c58bd-r01.md) | 21 / 223 | PASS | PASS |

每个平台记录只绑定一个安装包。制品与清单从同一轮 CI 下载，交付前在本机复核 `SHA256SUMS.txt`，并把清单中的 21 首文件哈希与仓库源音频对照。两个 Mac DMG 额外在本机只读挂载，逐文件核对音频/库、清单身份和 `LSMinimumSystemVersion=15.0`，未启动程序或覆盖用户预览数据。

Windows 安装后的重建测试于 00:20:22Z 完成 5/5，无先前 GGML 断言；该结果直接覆盖了本轮修复的失败路径。它不等于在全新 Windows 10/11 上断网首次安装已经验收。

用户操作见[电脑版安装与试用](../desktop/INSTALL.md)。当前仅交付私人测试包，未创建公开 Release、合并 `main` 或更新 116 下载站。

## 5. 未验证与交付限制

- 本轮不重新声称完成 A04/A05 最终包 21 遍或真实声卡无吞音；历史测试范围见[桌面技术预览记录](2026-11-15-desktop-preview.md)。
- 全新目标电脑断网安装、硬件输出、蓝牙、实际系统媒体键、睡眠恢复、多台设备同步仍需实机测试。
- macOS 暂提供 Apple Silicon / Intel 两个包，不是 Universal。
- macOS 未做 Developer ID 公证；Windows 未做发行代码签名。
- Linux 以 Ubuntu 24.04 / glibc 2.39 为基线，不支持“任意旧发行版”；操作系统及音频/显示驱动不是应用随包替换的对象。
- GitHub Actions artifacts 保留 30 天，测试日志和制品需要在过期前归档；Git 仓库只提交摘要和构建脚本，不提交大体积二进制。
