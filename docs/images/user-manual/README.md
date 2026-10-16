# 用户手册截图说明

> 生成/核对日期：2026-10-16。这里的图片用于说明界面，不等同于发布候选测试证据。

## 目录

- `raw/`：未经标注、裁切或重绘的 Simulator/Emulator 原始截图。
- `annotated/`：由原始截图生成的总览合成图，保留用于对照和维护。
- `annotated/detail/`：手册正文使用的单功能近景图；每张图都直接包含中文说明、圈选框和箭头。
- `build_annotated.py`：从 `raw/` 重新生成全部 `annotated/` 图片。
- 目录根部原有的 8 张压缩图为早期手册素材，暂时保留；当前手册已改用 `annotated/`。

生成命令：

```bash
python3 docs/images/user-manual/build_annotated.py
```

脚本依赖 Pillow，并按顺序查找 macOS 的 Hiragino Sans GB/PingFang、Linux 的 Noto Sans CJK/WenQuanYi Zen Hei，以及 Windows 的 Microsoft YaHei。找不到中文字体时会明确报错。运行脚本只会重建 `annotated/` 与 `annotated/detail/`，不会修改 `raw/`。

## 采集环境

| 平台    | 设备/环境                       | 系统与分辨率                                   | 用途                                     |
| ------- | ------------------------------- | ---------------------------------------------- | ---------------------------------------- |
| Android | `Starlight_API_35` Emulator     | Android 15 / API 35，1080×2400；横屏 2400×1080 | 主流程、关怀模式、通知、锁屏、诊断与校验 |
| iOS     | iPhone 16 Pro Simulator         | iOS 18，竖屏 1206×2622；横屏 2622×1206         | iPhone 竖屏与宽横屏布局                  |
| iPadOS  | iPad Pro 13-inch (M4) Simulator | iPadOS 18，竖屏 2064×2752；横屏 2752×2064      | iPad 竖屏与方屏/横屏布局                 |

Android 截图来自 App 1.0 Debug 界面。iPhone 竖屏由旧 Debug 原生壳加载当前仓库 JavaScript；iPhone/iPad 横屏来自 `release/ios/screenshots/` 的 1.0 全分辨率 Simulator 截图。iPad 竖屏使用包含当前横竖屏和遍数界面的 Simulator build；它不用于展示版本号。

## 总览合成图索引

| 文件                             | 手册内容                                 |
| -------------------------------- | ---------------------------------------- |
| `01-default-settings.png`        | 首次安装的四项默认状态                   |
| `02-main-pages.png`              | 播放、列表、我的及完整曲目分类           |
| `03-personal-playback.png`       | 普通个人播放五步                         |
| `04-synchronized-playback.png`   | 多设备同步播放设置                       |
| `05-player-controls.png`         | 播放页五个按钮                           |
| `06-play-modes.png`              | 四种播放模式及切换顺序                   |
| `07-seek-states.png`             | 可拖动与两种锁定状态                     |
| `08-repeat-setting.png`          | 快捷值、自定义输入、千分位和无效值       |
| `09-valid-cycle.png`             | 有效完整周期涉及的三种可见位置状态       |
| `10-repeat-display.png`          | 当前遍数/重复遍数的四种显示规则          |
| `11-count-persistence.png`       | 关闭重开保留与重新选曲清零               |
| `12-sync-zero.png`               | 同步开关和从中段加入时的第 0 遍          |
| `13-care-mode.png`               | 开启、使用和退出关怀模式                 |
| `14a-layout-portrait.png`        | iPhone 与 iPad 竖屏                      |
| `14b-layout-phone-landscape.png` | iPhone 宽横屏三栏                        |
| `14c-layout-ipad-landscape.png`  | iPad 方屏/横屏三栏及同轴关系             |
| `15-android-system-controls.png` | Android 通知权限、媒体通知与两种锁屏控制 |
| `16-diagnostics-export.png`      | 诊断文件导出四步                         |

具体原图与标注图的关系维护在 `build_annotated.py` 的 `build_all()` 中。每个 `PanelSpec` 明确记录原图文件、裁切范围和标注坐标，避免只留下无法复现的成品图。

## 正文近景图索引

`USER_MANUAL.md` 优先引用 `annotated/detail/`。近景图按功能分组如下：

| 分组               | 文件                                                                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 页面和基本控制     | `bottom-navigation.png`、`track-selection.png`、`player-controls.png`、`paused-device.png`、`playing-device.png`                                      |
| 四种播放模式       | `mode-repeat-one.png`、`mode-play-one.png`、`mode-repeat-list.png`、`mode-play-list.png`                                                              |
| 同步与进度         | `sync-off.png`、`sync-on.png`、`auto-date-time.png`、`seek-allowed.png`、`seek-locked.png`、`sync-zero-count.png`                                     |
| 重复遍数和有效周期 | `repeat-quick-values.png`、`repeat-custom-input.png`、`repeat-saved.png`、`repeat-invalid.png`、`cycle-start.png`、`cycle-mid-seek.png`               |
| 遍数显示和持久化   | `count-current-and-total.png`、`count-current-only.png`、`count-hidden.png`、`count-before-close.png`、`count-after-reopen.png`、`count-new-task.png` |
| 关怀模式           | `care-enable.png`、`care-player.png`、`care-disable.png`                                                                                              |
| 响应式布局         | `iphone-portrait-controls.png`、`ipad-portrait-controls.png`、`iphone-landscape-layout.png`、`ipad-landscape-layout.png`                              |
| Android 系统界面   | `notification-permission.png`、`notification-player.png`、`notification-sync.png`、`lockscreen-normal.png`、`lockscreen-care.png`                     |
| 诊断导出           | `diagnostics-entry.png`、`diagnostics-expanded.png`、`diagnostics-export.png`、`diagnostics-share.png`                                                |

每个 `GuideCallout` 保存图内中文说明、箭头目标、说明卡片位置和可选高亮范围。更新截图后如果分辨率或布局发生变化，必须重新核对这些坐标。

## 维护规则

1. UI 或文案变化后，使用对应候选 build 重新截图，不能靠图片编辑伪造新界面状态。
2. 保留原图；编号、箭头、高亮和系统通知裁切只出现在 `annotated/`。
3. 截图前清除个人通知、账号、手机号、设备名和真实历史诊断内容。诊断页使用模拟器测试数据。
4. 系统分享页中的文件名和模拟器诊断指纹不是密钥，但对外发送真实用户的诊断文件前仍应检查内容。
5. 修改原图或标注脚本后，重新生成图片，并检查 `docs/USER_MANUAL.md` 的链接、图片清晰度、圈选位置和中文说明。
6. 截图只能证明页面在当时能显示。它不能证明后台保活、来电中断、蓝牙耳机、多台设备听感同步、完整播放周期或厂商省电策略已经通过。
7. `09-valid-cycle.png` 是真实页面状态的说明图，不把单张截图当作“此前发生过拖动”或“完成计数”的证据。
