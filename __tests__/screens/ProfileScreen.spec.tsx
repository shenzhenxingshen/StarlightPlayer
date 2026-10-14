import React from 'react';
import { Alert, NativeModules } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { MMKV } from 'react-native-mmkv';
import ProfileScreen from '@/screens/ProfileScreen';
import { useSettingsStore } from '@/store/settingsStore';
import { addLog } from '@/utils/logger';

describe('<ProfileScreen />', () => {
  beforeEach(() => {
    (new MMKV() as any).clearAll();
    useSettingsStore.setState({ isCareMode: false, isSyncMode: true, repeatCount: 1 });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    NativeModules.DiagnosticExporter.shareTextFile.mockResolvedValue(
      '/tmp/starlight-diagnostics.txt',
    );
  });

  it('快捷值使用千分位显示并可直接保存', () => {
    const { getByText } = render(<ProfileScreen />);
    expect(getByText('1,000')).toBeTruthy();
    expect(getByText('10,000')).toBeTruthy();

    fireEvent.press(getByText('10,000'));
    expect(useSettingsStore.getState().repeatCount).toBe(10_000);
    expect(getByText('当前：10,000 遍')).toBeTruthy();
  });

  it('自定义输入聚焦时纯数字、失焦后格式化，并可保存500万', () => {
    useSettingsStore.setState({ repeatCount: 10_000 });
    const { getByPlaceholderText, getByText, queryByPlaceholderText } = render(<ProfileScreen />);

    fireEvent.press(getByText('自定义'));
    const input = getByPlaceholderText('输入遍数');
    expect(input.props.value).toBe('10,000');
    fireEvent(input, 'focus');
    expect(input.props.value).toBe('10000');
    fireEvent.changeText(input, '5,000,000遍');
    expect(input.props.value).toBe('5000000');
    fireEvent(input, 'blur');
    expect(input.props.value).toBe('5,000,000');

    fireEvent.press(getByText('确定'));
    expect(useSettingsStore.getState().repeatCount).toBe(5_000_000);
    expect(getByText('当前：5,000,000 遍')).toBeTruthy();
    expect(queryByPlaceholderText('输入遍数')).toBeNull();
  });

  it('拒绝空值、0和超过安全整数的输入', () => {
    const { getByPlaceholderText, getByText } = render(<ProfileScreen />);
    fireEvent.press(getByText('自定义'));
    const input = getByPlaceholderText('输入遍数');

    fireEvent.changeText(input, '');
    fireEvent.press(getByText('确定'));
    expect(Alert.alert).toHaveBeenLastCalledWith('输入无效', '请输入大于 0 的整数');

    fireEvent.changeText(input, '0');
    fireEvent.press(getByText('确定'));
    expect(Alert.alert).toHaveBeenLastCalledWith('输入无效', '请输入大于 0 的整数');

    fireEvent.changeText(input, String(Number.MAX_SAFE_INTEGER + 1));
    fireEvent.press(getByText('确定'));
    expect(Alert.alert).toHaveBeenLastCalledWith('输入无效', '输入的遍数过大，请输入较小的整数');
    expect(useSettingsStore.getState().repeatCount).toBe(1);
  });

  it('关怀模式隐藏重复遍数和诊断功能', () => {
    const { getByText, queryByText } = render(<ProfileScreen />);
    fireEvent.press(getByText('切换到关怀模式'));
    expect(getByText('关怀模式：简化界面，避免误操作')).toBeTruthy();
    expect(queryByText('每首重复遍数')).toBeNull();
    expect(queryByText('诊断信息')).toBeNull();
  });

  it('展开诊断信息后导出包含设备信息和日志的文件', async () => {
    addLog('INFO', 'profile-export-test');
    const { getByText } = render(<ProfileScreen />);
    fireEvent.press(getByText('诊断信息'));
    expect(getByText(/profile-export-test/)).toBeTruthy();
    fireEvent.press(getByText('导出诊断文件'));

    await waitFor(() => expect(NativeModules.DiagnosticExporter.shareTextFile).toHaveBeenCalled());
    const content = NativeModules.DiagnosticExporter.shareTextFile.mock.calls[0][0];
    expect(content).toContain('星光播放器 诊断信息');
    expect(content).toContain('profile-export-test');
  });

  it('导出失败时恢复按钮并提示错误', async () => {
    NativeModules.DiagnosticExporter.shareTextFile.mockRejectedValueOnce(new Error('share failed'));
    const { getByText } = render(<ProfileScreen />);
    fireEvent.press(getByText('诊断信息'));
    fireEvent.press(getByText('导出诊断文件'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('导出失败', 'Error: share failed'),
    );
    expect(getByText('导出诊断文件')).toBeTruthy();
  });
});
