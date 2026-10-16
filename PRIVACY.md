# 星光播放器隐私政策

**最后更新日期：2026 年 10 月 16 日**

## 概述

星光播放器（以下简称“本应用”）是一款离线经咒、佛号与歌曲播放器。本应用不要求注册账号，不接入广告、用户分析或追踪服务，也不会自动把设备中的播放数据或诊断信息上传到服务器。

## 不收集的数据

本应用不主动收集姓名、邮箱、电话号码、精确位置、通讯录、设备广告标识符、浏览记录或跨 App 活动，也不建立用户画像。

## 设备本地数据

为完成播放、恢复和诊断功能，本应用会在设备本地保存：

- 关怀模式、同步播放和每首重复遍数等设置；
- 当前曲目、播放模式、播放意图和恢复播放所需的状态；
- 当前播放任务已经完成的有效遍数和计数资格；
- 按设备本地日期保存的各曲目每日播放统计，历史日期的数据可能继续保留；
- 最多 1,000 条诊断日志，包括播放状态、控制事件和错误信息。

诊断页面还会读取平台、系统版本和基本设备/系统信息，用于在用户主动导出时生成诊断文件。页面只展示最近 30 条日志，导出文件包含当前保留的全部日志。

这些数据默认只保存在设备上。本应用没有面向用户的云同步功能。卸载应用或使用系统“清除应用数据”功能会删除这些本地数据；系统备份行为由操作系统和用户的设备设置控制。

## 诊断文件分享

本应用不会自动上传诊断文件。只有当用户点击“导出诊断文件”，并在系统分享面板中主动选择保存位置、邮件或其他接收应用时，文件才会离开本应用。分享后的处理受用户选择的接收方隐私政策约束。

诊断文件可能包含设备型号、系统版本、时间戳和播放事件。分享前请确认接收方可信；若不希望提供某些内容，可以先查看文件再决定是否发送。

## 网络访问

21 首音频均内置于安装包，播放、重复计数和同步位置计算不需要互联网。当前业务代码没有后端 API、账号、支付、推送、广告或分析请求。

平台工程目前仍包含 Android `INTERNET` 权限和 iOS 宽松 ATS 配置，但当前版本的业务功能没有使用它们传输用户数据。后续版本会评估是否移除这些非必要配置。

## 第三方组件

本应用使用 React Native、react-native-track-player、React Navigation、MMKV 等开源组件实现界面、本地播放和本地存储，但没有集成第三方广告、分析或追踪 SDK。

## 儿童隐私

本应用不要求账号，也不主动收集儿童或其他用户的个人信息。

## 政策变更

如隐私实践发生变化，我们会更新本页面和“最后更新日期”。

## 联系我们

如对隐私政策有疑问，请通过 GitHub Issues 联系：

[https://github.com/shenzhenxingshen/StarlightPlayer/issues](https://github.com/shenzhenxingshen/StarlightPlayer/issues)

---

# StarlightPlayer Privacy Policy

**Last updated: October 16, 2026**

## Overview

StarlightPlayer is an offline player for chants, Buddhist names, and songs. It does not require an account, integrate advertising or analytics services, or automatically upload playback or diagnostic data.

## Data We Do Not Collect

The app does not actively collect names, email addresses, phone numbers, precise locations, contacts, advertising identifiers, browsing history, or cross-app activity, and it does not create user profiles.

## Data Stored on the Device

To provide playback, restoration, and diagnostics, the app stores the following data locally:

- Care mode, synchronized playback, per-track repeat count, and other settings;
- The current track, playback mode, playback intent, and state required for restoration;
- Completed valid repeat cycles and cycle-counting eligibility;
- Per-track daily playback statistics keyed by the device's local date, including retained historical dates;
- Up to 1,000 diagnostic log entries containing playback states, control events, and errors.

The diagnostics page also reads the platform, operating-system version, and basic device/system information when preparing a user-requested diagnostic export. The page shows the latest 30 log entries, while an exported file contains all currently retained entries.

This data remains on the device by default. The app has no user-facing cloud-sync feature. Uninstalling the app or using the operating system's clear-app-data function deletes it. Operating-system backups are controlled by the platform and the user's device settings.

## Sharing Diagnostic Files

The app never uploads a diagnostic file automatically. A file leaves the app only after the user taps Export Diagnostic File and explicitly chooses a destination in the system share sheet. The selected recipient's privacy policy applies after sharing.

A diagnostic file may include the device model, OS version, diagnostic timestamps, and playback events. Users should review the file and choose a trusted recipient before sharing it.

## Network Access

All 21 audio tracks are bundled with the app. Playback, repeat counting, and synchronized-position calculation work without an Internet connection. The current business logic has no backend API, account, payment, push-notification, advertising, or analytics requests.

The platform projects still contain the Android `INTERNET` permission and a permissive iOS ATS setting, but current app features do not use them to transmit user data. Future releases will evaluate removing these unnecessary settings.

## Third-Party Components

The app uses open-source components such as React Native, react-native-track-player, React Navigation, and MMKV for UI, local playback, and local storage. It does not integrate third-party advertising, analytics, or tracking SDKs.

## Children's Privacy

The app does not require an account or actively collect personal information from children or other users.

## Changes

If our privacy practices change, this page and its “Last updated” date will be revised.

## Contact

For privacy questions, contact us through GitHub Issues:

[https://github.com/shenzhenxingshen/StarlightPlayer/issues](https://github.com/shenzhenxingshen/StarlightPlayer/issues)
