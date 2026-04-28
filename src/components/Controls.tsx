import { GOLD, GOLD_BORDER, GOLD_GLOW, INK, TEXT_SEC, BG_SURFACE } from '../constants/colors';
import React from 'react';
import { View, StyleSheet, Pressable, Text, useWindowDimensions } from 'react-native';
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
  isSyncMode: boolean;
  modeLabel: string | null;
  onPlayPause: () => void;
  onSkipToNext: () => void;
  onSkipToPrevious: () => void;
  onToggleMode: () => void;
  onToggleSync: () => void;
  isCareMode?: boolean;
}

const Controls: React.FC<ControlsProps> = ({
  isPlaying, playMode, isSyncMode, modeLabel, onPlayPause, onSkipToNext, onSkipToPrevious, onToggleMode, onToggleSync, isCareMode = false,
}) => {
  const { width } = useWindowDimensions();
  const playCircleSize = isCareMode ? Math.round(width * 0.38) : Math.round(width * 0.22);
  const playIconSize = Math.round(playCircleSize * 0.8);
  const skipSize = Math.round(width * 0.1);
  const funcSize = Math.round(width * 0.07);

  if (isCareMode) {
    return (
      <View style={styles.container}>
        <View style={{ alignItems: 'center' }}>
          <Pressable onPress={onPlayPause} hitSlop={8}>
            <View style={[styles.playCircle, { width: playCircleSize, height: playCircleSize, borderRadius: playCircleSize / 2 }]}>
              <Icon name={isPlaying ? 'pause' : 'play-arrow'} size={playIconSize} color={GOLD} />
            </View>
          </Pressable>
        </View>
      </View>
    );
  }

  const modeIcon = MODE_CONFIG[playMode]?.icon || 'repeat';

  return (
    <View style={styles.container}>
      {modeLabel && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{modeLabel}</Text>
        </View>
      )}
      <View style={{ alignItems: 'center' }}>
        <View style={[styles.funcRow, { width: playCircleSize + 120 }]}>
          <Pressable onPress={onToggleMode} hitSlop={8} style={styles.funcBtn}>
            <Icon name={modeIcon} size={funcSize} color={TEXT_SEC} />
          </Pressable>
          <Pressable onPress={onToggleSync} hitSlop={8} style={styles.funcBtn}>
            <Icon name={isSyncMode ? 'people-outline' : 'person-outline'} size={funcSize} color={isSyncMode ? GOLD : TEXT_SEC} />
          </Pressable>
        </View>
        <View style={styles.mainRow}>
          <Pressable onPress={onSkipToPrevious} hitSlop={8} style={styles.sideBtn}>
            <Icon name="skip-previous" size={skipSize} color={INK} />
          </Pressable>
          <Pressable onPress={onPlayPause} hitSlop={8}>
            <View style={[styles.playCircle, { width: playCircleSize, height: playCircleSize, borderRadius: playCircleSize / 2 }]}>
              <Icon name={isPlaying ? 'pause' : 'play-arrow'} size={playIconSize} color={GOLD} />
            </View>
          </Pressable>
          <Pressable onPress={onSkipToNext} hitSlop={8} style={styles.sideBtn}>
            <Icon name="skip-next" size={skipSize} color={INK} />
          </Pressable>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {},
  toast: { position: 'absolute', top: -24, alignSelf: 'center', zIndex: 1 },
  toastText: { color: GOLD, fontSize: 14, backgroundColor: BG_SURFACE, paddingHorizontal: 16, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: GOLD_BORDER, overflow: 'hidden' },
  mainRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' },
  sideBtn: { width: 60, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 4 },
  playCircle: { borderWidth: 2, borderColor: GOLD_BORDER, backgroundColor: GOLD_GLOW, alignItems: 'center', justifyContent: 'center' },
  funcRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  funcBtn: { width: 60, alignItems: 'center', padding: 8 },
});

export default Controls;
