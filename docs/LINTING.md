# Lint 与静态检查

## 命令

```bash
npm run typecheck
npm run typecheck:app
npm run lint
npm run format:check
```

- TypeScript：`strict`、`noImplicitReturns`、`noFallthroughCasesInSwitch`。`typecheck:app` 只检查产品代码，`typecheck` 同时检查 Jest 测试。
- ESLint：React Native 基础规则 + TypeScript + React Hooks。当前允许最多 999 个 warning，error 仍阻塞。
- Prettier：单引号、2 空格、100 列、trailing comma。

## 边界

- `android/`、`ios/`、产物和原生 mock 不由 TS ESLint 检查。
- Android 使用 Gradle/Kotlin 编译做原生校验。
- iOS 使用 `xcodebuild` 做 Objective-C++/pbxproj 校验。
- Jest、RNTL、类型工具和 Lint devDependencies 已与 lockfile 同步。

## 后续收紧

1. 处理 `ProfileScreen` 内联样式和 logger 的有意 `any`。
2. 将 `react-hooks/exhaustive-deps` 从 warning 升为 error。
3. 提升核心播放逻辑的覆盖率并逐步收紧 coverage threshold。
4. CI 最终使用 `npm ci` → typecheck → lint → test → Android/iOS build。
