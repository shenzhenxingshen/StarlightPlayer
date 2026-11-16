# 2026-11-16 任务时间拨轮与星期重复开发验证

## 状态与范围

- 状态：开发回归完成，**不是商店发布验收或全设备验证**。
- 分支：`codex/video-scheduled-programs`。分支名是历史名称，本次仅涉及音频任务，没有视频功能。
- 修改前基线：`4ea6122e0291351723344426b9a53eaf9fa549d9`；被测功能代码随本记录所在提交保存。执行测试时处于未提交工作树，提交前仅继续补充文档和格式整理。
- 未安装新依赖；未修改音频资源、版本号、同步取模算法、有效完整周期判定或四种播放模式。仍是每首完成 N 个有效周期后才执行播放模式。
- 手机版新增时、分、秒三列拨轮和周一至周日多选。桌面端只兼容星期数据、显示与调度，没有新增桌面拨轮/星期编辑器。

## 本次重点复核

- 星期采用 ISO `1～7`（周一至周日）。新任务默认每天；旧任务缺失字段迁移为每天并写回，不更改原启用状态；显式空数组、`null`、非法成员不能回退成每天。
- 自动触发才受启用状态、时刻和星期限制；手动播放始终可用。
- 同时刻的已启用任务只有在星期重叠时才冲突。覆盖全部 127 种非空组合、16,129 对交集判断。
- 自动触发使用原计划时间，拒绝未来、日期/时刻失配及超过 15 分钟窗口的触发；跨午夜按原计划日判断，点击通知不延长窗口。
- 拨轮滚动期间禁止保存；短拖动缺失惯性结束事件时有 200ms 空闲兜底；同时滚动不同列时不能覆盖另一列的新值。
- Android 桥接曾遗漏 `weekdays` 字段，会把部分星期任务传成旧格式“每天”。收尾时修复实际桥接投影，并增加独立 Java 回归，防止只测日历函数却漏测传输字段。
- iOS 同步注册串行化并检查调度代次；通知容量预算为 `60 - 其他待处理通知数`，优先注册最近提醒，容量不足明确提示。这不保证操作系统一定送达通知。

## 自动化与构建结果

| 项目 | 结果 | 证明范围 |
| --- | --- | --- |
| 移动端 Jest/RNTL | PASS：34 suites / 361 tests | JS/TS 业务、状态、组件事件与 mock 接口 |
| 应用与根目录 TypeScript | PASS | 两套类型检查 |
| Java 原生日历 | PASS：16 个断言 | 实际生产日历函数、选中日、DST 等边界 |
| Java 桥接字段投影 | PASS：14 个断言 | 实际投影函数保留星期、字段拷贝、旧格式及非法值 |
| Foundation 原生日历 | PASS：22 个断言 | iOS 实际头文件中的日期、星期、原计划时间还原 |
| 桌面 TS 测试 | PASS：36 tests | 共享任务策略与桌面兼容 |
| 桌面前端构建 | PASS | TypeScript / Vite 编译 |
| Rust 测试 | PASS：6；IGNORED：5 | 日期候选与现有单测；5 项 libmpv/live/null-output 测试未运行 |
| Android Debug | BUILD SUCCESSFUL | 离线 Gradle 构建，包含桥接修复；不是设备运行验收 |
| iOS Release Simulator | BUILD SUCCEEDED | 模拟器构建，不是签名 Archive |

### 覆盖率

全量 Jest 覆盖 32 个计入统计的源文件；排除范围与阈值未改变。

| 指标 | 命中 / 总数 | 比例 |
| --- | --- | --- |
| statements | 1,499 / 1,572 | 95.35% |
| branches | 1,005 / 1,116 | 90.05% |
| functions | 349 / 380 | 91.84% |
| lines | 1,376 / 1,428 | 96.35% |

新增 `TaskTimePicker` 为 94.11% / 77.77% / 91.3% / 96%（依次同上）；仍有未命中的布局/无障碍回调路径。该组件 9 个测试覆盖短拖动、惯性结束、两列并发、四档字体缩放、受控初始偏移及卸载清理，不能替代真实触摸或读屏体验。原生代码、解码器、系统后台机制不在 Jest 分母内，不宣称全 App 接近 100% 验证。

### 复现命令

在仓库根目录执行；使用已有依赖。JDK 21、Rust、Xcode、Pandoc 等工具应已安装。`JAVA_HOME` 和 Rust 的 `PATH` 按本机实际环境设置。

