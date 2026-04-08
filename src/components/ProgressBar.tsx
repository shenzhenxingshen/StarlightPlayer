import { GOLD, GOLD_LIGHT, GOLD_DIM, GOLD_FAINT, GOLD_GLOW, GOLD_BORDER, GOLD_SUBTLE } from '../constants/colors';
import React, { useRef } from 'react';
import { View, Text, StyleSheet, PanResponder, LayoutChangeEvent } from 'react-native';

interface ProgressBarProps {
  position: number;
  duration: number;
  onSeek: (value: number) => void;
  isCareMode?: boolean;
  currentRepeat?: number;
  totalRepeat?: number;
  seekable?: boolean;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ position, duration, onSeek, isCareMode = false, currentRepeat, totalRepeat, seekable = false }) => {
  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? Math.min(position / duration, 1) : 0;
  const textSize = isCareMode ? 18 : 15;
  const repeatSize = isCareMode ? 28 : 22;
  const trackWidth = useRef(0);
  const seekableRef = useRef(seekable);
  const durationRef = useRef(duration);
  const onSeekRef = useRef(onSeek);
  seekableRef.current = seekable;
  durationRef.current = duration;
  onSeekRef.current = onSeek;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => seekableRef.current && durationRef.current > 0,
      onMoveShouldSetPanResponder: () => seekableRef.current && durationRef.current > 0,
      onPanResponderGrant: (e) => {
        if (!seekableRef.current || durationRef.current <= 0) return;
        const x = e.nativeEvent.locationX;
        onSeekRef.current(Math.max(0, Math.min(1, x / trackWidth.current)) * durationRef.current);
      },
      onPanResponderMove: (e) => {
        if (!seekableRef.current || durationRef.current <= 0) return;
        const x = e.nativeEvent.locationX;
        onSeekRef.current(Math.max(0, Math.min(1, x / trackWidth.current)) * durationRef.current);
      },
    })
  ).current;

  const onLayout = (e: LayoutChangeEvent) => { trackWidth.current = e.nativeEvent.layout.width; };

  return (
    <View style={styles.container}>
      <View style={styles.barWrap} {...panResponder.panHandlers} onLayout={onLayout}>
        <View style={[styles.track, seekable && styles.trackSeekable]}>
          <View style={[styles.fill, { flex: progress }, seekable && styles.fillSeekable]} />
          <View style={[styles.thumb, progress > 0 && (seekable ? styles.thumbSeekable : styles.thumbLocked)]} />
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
  track: { height: 3, backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 2, flexDirection: 'row', alignItems: 'center' },
  trackSeekable: { height: 6, borderRadius: 3 },
  fill: { height: 3, backgroundColor: GOLD_DIM, borderRadius: 2 },
  fillSeekable: { height: 6, backgroundColor: GOLD, borderRadius: 3 },
  thumb: { width: 0, height: 0 },
  thumbLocked: { width: 8, height: 8, borderRadius: 4, backgroundColor: GOLD_DIM, marginLeft: -4 },
  thumbSeekable: { width: 16, height: 16, borderRadius: 8, backgroundColor: GOLD, marginLeft: -8, borderWidth: 2, borderColor: GOLD_GLOW },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  time: { color: 'rgba(255,255,255,0.5)' },
  repeatText: { color: GOLD, fontWeight: 'bold' },
});

export default ProgressBar;
