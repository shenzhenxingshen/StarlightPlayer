/* eslint-disable @typescript-eslint/no-var-requires */
// 全局 mock：原生模块在 Node 环境下需要替身
jest.mock('react-native-mmkv', () => require('./mocks/mmkv'));
jest.mock('react-native-track-player', () => require('./mocks/trackPlayer'));
jest.mock('react-native-vector-icons/MaterialIcons', () => 'Icon');
jest.mock('react-native-gesture-handler', () => ({}));
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const View = require('react-native').View;
  return {
    SafeAreaProvider: ({ children }) => React.createElement(View, null, children),
    SafeAreaView: ({ children }) => React.createElement(View, null, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

const { NativeModules } = require('react-native');
NativeModules.PlayerCommandLock = {
  acquire: jest.fn(async () => {}),
  renew: jest.fn(),
  release: jest.fn(),
};
NativeModules.DiagnosticExporter = {
  shareTextFile: jest.fn(async () => '/tmp/starlight-diagnostics.txt'),
};

// 关掉 RN 启动时的告警噪音
jest.spyOn(console, 'warn').mockImplementation(() => {});
