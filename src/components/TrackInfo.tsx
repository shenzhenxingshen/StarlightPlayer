import { GOLD, GOLD_LIGHT, GOLD_DIM, GOLD_FAINT, GOLD_GLOW, GOLD_BORDER, GOLD_SUBTLE } from '../constants/colors';
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Track } from '../types';
import VinylRecord from './VinylRecord';

interface TrackInfoProps {
  track: Track | null;
  isPlaying: boolean;
  isCareMode?: boolean;
}

const TrackInfo: React.FC<TrackInfoProps> = ({ track, isPlaying, isCareMode = false }) => {
  const titleSize = isCareMode ? 28 : 22;
  const subSize = isCareMode ? 20 : 15;
  const vinylSize = isCareMode ? 300 : 260;

  return (
    <View style={styles.container}>
      <VinylRecord isPlaying={isPlaying} size={vinylSize} />
      <Text style={[styles.title, { fontSize: titleSize }]} numberOfLines={2}>
        {track?.title ?? '未选择曲目'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: 20 },
  title: { color: GOLD, fontWeight: 'bold', textAlign: 'center', marginTop: 24, paddingHorizontal: 30 },
  subtitle: { color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: 6 },
});

export default TrackInfo;
