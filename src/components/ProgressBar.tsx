import React from 'react';
import { View, StyleSheet, Text } from 'react-native';

interface ProgressBarProps {
  position: number;
  duration: number;
  onSeek: (value: number) => void;
  isLargeTextMode?: boolean;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ position, duration, isLargeTextMode = false }) => {
  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? Math.min(position / duration, 1) : 0;
  const textSize = isLargeTextMode ? 18 : 12;

  return (
    <View style={styles.container}>
      <Text style={[styles.time, { fontSize: textSize }]}>{fmt(position)}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { flex: progress }]} />
        <View style={{ flex: 1 - progress }} />
      </View>
      <Text style={[styles.time, { fontSize: textSize }]}>{fmt(duration)}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10 },
  time: { color: '#fff', minWidth: 50, textAlign: 'center' },
  track: { flex: 1, height: 4, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2, flexDirection: 'row', marginHorizontal: 10 },
  fill: { backgroundColor: '#fff', borderRadius: 2 },
});

export default ProgressBar;
