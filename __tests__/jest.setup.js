/* eslint-disable @typescript-eslint/no-var-requires */
// 全局 mock：原生模块在 Node 环境下需要替身
jest.mock('react-native-mmkv', () => require('./mocks/mmkv'));
jest.mock('react-native-track-player', () => require('./mocks/trackPlayer'));
jest.mock('react-native-vector-icons/MaterialIcons', () => 'Icon');
jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const View = require('react-native').View;
  return {
    GestureHandlerRootView: ({ children, ...props }) => React.createElement(View, props, children),
    Swipeable: ({ children, renderRightActions, ...props }) =>
      React.createElement(View, props, children, renderRightActions?.()),
  };
});
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
NativeModules.ScheduledTaskManager = {
  syncTasks: jest.fn(async () => ({
    platform: 'ios',
    notificationPermission: 'authorized',
    exactAlarmPermission: 'not-needed',
  })),
  consumePendingTrigger: jest.fn(async () => null),
  requestSchedulingPermission: jest.fn(async () => ({
    platform: 'ios',
    notificationPermission: 'authorized',
    exactAlarmPermission: 'not-needed',
  })),
  getSchedulingStatus: jest.fn(async () => ({
    platform: 'ios',
    notificationPermission: 'authorized',
    exactAlarmPermission: 'not-needed',
  })),
  openBackgroundSettings: jest.fn(async () => ({
    platform: 'android',
    notificationPermission: 'authorized',
    exactAlarmPermission: 'authorized',
  })),
  markAutomaticTaskStarted: jest.fn(),
  addListener: jest.fn(),
  removeListeners: jest.fn(),
};

jest.mock('@react-navigation/native-stack', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    createNativeStackNavigator: () => ({
      Navigator: ({ children }) => React.createElement(View, null, children),
      Screen: () => null,
    }),
  };
});

// 关掉 RN 启动时的告警噪音
jest.spyOn(console, 'warn').mockImplementation(() => {});
