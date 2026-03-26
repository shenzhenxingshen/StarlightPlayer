import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';

interface ControlsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onSkipToNext: () => void;
  onSkipToPrevious: () => void;
  isLargeTextMode?: boolean;
}

const Controls: React.FC<ControlsProps> = ({
  isPlaying,
  onPlayPause,
  onSkipToNext,
  onSkipToPrevious,
  isLargeTextMode = false,
}) => {
  // 根据大字模式调整样式
  const getIconSize = () => isLargeTextMode ? 64 : 40;
  const getPlayIconSize = () => isLargeTextMode ? 96 : 64;
  const getButtonPadding = () => isLargeTextMode ? 30 : 20;
  const getPlayButtonPadding = () => isLargeTextMode ? 40 : 25;

  return (
    <View style={styles.container}>
      <Pressable 
        onPress={onSkipToPrevious} 
        style={[styles.button, { paddingHorizontal: getButtonPadding() }]}
      >
        <Icon 
          name="skip-previous" 
          size={getIconSize()} 
          color="#ffffff" 
        />
      </Pressable>

      <Pressable 
        onPress={onPlayPause} 
        style={[styles.playButton, { paddingHorizontal: getPlayButtonPadding() }]}
      >
        <Icon 
          name={isPlaying ? "pause" : "play-arrow"} 
          size={getPlayIconSize()} 
          color="#ffffff" 
        />
      </Pressable>

      <Pressable 
        onPress={onSkipToNext} 
        style={[styles.button, { paddingHorizontal: getButtonPadding() }]}
      >
        <Icon 
          name="skip-next" 
          size={getIconSize()} 
          color="#ffffff" 
        />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  button: {
    paddingVertical: 10,
  },
  playButton: {
    paddingVertical: 10,
  },
});

export default Controls;