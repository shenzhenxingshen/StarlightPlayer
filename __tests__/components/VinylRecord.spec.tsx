import React from 'react';
import { Animated } from 'react-native';
import { render } from '@testing-library/react-native';
import VinylRecord from '@/components/VinylRecord';

describe('<VinylRecord />', () => {
  it('播放时启动旋转和呼吸动画，暂停及卸载时停止', () => {
    const spinAnimation = { start: jest.fn(), stop: jest.fn(), reset: jest.fn() } as any;
    const glowAnimation = { start: jest.fn(), stop: jest.fn(), reset: jest.fn() } as any;
    const loopSpy = jest
      .spyOn(Animated, 'loop')
      .mockReturnValueOnce(spinAnimation)
      .mockReturnValueOnce(glowAnimation);

    const view = render(<VinylRecord isPlaying size={200} />);
    expect(loopSpy).toHaveBeenCalledTimes(2);
    expect(spinAnimation.start).toHaveBeenCalledTimes(1);
    expect(glowAnimation.start).toHaveBeenCalledTimes(1);

    view.rerender(<VinylRecord isPlaying={false} size={200} />);
    expect(spinAnimation.stop).toHaveBeenCalled();
    expect(glowAnimation.stop).toHaveBeenCalled();
    view.unmount();
    loopSpy.mockRestore();
  });

  it('暂停状态不会创建无限动画循环', () => {
    const loopSpy = jest.spyOn(Animated, 'loop');
    const view = render(<VinylRecord isPlaying={false} />);
    expect(loopSpy).not.toHaveBeenCalled();
    view.unmount();
    loopSpy.mockRestore();
  });
});
