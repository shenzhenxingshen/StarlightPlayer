import { GOLD, GOLD_LIGHT, GOLD_DIM, GOLD_FAINT, GOLD_GLOW, GOLD_BORDER, GOLD_SUBTLE } from '../constants/colors';
import React from 'react';
import { View, StyleSheet, Pressable, Text } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';

export type PlayMode = 'play-one' | 'repeat-one' | 'play-all' | 'repeat-all';

export const MODE_CONFIG: Record<PlayMode, { icon: string; label: string; next: PlayMode }> = {
  'repeat-one': { icon: 'repeat-one',     label: '单曲循环', next: 'play-one' },
  'play-one':   { icon: 'looks-one',      label: '单曲播放', next: 'repeat-all' },
  'repeat-all': { icon: 'repeat',         label: '列表循环', next: 'play-all' },
  'play-all':   { icon: 'playlist-play',  label: '列表播放', next: 'repeat-one' },
};

interface ControlsProps {
  isPlaying: boolean;
  playMode: PlayMode;
  modeLabel: string | null;
  onPlayPause: () => void;
  onSkipToNext: () => void;
  onSkipToPrevious: () => void;
  onToggleMode: () => void;
  isLargeTextMode?: boolean;
}

const Controls: React.FC<ControlsProps> = ({
  isPlaying, playMode, modeLabel, onPlayPause, onSkipToNext, onSkipToPrevious, onToggleMode, isLargeTextMode = false,
}) => {
  const skipSize = isLargeTextMode ? 56 : 50;
  const playSize = isLargeTextMode ? 92 : 82;
  const playCircleSize = isLargeTextMode ? 110 : 100;
  const modeSize = isLargeTextMode ? 40 : 35;
  const sidePad = 18;
  const modeIcon = MODE_CONFIG[playMode]?.icon || 'repeat';

  return (
    <View style={styles.container}>
      <View style={styles.mainRow}>
        {/* 左列：模式(上) + 上一首(下)，垂直居中对齐 */}
        <View style={styles.leftCol}>
          <Pressable onPress={onToggleMode} hitSlop={12} style={{ padding: sidePad }}>
            <Icon name={modeIcon} size={modeSize} color="rgba(255,255,255,0.55)" />
          </Pressable>
          <Pressable onPress={onSkipToPrevious} hitSlop={12} style={{ padding: sidePad }}>
            <Icon name="skip-previous" size={skipSize} color="rgba(255,255,255,0.8)" />
          </Pressable>
        </View>
        {/* 中：播放 */}
        <Pressable onPress={onPlayPause} hitSlop={8} style={styles.playBtn}>
          <View style={[styles.playCircle, { width: playCircleSize, height: playCircleSize, borderRadius: playCircleSize / 2 }]}>
            <Icon name={isPlaying ? 'pause' : 'play-arrow'} size={playSize} color={GOLD} />
          </View>
        </Pressable>
        {/* 右列：占位(上) + 下一首(下) */}
        <View style={styles.rightCol}>
          <View style={{ height: modeSize + sidePad * 2 }} />
          <Pressable onPress={onSkipToNext} hitSlop={12} style={{ padding: sidePad }}>
            <Icon name="skip-next" size={skipSize} color="rgba(255,255,255,0.8)" />
          </Pressable>
        </View>
      </View>
      {/* 浮窗模式名称 */}
      {modeLabel && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{modeLabel}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {},
  mainRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' },
  leftCol: { alignItems: 'center' },
  rightCol: { alignItems: 'center' },
  playBtn: { marginHorizontal: 16, marginBottom: 8 },
  playCircle: { borderWidth: 2, borderColor: GOLD_BORDER, alignItems: 'center', justifyContent: 'center' },
  toast: { position: 'absolute', top: 4, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: GOLD_GLOW },
  toastText: { color: GOLD, fontSize: 14 },
});

export default Controls;
