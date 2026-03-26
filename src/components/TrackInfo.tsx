import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Track } from '../types';
import VinylRecord from './VinylRecord';

interface TrackInfoProps {
  track: Track | null;
  isPlaying: boolean;
  isLargeTextMode?: boolean;
}

const TrackInfo: React.FC<TrackInfoProps> = ({ track, isPlaying, isLargeTextMode = false }) => {
  const titleSize = isLargeTextMode ? 28 : 22;
  const subSize = isLargeTextMode ? 20 : 15;
  const vinylSize = isLargeTextMode ? 300 : 260;

  return (
    <View style={styles.container}>
      <VinylRecord isPlaying={isPlaying} size={vinylSize} />
      <Text style={[styles.title, { fontSize: titleSize }]} numberOfLines={2}>
        {track?.title ?? '未选择曲目'}
      </Text>
      <Text style={[styles.subtitle, { fontSize: subSize }]}>
        {track ? `${track.code} · 共修音乐` : '请从列表选择'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: 20 },
  title: { color: '#ffd700', fontWeight: 'bold', textAlign: 'center', marginTop: 24, paddingHorizontal: 30 },
  subtitle: { color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: 6 },
});

export default TrackInfo;
