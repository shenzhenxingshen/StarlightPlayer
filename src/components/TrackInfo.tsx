import { GOLD } from '../constants/colors';
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Track } from '../types';
import VinylRecord from './VinylRecord';

export type TrackInfoVariant = 'stacked' | 'stage';

export interface TrackInfoProps {
  track: Track | null;
  isPlaying: boolean;
  isCareMode?: boolean;
  variant?: TrackInfoVariant;
  vinylSize?: number;
  titleFontSize?: number;
}

const TrackInfo: React.FC<TrackInfoProps> = ({
  track,
  isPlaying,
  isCareMode = false,
  variant = 'stacked',
  vinylSize = 230,
  titleFontSize,
}) => {
  const resolvedTitleSize = titleFontSize ?? (isCareMode ? 28 : 22);
  const stage = variant === 'stage';

  return (
    <View
      testID={`track-info-${variant}`}
      style={[styles.container, stage ? styles.stageContainer : styles.stackedContainer]}>
      <Text
        testID="track-title"
        style={[
          styles.title,
          { fontSize: resolvedTitleSize },
          stage ? styles.stageTitle : styles.stackedTitle,
        ]}
        numberOfLines={stage ? 1 : 2}
        adjustsFontSizeToFit
        minimumFontScale={0.7}>
        {track?.title ?? '未选择曲目'}
      </Text>
      <View testID="vinyl-center" style={stage ? styles.stageVinyl : undefined}>
        <VinylRecord isPlaying={isPlaying} size={vinylSize} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
  },
  stackedContainer: {
    paddingVertical: 8,
  },
  stageContainer: {
    height: '100%',
    minWidth: 0,
    justifyContent: 'center',
  },
  title: {
    color: GOLD,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  stackedTitle: {
    width: '100%',
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  stageTitle: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
    paddingHorizontal: 8,
  },
  stageVinyl: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default TrackInfo;
