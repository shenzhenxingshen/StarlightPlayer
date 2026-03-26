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

const Controls: React.FC<ControlsProps> = ({ isPlaying, onPlayPause, onSkipToNext, onSkipToPrevious, isLargeTextMode = false }) => {
  const skipSize = isLargeTextMode ? 44 : 36;
  const playSize = isLargeTextMode ? 72 : 60;

  return (
    <View style={styles.container}>
      <Pressable onPress={onSkipToPrevious} style={styles.sideBtn} hitSlop={12}>
        <Icon name="skip-previous" size={skipSize} color="rgba(255,255,255,0.8)" />
      </Pressable>
      <Pressable onPress={onPlayPause} style={styles.playBtn} hitSlop={8}>
        <View style={styles.playCircle}>
          <Icon name={isPlaying ? 'pause' : 'play-arrow'} size={playSize} color="#ffd700" />
        </View>
      </Pressable>
      <Pressable onPress={onSkipToNext} style={styles.sideBtn} hitSlop={12}>
        <Icon name="skip-next" size={skipSize} color="rgba(255,255,255,0.8)" />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  sideBtn: { padding: 16 },
  playBtn: { marginHorizontal: 28 },
  playCircle: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: 'rgba(255,215,0,0.4)', alignItems: 'center', justifyContent: 'center' },
});

export default Controls;
