import { NativeModules, Platform } from 'react-native';
import { MMKV } from 'react-native-mmkv';
import { exportDiagnosticFile } from '@/utils/diagnosticExporter';
import { getLocalAudioUrl } from '@/utils/getLocalAudioUrl';
import { addLog, clearLogs, getLogs } from '@/utils/logger';

describe('诊断导出与日志边界', () => {
  beforeEach(() => {
    (new MMKV() as any).clearAll();
    NativeModules.DiagnosticExporter.shareTextFile.mockReset().mockResolvedValue('/tmp/log.txt');
  });

  it('调用原生模块导出诊断文件', async () => {
    await expect(exportDiagnosticFile('diagnostics')).resolves.toBe('/tmp/log.txt');
    expect(NativeModules.DiagnosticExporter.shareTextFile).toHaveBeenCalledWith('diagnostics');
  });

  it('日志支持Error cause、循环对象、截断、过滤和清理', () => {
    const root = new Error('root');
    const wrapped = new Error('wrapped') as Error & { cause?: unknown };
    wrapped.cause = root;
    addLog('ERROR', wrapped);

    const circular: any = {};
    circular.self = circular;
    addLog('WARN', circular);
    addLog('INFO', 'x'.repeat(3_000));
    expect(getLogs()[0]).toContain('cause=Error: root');
    expect(getLogs()[1]).toContain('[object Object]');
    expect(getLogs()[2].length).toBeLessThan(2_100);

    const storage = new MMKV();
    storage.set('app_logs', JSON.stringify(['ok', 1, null]));
    expect(getLogs()).toEqual(['ok']);
    storage.set('app_logs', '{bad json');
    expect(getLogs()).toEqual([]);
    clearLogs();
    expect(getLogs()).toEqual([]);
  });

  it('日志最多保留最近1000条', () => {
    for (let i = 0; i < 1_005; i++) addLog('INFO', `line-${i}`);
    const logs = getLogs();
    expect(logs).toHaveLength(1_000);
    expect(logs[0]).toContain('line-5');
    expect(logs[999]).toContain('line-1004');
  });
});

describe('getLocalAudioUrl', () => {
  it('iOS使用bundle文件名，Android使用assets URL', () => {
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    expect(getLocalAudioUrl('A01.mp3')).toBe('A01.mp3');
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    expect(getLocalAudioUrl('A01.mp3')).toBe('file:///android_asset/audio/A01.mp3');
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
  });
});
