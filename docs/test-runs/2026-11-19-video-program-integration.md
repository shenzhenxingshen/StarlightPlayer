# 可编辑视频任务与压缩素材开发验证

状态：开发阶段验证记录（不是发行候选验收）。
日期：2026-11-19（Asia/Shanghai）。
分支：`codex/video-scheduled-programs`；基线：`0d75f287ff98012ae0a4fc10670850e4eaa9020a`。
媒体revision：`video-2026-11-18-v1`。

## 已执行与证据边界

| 项目                                 | 结果                       | 说明                                                            |
| ------------------------------------ | -------------------------- | --------------------------------------------------------------- |
| 六份视频压缩                         | PASS                       | 119,673,023→23,350,549字节，减少80.5%；原件未改                 |
| 完整解码/帧数/时长/AAC包对比         | PASS                       | 六份均通过；摘要见下表，哈希在manifest                          |
| SSIM                                 | PASS（指标）               | 0.990690～0.994101，不替代人工画质验收                          |
| TypeScript                           | PASS                       | `npm run typecheck`                                             |
| Jest                                 | PASS                       | 37 suites、404 tests；包括原音频回归；mock不验证原生输出        |
| 早期共享核心回归                     | PASS                       | 重新编译当前核心后旧原型34 tests通过；旧原型仍使用四段素材      |
| 定向ESLint                           | PASS（有警告）             | 0 errors、12 warnings；inline style/no-void等，未声称全仓零警告 |
| Android Kotlin                       | PASS                       | offline `:app:compileDebugKotlin`，ExoPlayer弃用警告仍在        |
| iOS Release模拟器构建                | PASS                       | Xcode27 SDK，arm64；命令行15.0 override用于当前工具链           |
| iOS打包素材                          | PASS                       | bundle/video与仓库清单核对                                      |
| iOS原生真实播放                      | PASS（限定场景）           | 见下节；独立测试壳调用生产原生源代码                            |
| 集成App界面可访问性树                | PARTIAL                    | 看到了视频列表、编辑器、拨轮、星期、5项序列/48遍/总时长         |
| 集成App视频全流程E2E                 | NOT RUN                    | 上述UI检查未完成“设置时刻→加入→播放”的端到端路径                |
| Android视频真实播放                  | NOT RUN                    | Kotlin编译不代表实际解码/输出/通知通过                          |
| 完整49/98遍长测、真机13/14、多机同步 | NOT RUN                    | 不能用短时边界测试替代                                          |
| 人工视频质量/接缝试听                | NOT RUN                    | 当前图片输入不可用；没有宣称已视觉验收截图                      |
| 桌面正式视频功能                     | NOT IN SCOPE OF THIS BUILD | 仍是独立原型，未接入桌面正式UI/安装包                           |

最终回归后重新构建的 iOS App 已安装并启动于 iPhone16 Pro / iOS18 模拟器。
期间安装曾失败（磁盘仅余约123 MiB）；只清理本验证构建目录内可重新生成的
`Build/Intermediates.noindex` 后，可用空间恢复约2 GiB，再次安装/启动成功。
源码、用户原始素材、压缩资产、构建产物和日志均保留。启动成功不等于全流程E2E通过。

### 压缩明细

| 文件              | 帧数 |  字节数 |     SSIM | 音频包不变/解码 |
| ----------------- | ---: | ------: | -------: | --------------- |
| intro-49.mp4      |  150 |  976902 | 0.990857 | PASS            |
| intro-98.mp4      |  156 |  711231 | 0.990690 | PASS            |
| salutation.mp4    | 1117 | 3037330 | 0.994101 | PASS            |
| regular-cycle.mp4 | 2206 | 4353963 | 0.993810 | PASS            |
| final-cycle.mp4   | 2337 | 4442056 | 0.993505 | PASS            |
| outro.mp4         | 2305 | 9829067 | 0.992587 | PASS            |

可复现处理和双端资源校验见[素材台账](../../media/video/README.md)。
未生成成片的49/98遍大文件；重复引用同一常规片段，避免重复占包。

### iOS原生验证

iPhone16 Pro / iOS18模拟器；用`tools/video-native-validation/run.mjs`直接编译并调用
生产原生模块。测试点为片头→礼敬、礼敬→常规、常规→常规、常规→最后、最后→片尾、
98遍流程第3600秒加入、暂停1秒后追平、5秒流程结束、结束后再次加入拒绝。

加入五类边界“确实跨越且无大跳”断言后，最终真实运行17项检查全部通过。
本次稳定期播放器时钟最大偏差约0.062ms；**仅为AVPlayer时钟日志**，
不代表画面/扬声器或跨设备也有该精度。完整事件和断言保存在本机
`release/video-native-validation/`，未上传公开仓库。

独立引擎的13.4设备SDK编译及API availability检查通过，产物`minos 13.4`；
SDK27的libc++仍提示旧平台支持警告。它不证明整个RN App的13.4可安装性。
仓库生产deployment target未改变；旧系统真机验收尚未进行。

### 自动化覆盖内容

- 默认49/98流程、每个边界±1 tick、整套结束不回绕。
- 迟到、禁用任务手动加入、周重复、跨午夜、损坏数据/旧revision拒绝。
- 修改/删除后恢复原快照、暂停不冻结公共时间、关闭App恢复意图。
- 命令串行、音频计数保留且撤销未完成周期、旧RNTP结束/远程事件隔离。
- 自动去重、失败不逐秒重试、编辑当前任务不重启、跨类型同秒冲突。
- 后音频任务抑制旧视频窗口；迟到的旧音频触发不抢占新视频。
- 较晚短视频任务结束或加载失败后，不回退到未加入的较早长视频任务。
- 编辑器排序、添加/删除片段、星期/重复输入、保存、权限请求、原生中断恢复入口。

新增混合任务回归最初因测试把Date.now冻结且RNTP仍mock为未播放而超时；
明确mock为Playing后重跑通过。未将超时解释为生产播放通过，也未靠放宽超时掩盖。

## 复现命令

```sh
npm run typecheck
npm test -- --runInBand
node scripts/verify-video-assets.mjs
node node_modules/typescript/bin/tsc packages/program-core/src/index.ts --strict --target ES2019 --module commonjs --skipLibCheck --outDir release/video-program-spike/core --types node
node --test tools/video-program-spike/core.test.cjs
node tools/video-native-validation/run.mjs BOOTED_IOS_SIMULATOR_UDID
```

Android在`android/`执行`./gradlew :app:compileDebugKotlin --offline --console=plain`，
本机使用JDK21。iOS Release模拟器：

```sh
xcodebuild -workspace ios/StarlightPlayer.xcworkspace -scheme StarlightPlayer \
  -configuration Release -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath ios/build/a05-wav-validation ARCHS=arm64 ONLY_ACTIVE_ARCH=YES \
  IPHONEOS_DEPLOYMENT_TARGET=15.0 CODE_SIGNING_ALLOWED=NO build
```

构建日志与原始事件目前仅在本机，不是长期制品存档。发布前应锁定提交/制品hash，
转存脱敏证据并补齐上述NOT RUN项目。本记录描述提交前的验证结果，不代表商店发布。

## 后续记录

2026-11-19：环形拨轮、全屏常驻进度和去二维码素材 revision v2 的接续结果见
[视频界面回归记录](2026-11-19-video-ui.md)。本文件的 v1 素材与原验证结果保留，不用 v2 结果覆盖。
