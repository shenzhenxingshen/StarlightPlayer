# Lint、格式与静态检查

> 最后实测：2026-10-16；结果对应源码 commit `0698f629376c73b8daee3aa7fbdaf2af1c63b29c`。

## 命令

```bash
npm run typecheck:app
npm run typecheck
npm run lint
npm run format:check
```

- `typecheck:app`：只检查产品 TypeScript 源码。
- `typecheck`：同时检查产品代码和 Jest 测试。
- ESLint：React Native 基础规则、TypeScript 和 React Hooks；脚本当前允许最多 999 个 warning，error 仍会使命令失败。
- Prettier：单引号、2 空格、100 列、trailing comma。`format:check` 目前只检查 `src/**/*.{ts,tsx}`，测试文件虽然会被 `npm run format` 格式化，但不在检查脚本范围内。

## 当前基线

| 检查            | 结果                           |
| --------------- | ------------------------------ |
| `typecheck:app` | 通过                           |
| `typecheck`     | 通过                           |
| `lint`          | 通过退出码，但有 31 个 warning |
| `format:check`  | 失败，7 个文件不符合格式       |

当前格式失败文件：

- `src/components/VinylRecord.tsx`
- `src/constants/colors.ts`
- `src/constants/tracks.ts`
- `src/store/statsStore.ts`
- `src/types/index.ts`
- `src/utils/playbackDecision.ts`
- `src/utils/syncUtils.ts`

当前 31 个 warning 分布在 App、VinylRecord、Playlist 和 Profile，具体为内联样式、渲染期间定义导航图标组件，以及一处显式 `any`。以实际 `npm run lint` 输出为准，不应仅凭退出码 0 写成“Lint 全部通过”。

## 自动修复注意事项

以下命令会改文件：

```bash
npm run format
npm run lint:fix
```

运行前先确认工作区，避免覆盖他人的未提交修改；运行后必须审阅差异并重新执行类型检查和测试。格式化属于机械变化，建议与业务逻辑改动分开提交。

## 检查边界

- `android/`、`ios/`、Gradle、Kotlin、Objective-C++、plist 和 pbxproj 不由 TypeScript/ESLint 检查。
- Android 原生正确性依赖 Gradle 编译、Lint 和设备测试；iOS 依赖 `xcodebuild`、签名/Archive 核验和设备测试。
- 自动化检查不能模拟后台服务、锁屏中心、来电、蓝牙或多设备同步。
- 音频文件名、哈希、编码和时长必须按 [AUDIO_ASSETS.md](AUDIO_ASSETS.md) 单独校验。

## 建议收紧顺序

1. 先格式化 7 个失败文件，并把 `format:check` 扩展到 `__tests__`。
2. 按规则分组清理 31 个 warning，避免一次性混入业务改动。
3. 将 `lint` 从 `--max-warnings=999` 逐步降到 0。
4. 在 CI 中依次运行 `npm ci`、typecheck、lint、format、test/coverage 和双端构建。
5. 为 Gradle/Android Lint、Xcode build settings、音频校验和 Markdown 链接增加独立门禁。
