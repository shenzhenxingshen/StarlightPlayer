/* eslint-disable @typescript-eslint/no-var-requires */
import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import TrackInfo from '@/components/TrackInfo';
import { TRACKS } from '@/constants/tracks';

jest.mock('@/components/VinylRecord', () => {
  const ReactModule = require('react');
  const { Text: NativeText } = require('react-native');
  return ({ isPlaying, size }: { isPlaying: boolean; size: number }) =>
    ReactModule.createElement(NativeText, { testID: 'vinyl-record' }, `vinyl:${isPlaying}:${size}`);
});

describe('<TrackInfo />', () => {
  it('stacked 默认布局显示曲名、默认尺寸并传递播放状态', () => {
    const { getByTestId, getByText } = render(<TrackInfo track={TRACKS[0]} isPlaying />);

    expect(getByTestId('track-info-stacked')).toBeTruthy();
    expect(getByText(TRACKS[0].title)).toBeTruthy();
    expect(getByTestId('vinyl-record').props.children).toBe('vinyl:true:230');
    expect(getByTestId('track-title').props).toMatchObject({
      numberOfLines: 2,
      adjustsFontSizeToFit: true,
    });
    expect(StyleSheet.flatten(getByTestId('track-title').props.style)).toMatchObject({
      fontSize: 22,
      width: '100%',
      marginBottom: 16,
    });
  });

  it('stacked 布局使用显式唱片和标题尺寸', () => {
    const { getByTestId } = render(
      <TrackInfo
        track={TRACKS[1]}
        isPlaying={false}
        variant="stacked"
        vinylSize={196}
        titleFontSize={27}
      />,
    );

    expect(getByTestId('vinyl-record').props.children).toBe('vinyl:false:196');
    expect(StyleSheet.flatten(getByTestId('track-title').props.style).fontSize).toBe(27);
    expect(StyleSheet.flatten(getByTestId('track-info-stacked').props.style)).toMatchObject({
      width: '100%',
      alignItems: 'center',
      paddingVertical: 8,
    });
  });

  it('stage 布局使用显式尺寸并把标题悬置在居中的唱片舞台上', () => {
    const { getByTestId } = render(
      <TrackInfo track={TRACKS[2]} isPlaying variant="stage" vinylSize={318} titleFontSize={33} />,
    );

    expect(getByTestId('vinyl-record').props.children).toBe('vinyl:true:318');
    expect(getByTestId('track-title').props).toMatchObject({
      numberOfLines: 1,
      adjustsFontSizeToFit: true,
    });
    expect(StyleSheet.flatten(getByTestId('track-info-stage').props.style)).toMatchObject({
      width: '100%',
      height: '100%',
      minWidth: 0,
      justifyContent: 'center',
    });
    expect(StyleSheet.flatten(getByTestId('track-title').props.style)).toMatchObject({
      fontSize: 33,
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
    });
    expect(StyleSheet.flatten(getByTestId('vinyl-center').props.style)).toMatchObject({
      alignItems: 'center',
      justifyContent: 'center',
    });
  });

  it('没有曲目时显示占位文案，关怀模式采用更大的默认标题', () => {
    const { getByTestId, getByText } = render(
      <TrackInfo track={null} isPlaying={false} isCareMode />,
    );
    expect(getByText('未选择曲目')).toBeTruthy();
    expect(getByTestId('vinyl-record').props.children).toBe('vinyl:false:230');
    expect(StyleSheet.flatten(getByTestId('track-title').props.style).fontSize).toBe(28);
  });

  it('显式标题尺寸优先于关怀模式默认值', () => {
    const { getByTestId } = render(
      <TrackInfo track={TRACKS[0]} isPlaying={false} isCareMode titleFontSize={41} />,
    );
    expect(StyleSheet.flatten(getByTestId('track-title').props.style).fontSize).toBe(41);
  });
});
