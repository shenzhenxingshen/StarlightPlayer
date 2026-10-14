import { GOLD, GOLD_DIM, GOLD_GLOW, BG_RECESS, TEXT_SEC } from '../constants/colors';
import React, { useRef, useState } from 'react';
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

const ProgressBar: React.FC<ProgressBarProps> = ({
  position,
  duration,
  onSeek,
  isCareMode = false,
  currentRepeat,
  totalRepeat,
  seekable = false,
}) => {
  const [dragPosition, setDragPosition] = useState<number | null>(null);
  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const displayedPosition = dragPosition ?? position;
  const progress = duration > 0 ? Math.max(0, Math.min(displayedPosition / duration, 1)) : 0;
  const textSize = isCareMode ? 18 : 15;
  const repeatSize = isCareMode ? 28 : 22;
  const trackWidth = useRef(0);
  const seekableRef = useRef(seekable);
  const durationRef = useRef(duration);
  const onSeekRef = useRef(onSeek);
  const pendingSeekRef = useRef<number | null>(null);
  seekableRef.current = seekable;
  durationRef.current = duration;
  onSeekRef.current = onSeek;

  const positionFromEvent = (locationX: number): number | null => {
    const width = trackWidth.current;
    if (!seekableRef.current || durationRef.current <= 0 || width <= 0) return null;
    return Math.max(0, Math.min(1, locationX / width)) * durationRef.current;
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () =>
        seekableRef.current && durationRef.current > 0 && trackWidth.current > 0,
      onMoveShouldSetPanResponder: () =>
        seekableRef.current && durationRef.current > 0 && trackWidth.current > 0,
      onPanResponderGrant: e => {
        const next = positionFromEvent(e.nativeEvent.locationX);
        if (next == null) return;
        pendingSeekRef.current = next;
        setDragPosition(next);
      },
      onPanResponderMove: e => {
        const next = positionFromEvent(e.nativeEvent.locationX);
        if (next == null) return;
        pendingSeekRef.current = next;
        setDragPosition(next);
      },
      onPanResponderRelease: () => {
        const next = pendingSeekRef.current;
        pendingSeekRef.current = null;
        setDragPosition(null);
        if (next != null && seekableRef.current) onSeekRef.current(next);
      },
      onPanResponderTerminate: () => {
        pendingSeekRef.current = null;
        setDragPosition(null);
      },
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    trackWidth.current = e.nativeEvent.layout.width;
  };

  return (
    <View style={styles.container}>
      {!isCareMode && currentRepeat != null && (
        <Text
          style={[styles.currentRepeatText, { fontSize: repeatSize }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}>
          当前遍数：{currentRepeat}
        </Text>
      )}
      <View
        testID="progress-seek-area"
        style={styles.barWrap}
        {...panResponder.panHandlers}
        onLayout={onLayout}>
        <View style={[styles.track, seekable && styles.trackSeekable]}>
          <View style={[styles.fill, { flex: progress }, seekable && styles.fillSeekable]} />
          <View
            style={[
              styles.thumb,
              progress > 0 && (seekable ? styles.thumbSeekable : styles.thumbLocked),
            ]}
          />
          <View style={{ flex: Math.max(1 - progress, 0.001) }} />
        </View>
      </View>
      <View style={styles.timeRow}>
        <Text style={[styles.time, { fontSize: textSize }]}>{fmt(displayedPosition)}</Text>
        <Text style={[styles.time, { fontSize: textSize }]}>{fmt(duration)}</Text>
      </View>
      {!isCareMode && totalRepeat != null && (
        <Text
          style={[styles.totalRepeatText, { fontSize: textSize }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}>
          每首重复遍数：{totalRepeat}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { paddingHorizontal: 30, paddingVertical: 8 },
  currentRepeatText: {
    color: GOLD,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 2,
  },
  barWrap: { paddingVertical: 8 },
  track: {
    height: 3,
    backgroundColor: BG_RECESS,
    borderRadius: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  trackSeekable: { height: 6, borderRadius: 3 },
  fill: { height: 3, backgroundColor: GOLD_DIM, borderRadius: 2 },
  fillSeekable: { height: 6, backgroundColor: GOLD, borderRadius: 3 },
  thumb: { width: 0, height: 0 },
  thumbLocked: { width: 8, height: 8, borderRadius: 4, backgroundColor: GOLD_DIM, marginLeft: -4 },
  thumbSeekable: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: GOLD,
    marginLeft: -8,
    borderWidth: 2,
    borderColor: GOLD_GLOW,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  time: { color: TEXT_SEC },
  totalRepeatText: { color: GOLD, fontWeight: 'bold', textAlign: 'center', marginTop: 6 },
});

export default ProgressBar;
