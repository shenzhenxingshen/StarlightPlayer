import { GOLD } from '../constants/colors';
import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { Track } from '../types';
import VinylRecord from './VinylRecord';

interface TrackInfoProps {
  track: Track | null;
  isPlaying: boolean;
  isCareMode?: boolean;
}

const TrackInfo: React.FC<TrackInfoProps> = ({ track, isPlaying, isCareMode = false }) => {
  const { width, height } = useWindowDimensions();
  const titleSize = isCareMode ? 28 : 22;
  const vinylSize = Math.min(width, height * 0.4) * 0.65;

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { fontSize: titleSize }]} numberOfLines={2}>
        {track?.title ?? '未选择曲目'}
      </Text>
      <VinylRecord isPlaying={isPlaying} size={vinylSize} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: 8 },
  title: { color: GOLD, fontWeight: 'bold', textAlign: 'center', marginBottom: 16, paddingHorizontal: 30 },
});

export default TrackInfo;
