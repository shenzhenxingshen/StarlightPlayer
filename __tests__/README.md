# 测试目录约定

完整命令、覆盖率解释、原生测试和失败排查见 [`docs/TESTING.md`](../docs/TESTING.md)。本文只说明向 `__tests__/` 添加 Jest/RNTL 测试时应遵守的目录和隔离契约。

## 1. 分层与放置

| 目录/文件                    | 放置内容                                           |
| ---------------------------- | -------------------------------------------------- |
| `App*.spec.tsx`              | 初始化、平台入口、导航壳、原生队列接管和失败恢复   |
| `components/`                | 可复用组件的 props、交互、布局和无障碍语义         |
| `screens/`                   | 页面级用户流程、store/持久化协作和异常反馈         |
| `services/`                  | 后台播放事件、QueueEnded、远程命令、重试和平台分支 |
| `store/`                     | Zustand 状态变更与持久化桥接                       |
| `utils/`                     | 纯决策、边界、存储协议、命令串行和恢复逻辑         |
| `mocks/`                     | 全局原生依赖的最小、确定性替身                     |
| `jest.setup.js` / `setup.ts` | Jest 环境启动与每用例通用清理                      |

新增测试尽量与源文件同名；跨模块端到端业务决策放在拥有该决策的最高层，不要在多个组件测试中复制同一套断言。原生 XCTest/Android 测试不放在这里。

## 2. setup 与 mock 契约

- `jest.setup.js` 在测试环境建立前加载 TrackPlayer、MMKV、图标、手势、安全区、`PlayerCommandLock` 和诊断导出替身。
- `setup.ts` 加载 RNTL matcher，并在 `afterEach` 执行 `jest.clearAllMocks()`。
- `clearAllMocks()` **只清调用记录**：不会清 MMKV 的共享 `Map`、TrackPlayer event handlers、mock implementation、fake timer、`Platform` 或 `Date.now` spy。
- MMKV 用例在 `beforeEach` 显式 `clearAll()`；依赖播放事件的用例调用 TrackPlayer mock 的 `__reset()`，再重新注册本用例需要的 service/listener。
- 临时 `mockResolvedValueOnce`/`mockRejectedValueOnce`、spy 和平台属性必须在用例结束恢复；不要让测试依赖文件执行顺序。

MMKV 用例的最小准备模式：

```ts
beforeEach(() => {
  (new MMKV() as any).clearAll();
});
```

事件 handler 只有在同一 `beforeEach` 会重新注册时才调用 `mockedTrackPlayer.__reset()`。对临时 spy 保留其返回值并在 `finally` 调用该 spy 的 `mockRestore()`；不要无差别 `restoreAllMocks`（会恢复全局抑制的 `console.warn`）或 `resetAllMocks`（会删除全局 mock 的默认实现）。

## 3. fake timers

定时器用例必须用 `try/finally` 恢复真实时间，并用 async timer API 等待 Promise 链：

```ts
jest.useFakeTimers({ doNotFake: ['Date'] });
try {
  // arrange / act
  await jest.advanceTimersByTimeAsync(1500);
  // assert
} finally {
  jest.clearAllTimers();
  jest.useRealTimers();
}
```

若同时 spy `Date.now`，在 `finally` 单独 `mockRestore()`。边界测试应覆盖阈值之前、恰好等于和之后；不要用真实 sleep 修复竞态。

## 4. 平台分支

优先用独立的 `*.android.spec.*`/`*.ios.spec.*` 文件表达注册期平台差异。保存并恢复原值：

```ts
const originalOS = Platform.OS;

beforeAll(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
});

afterAll(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
});
```

如果源模块在 import 时读取平台，必须先覆盖平台再加载该模块。谨慎使用 `jest.resetModules()`：它可能创建第二份 React 并导致 hook 错误；优先通过独立测试文件和延迟 `require` 隔离。

## 5. 结果边界

这些测试运行在 Node 中：TrackPlayer 不解码/播放，MMKV 不落盘，锁总成功，Safe Area 为 0，诊断导出不创建真实文件。Jest coverage 只统计 `jest.config.js` 纳入的 JS/TS 源码，不统计 iOS/Android、RNTP、音频和操作系统行为。

因此 mock 调用和高覆盖率不能证明锁屏、后台、来电、蓝牙、厂商省电、多设备同步或真实 QueueEnded 时序。涉及这些风险的变更必须同步更新/执行 [`docs/QA_PLAYBOOK.md`](../docs/QA_PLAYBOOK.md) 和版本测试记录。
