import { NativeModules } from 'react-native';
import { getVideoDiagnosticLines } from '@/video/diagnostics';

const original = NativeModules.VideoProgramPlayer;
afterEach(() => {
  NativeModules.VideoProgramPlayer = original;
});

it('旧安装包/桥接不存在时仍可导出JS日志', async () => {
  NativeModules.VideoProgramPlayer = undefined;
  expect(await getVideoDiagnosticLines()).toEqual([]);
  NativeModules.VideoProgramPlayer = {};
  expect(await getVideoDiagnosticLines()).toEqual([]);
});

it('只接受文本，最多保留最后300条原生事件', async () => {
  NativeModules.VideoProgramPlayer = {
    getDiagnostics: jest
      .fn()
      .mockResolvedValue([null, ...Array.from({ length: 305 }, (_, i) => `${i} boundary_check`)]),
  };
  const lines = await getVideoDiagnosticLines();
  expect(lines).toHaveLength(300);
  expect(lines[0]).toBe('5 boundary_check');
  expect(lines[299]).toBe('304 boundary_check');
});

it('原生返回损坏数据或读取失败不阻断诊断文件导出', async () => {
  NativeModules.VideoProgramPlayer = { getDiagnostics: jest.fn().mockResolvedValue({}) };
  expect(await getVideoDiagnosticLines()).toEqual([]);
  NativeModules.VideoProgramPlayer.getDiagnostics.mockRejectedValue(
    new Error('bridge unavailable'),
  );
  expect(await getVideoDiagnosticLines()).toEqual([
    '原生视频诊断读取失败: Error: bridge unavailable',
  ]);
});
