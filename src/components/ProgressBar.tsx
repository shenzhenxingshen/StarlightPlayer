import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, Slider } from 'react-native';

interface ProgressBarProps {
  position: number;
  duration: number;
  onSeek: (value: number) => void;
  isLargeTextMode?: boolean;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ 
  position, 
  duration, 
  onSeek,
  isLargeTextMode = false 
}) => {
  const [currentPosition, setCurrentPosition] = useState(position);

  useEffect(() => {
    setCurrentPosition(position);
  }, [position]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getTextStyle = () => ({
    fontSize: isLargeTextMode ? 18 : 12,
  });

  const getSliderHeight = () => isLargeTextMode ? 20 : 40;

  return (
    <View style={styles.container}>
      <Text style={[styles.time, getTextStyle()]}>{formatTime(currentPosition)}</Text>
      <Slider
        style={[styles.slider, { height: getSliderHeight() }]}
        minimumValue={0}
        maximumValue={duration}
        value={currentPosition}
        disabled={true}
        minimumTrackTintColor="#ffffff"
        maximumTrackTintColor="rgba(255, 255, 255, 0.3)"
        thumbTintColor="#ffffff"
      />
      <Text style={[styles.time, getTextStyle()]}>{formatTime(duration)}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  slider: {
    flex: 1,
    marginHorizontal: 10,
  },
  time: {
    color: '#ffffff',
    minWidth: 50,
    textAlign: 'center',
  },
});

export default ProgressBar;