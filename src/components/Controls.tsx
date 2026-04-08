import { GOLD, GOLD_BORDER } from '../constants/colors';
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
  isSyncMode: boolean;
  onPlayPause: () => void;
  onSkipToNext: () => void;
  onSkipToPrevious: () => void;
  onToggleMode: () => void;
  onToggleSync: () => void;
  isCareMode?: boolean;
}

const Controls: React.FC<ControlsProps> = ({
  isPlaying, playMode, isSyncMode, onPlayPause, onSkipToNext, onSkipToPrevious, onToggleMode, onToggleSync, isCareMode = false,
}) => {
  // 需求3: 普通模式 +20%, 关怀模式 +50%
  const playSize = isCareMode ? 123 : 98;
  const playCircleSize = isCareMode ? 150 : 120;
  const skipSize = 50;
  const modeSize = 35;
  const sidePad = 18;
  const modeIcon = MODE_CONFIG[playMode]?.icon || 'repeat';

  // 需求2: 关怀模式只显示播放/暂停
  if (isCareMode) {
    return (
      <View style={styles.container}>
        <View style={{ alignItems: 'center' }}>
          <Pressable onPress={onPlayPause} hitSlop={8}>
            <View style={[styles.playCircle, { width: playCircleSize, height: playCircleSize, borderRadius: playCircleSize / 2 }]}>
              <Icon name={isPlaying ? 'pause' : 'play-arrow'} size={playSize} color={GOLD} />
            </View>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.mainRow}>
        <View style={styles.leftCol}>
          <Pressable onPress={onToggleMode} hitSlop={12} style={{ padding: sidePad }}>
            <Icon name={modeIcon} size={modeSize} color="rgba(255,255,255,0.55)" />
          </Pressable>
          <Pressable onPress={onSkipToPrevious} hitSlop={12} style={{ padding: sidePad }}>
            <Icon name="skip-previous" size={skipSize} color="rgba(255,255,255,0.8)" />
          </Pressable>
        </View>
        <Pressable onPress={onPlayPause} hitSlop={8} style={styles.playBtn}>
          <View style={[styles.playCircle, { width: playCircleSize, height: playCircleSize, borderRadius: playCircleSize / 2 }]}>
            <Icon name={isPlaying ? 'pause' : 'play-arrow'} size={playSize} color={GOLD} />
          </View>
        </Pressable>
        <View style={styles.rightCol}>
          <Pressable onPress={onToggleSync} hitSlop={12} style={{ padding: sidePad }}>
            <Icon name={isSyncMode ? 'people-outline' : 'person-outline'} size={modeSize} color="rgba(255,255,255,0.55)" />
          </Pressable>
          <Pressable onPress={onSkipToNext} hitSlop={12} style={{ padding: sidePad }}>
            <Icon name="skip-next" size={skipSize} color="rgba(255,255,255,0.8)" />
          </Pressable>
        </View>
      </View>
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
});

export default Controls;