```bash
npm test -- --runInBand --watchman=false --coverage \
  --coverageReporters=json-summary --coverageReporters=text
npm run typecheck:app
npm run typecheck
bash scripts/test-task-calendars.sh
npm --prefix apps/desktop test
npm --prefix apps/desktop run build
npm --prefix apps/desktop run test:native
./android/gradlew -p android assembleDebug --offline
```

本次 iOS 目标为 iPhone 16 Pro / iOS 18 Simulator；复现时用本机设备 ID 替换 `SIMULATOR_UDID`：

```bash
xcodebuild -workspace ios/StarlightPlayer.xcworkspace \
  -scheme StarlightPlayer -configuration Release \
  -destination "platform=iOS Simulator,id=${SIMULATOR_UDID}" \
  -derivedDataPath tmp/task-weekdays-ios \
  IPHONEOS_DEPLOYMENT_TARGET=15.0 CODE_SIGNING_ALLOWED=NO build
```

`15.0` 仅是当前 Xcode 模拟器构建命令的临时覆盖值。仓库 Podfile / iOS Target 的最低版本仍为 **13.4**；本次未验证 iOS 13/14，也不能凭这个 Simulator 构建宣称旧版本可安装。正式发布前须检查 Archive 的 `MinimumOSVersion`，不能悄悄提高发布最低版本。

## Simulator 检查：部分完成

通过 iPhone 16 Pro / iOS 18 的无障碍树与操作结果确认：

- 存在“启动时 / 启动分 / 启动秒”三列 adjustable 控件。
- 新任务默认七天全部选中。
- 保存“08:00、仅周二”的测试任务，再打开后星期仍保留。
- 空星期选择被拒绝。
- 周一手动播放“仅周二且已关闭”的任务可以启动。
- 检查结束后音频已暂停，测试设备中四条任务均关闭。

尝试通过自动化滚动秒列未观察到值变化，因此**原生拖动/快速惯性滚动未验证通过**。已有截图未完成视觉检查，未作为验收截图收录。无障碍树存在也不等于 VoiceOver/TalkBack 体验已验收。

## 证据位置与限制

本机保存了以下被 Git 忽略的原始日志；本记录保留结果与 SHA-256，日志没有上传为长期可下载证据。后续接手者可按上述命令复跑；哈希本身不能代替原始日志。

| 本机相对路径 | SHA-256 |
| --- | --- |
| `tmp/task-weekdays-validation/jest.log` | `1afc3e5365cd62505551ed92ec1490c5c3b54d999d5ac82cd6ec4841660d31fd` |
| `tmp/task-weekdays-validation/android-build.log` | `2ff859620f937a3d2a25d0ce8fce46b2deaa41059511dc681aa5e8b5a09548b5` |
| `tmp/task-weekdays-validation/ios-build.log` | `657c57ce2ffdf484ba90feb74ee8d860ba77abbc7d0bfd86bbd0c0928c3dfcd3` |

其他检查在终端返回结果，未另外归档原始日志。构建产物位于 `android/app/build/outputs/apk/debug/app-debug.apk` 和 `tmp/task-weekdays-ios/Build/Products/Release-iphonesimulator/`，未提交、未发布。

## 发布前仍需补测

1. iOS/Android 真正拖动、快速甩动、两列交替操作、边界 `00/23/59`、最大字体、横竖屏和 VoiceOver/TalkBack；确认显示值与保存值一致。
2. Android 真实 AlarmManager、授权/拒绝、进程重建、后台/省电、修改时刻和星期后旧闹钟失效、午夜延迟；本次没有 instrumentation 或 Android 模拟器运行结论。
3. iOS 通知容量、送达/点击、前后台和挂起/终止场景、旧通知失效、DST 的真实系统调度；Foundation 计算测试不代替系统集成。
4. iOS 13/14 真机或对应 runtime，及正式 Archive 的最低系统版本。
5. 真机长时、蓝牙/锁屏、多设备同步听感；本次没有音频文件或引擎改动，但仍须按发布矩阵回归。
6. 更新带标注的拨轮/星期截图、逐页检查新版 PDF。当前 Markdown / 自包含 HTML 已说明开发功能和历史截图；PDF 保留旧快照，未假称已同步。

详见 [测试手册](../TESTING.md) 和 [设备矩阵](../DEVICE_TEST_MATRIX.md)。上述缺口不阻止开发分支提交，但不应据此直接发布正式安装包。
