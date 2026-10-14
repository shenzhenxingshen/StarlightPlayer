/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-shadow */
import React from 'react';
import { render } from '@testing-library/react-native';
import TrackInfo from '@/components/TrackInfo';
import { TRACKS } from '@/constants/tracks';

jest.mock('@/components/VinylRecord', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return ({ isPlaying, size }: { isPlaying: boolean; size: number }) => (
    <Text>{`vinyl:${isPlaying}:${Math.round(size)}`}</Text>
  );
});

describe('<TrackInfo />', () => {
  it('显示曲名并把播放状态传给唱片', () => {
    const { getByText } = render(<TrackInfo track={TRACKS[0]} isPlaying />);
    expect(getByText(TRACKS[0].title)).toBeTruthy();
    expect(getByText(/^vinyl:true:/)).toBeTruthy();
  });

  it('没有曲目时显示占位文案', () => {
    const { getByText } = render(<TrackInfo track={null} isPlaying={false} isCareMode />);
    expect(getByText('未选择曲目')).toBeTruthy();
    expect(getByText(/^vinyl:false:/)).toBeTruthy();
  });
});
