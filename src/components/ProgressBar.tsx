import { GOLD, GOLD_LIGHT, GOLD_DIM, GOLD_FAINT, GOLD_GLOW, GOLD_BORDER, GOLD_SUBTLE } from '../constants/colors';
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface ProgressBarProps {
  position: number;
  duration: number;
  onSeek: (value: number) => void;
  isCareMode?: boolean;
  currentRepeat?: number;
  totalRepeat?: number;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ position, duration, isCareMode = false, currentRepeat, totalRepeat }) => {
  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? Math.min(position / duration, 1) : 0;
  const textSize = isCareMode ? 18 : 15;
  const repeatSize = isCareMode ? 20 : 16;

  return (
    <View style={styles.container}>
      <View style={styles.barWrap}>
        <View style={styles.track}>
          <View style={[styles.fill, { flex: progress }]} />
          <View style={[styles.thumb, progress > 0 && styles.thumbActive]} />
          <View style={{ flex: Math.max(1 - progress, 0.001) }} />
        </View>
      </View>
      <View style={styles.timeRow}>
        <Text style={[styles.time, { fontSize: textSize }]}>{fmt(position)}</Text>
        {!isCareMode && totalRepeat != null && totalRepeat > 1 && currentRepeat != null && (
          <Text style={[styles.repeatText, { fontSize: repeatSize }]}>{currentRepeat}/{totalRepeat}</Text>
        )}
        <Text style={[styles.time, { fontSize: textSize }]}>{fmt(duration)}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { paddingHorizontal: 30, paddingVertical: 8 },
  barWrap: { paddingVertical: 8 },
  track: { height: 4, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 2, flexDirection: 'row', alignItems: 'center' },
  fill: { height: 4, backgroundColor: GOLD, borderRadius: 2 },
  thumb: { width: 0, height: 0 },
  thumbActive: { width: 10, height: 10, borderRadius: 5, backgroundColor: GOLD, marginLeft: -5 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  time: { color: 'rgba(255,255,255,0.5)' },
  repeatText: { color: GOLD_DIM },
});

export default ProgressBar;
