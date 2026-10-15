import { GOLD, GOLD_BORDER, GOLD_GLOW, INK, TEXT_SEC, BG_SURFACE } from '../constants/colors';
import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Text, StyleProp, ViewStyle } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';

export type PlayMode = 'play-one' | 'repeat-one' | 'play-all' | 'repeat-all';
export type ControlsOrientation = 'row' | 'rail';

export const MODE_CONFIG: Record<PlayMode, { icon: string; label: string; next: PlayMode }> = {
  'repeat-one': { icon: 'repeat-one', label: '单曲循环', next: 'play-one' },
  'play-one': { icon: 'looks-one', label: '单曲播放', next: 'repeat-all' },
  'repeat-all': { icon: 'repeat', label: '列表循环', next: 'play-all' },
  'play-all': { icon: 'playlist-play', label: '列表播放', next: 'repeat-one' },
};

export interface ControlSizes {
  playButton: number;
  playIcon: number;
  skipIcon: number;
  functionIcon: number;
}

export interface ControlsProps {
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
  orientation?: ControlsOrientation;
  sizes?: Partial<ControlSizes>;
  height?: number;
  modeLabelPlacement?: 'inline' | 'external';
}

interface ControlButtonProps {
  testID: string;
  accessibilityLabel: string;
  icon: string;
  iconSize: number;
  color: string;
  onPress: () => void;
  playButtonSize?: number;
  preferredFocus?: boolean;
  selected?: boolean;
}

const ControlButton: React.FC<ControlButtonProps> = ({
  testID,
  accessibilityLabel,
  icon,
  iconSize,
  color,
  onPress,
  playButtonSize,
  preferredFocus = false,
  selected = false,
}) => {
  const [focused, setFocused] = useState(false);
  const buttonStyle: StyleProp<ViewStyle> = [
    styles.button,
    playButtonSize != null && {
      width: playButtonSize,
      height: playButtonSize,
      borderRadius: playButtonSize / 2,
      borderWidth: 2,
      borderColor: GOLD_BORDER,
      backgroundColor: GOLD_GLOW,
    },
    focused && styles.buttonFocused,
  ];

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      hasTVPreferredFocus={preferredFocus}
      hitSlop={8}
      style={buttonStyle}>
      <Icon name={icon} size={iconSize} color={color} />
    </Pressable>
  );
};

const Controls: React.FC<ControlsProps> = ({
  isPlaying,
  playMode,
  isSyncMode,
  modeLabel,
  onPlayPause,
  onSkipToNext,
  onSkipToPrevious,
  onToggleMode,
  onToggleSync,
  isCareMode = false,
  orientation = 'row',
  sizes,
  height,
  modeLabelPlacement = 'inline',
}) => {
  const defaults: ControlSizes =
    orientation === 'rail'
      ? {
          playButton: isCareMode ? 72 : 58,
          playIcon: isCareMode ? 52 : 44,
          skipIcon: 34,
          functionIcon: 27,
        }
      : {
          playButton: isCareMode ? 112 : 76,
          playIcon: isCareMode ? 82 : 58,
          skipIcon: 38,
          functionIcon: 28,
        };
  const resolved = { ...defaults, ...sizes };
  const directionStyle = orientation === 'rail' ? styles.rail : styles.row;
  const containerStyle: StyleProp<ViewStyle> = [
    styles.container,
    directionStyle,
    height != null && { height },
  ];

  if (isCareMode) {
    return (
      <View testID={`controls-${orientation}`} style={[containerStyle, styles.careContainer]}>
        <ControlButton
          testID="play-pause-button"
          accessibilityLabel={isPlaying ? '暂停' : '播放'}
          icon={isPlaying ? 'pause' : 'play-arrow'}
          iconSize={resolved.playIcon}
          color={GOLD}
          onPress={onPlayPause}
          playButtonSize={resolved.playButton}
          preferredFocus
          selected={isPlaying}
        />
      </View>
    );
  }

  const mode = MODE_CONFIG[playMode] ?? MODE_CONFIG['repeat-one'];
  return (
    <View testID={`controls-${orientation}`} style={containerStyle}>
      {modeLabelPlacement === 'inline' && modeLabel && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{modeLabel}</Text>
        </View>
      )}
      <View style={styles.slot}>
        <ControlButton
          testID="play-mode-button"
          accessibilityLabel={`切换播放模式，当前${mode.label}`}
          icon={mode.icon}
          iconSize={resolved.functionIcon}
          color={TEXT_SEC}
          onPress={onToggleMode}
        />
      </View>
      <View style={styles.slot}>
        <ControlButton
          testID="previous-button"
          accessibilityLabel="上一首"
          icon="skip-previous"
          iconSize={resolved.skipIcon}
          color={INK}
          onPress={onSkipToPrevious}
        />
      </View>
      <View style={styles.slot}>
        <ControlButton
          testID="play-pause-button"
          accessibilityLabel={isPlaying ? '暂停' : '播放'}
          icon={isPlaying ? 'pause' : 'play-arrow'}
          iconSize={resolved.playIcon}
          color={GOLD}
          onPress={onPlayPause}
          playButtonSize={resolved.playButton}
          preferredFocus
          selected={isPlaying}
        />
      </View>
      <View style={styles.slot}>
        <ControlButton
          testID="next-button"
          accessibilityLabel="下一首"
          icon="skip-next"
          iconSize={resolved.skipIcon}
          color={INK}
          onPress={onSkipToNext}
        />
      </View>
      <View style={styles.slot}>
        <ControlButton
          testID="sync-button"
          accessibilityLabel={isSyncMode ? '关闭同步播放' : '开启同步播放'}
          icon={isSyncMode ? 'people-outline' : 'person-outline'}
          iconSize={resolved.functionIcon}
          color={isSyncMode ? GOLD : TEXT_SEC}
          onPress={onToggleSync}
          selected={isSyncMode}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignSelf: 'center',
  },
  row: {
    width: '100%',
    maxWidth: 640,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rail: {
    width: '100%',
    height: '100%',
    flexDirection: 'column',
    alignItems: 'center',
  },
  careContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  slot: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonFocused: {
    borderWidth: 3,
    borderColor: GOLD,
    backgroundColor: GOLD_GLOW,
    transform: [{ scale: 1.08 }],
  },
  toast: {
    position: 'absolute',
    top: -30,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 2,
  },
  toastText: {
    color: GOLD,
    fontSize: 14,
    backgroundColor: BG_SURFACE,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GOLD_BORDER,
    overflow: 'hidden',
  },
});

export default Controls;
