import { GOLD, GOLD_BORDER, GOLD_GLOW } from '../constants/colors';
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
  const iconSize = Math.round(width * 0.1);
  const playCircleSize = isCareMode ? Math.round(width * 0.38) : Math.round(width * 0.28);
  const playIconSize = Math.round(playCircleSize * 0.8);
  const sidePad = Math.round(width * 0.1);
  const modeIcon = MODE_CONFIG[playMode]?.icon || 'repeat';

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

  return (
    <View style={styles.container}>
      {modeLabel && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{modeLabel}</Text>
        </View>
      )}
      <View style={[styles.row, { paddingHorizontal: sidePad }]}>
        <Pressable onPress={onToggleMode} hitSlop={8} style={styles.cornerBtn}>
          <Icon name={modeIcon} size={iconSize} color="rgba(255,255,255,0.55)" />
        </Pressable>
        <Pressable onPress={onToggleSync} hitSlop={8} style={styles.cornerBtn}>
          <Icon name={isSyncMode ? 'people-outline' : 'person-outline'} size={iconSize} color="rgba(255,255,255,0.55)" />
        </Pressable>
      </View>
      <View style={{ alignItems: 'center' }}>
        <Pressable onPress={onPlayPause} hitSlop={8}>
          <View style={[styles.playCircle, { width: playCircleSize, height: playCircleSize, borderRadius: playCircleSize / 2 }]}>
            <Icon name={isPlaying ? 'pause' : 'play-arrow'} size={playIconSize} color={GOLD} />
          </View>
        </Pressable>
      </View>
      <View style={[styles.row, { paddingHorizontal: sidePad }]}>
        <Pressable onPress={onSkipToPrevious} hitSlop={8} style={styles.cornerBtn}>
          <Icon name="skip-previous" size={iconSize} color="rgba(255,255,255,0.8)" />
        </Pressable>
        <Pressable onPress={onSkipToNext} hitSlop={8} style={styles.cornerBtn}>
          <Icon name="skip-next" size={iconSize} color="rgba(255,255,255,0.8)" />
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {},
  toast: { position: 'absolute', top: -24, alignSelf: 'center', zIndex: 1 },
  toastText: { color: GOLD, fontSize: 14, backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 16, paddingVertical: 4, borderRadius: 16, borderWidth: 1, borderColor: GOLD_GLOW, overflow: 'hidden' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  cornerBtn: { padding: 10 },
  playCircle: { borderWidth: 2, borderColor: GOLD_BORDER, alignItems: 'center', justifyContent: 'center' },
});

export default Controls;
