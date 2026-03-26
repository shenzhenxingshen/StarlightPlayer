import React, { useEffect } from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePlayerStore } from '../store/playerStore';
import { usePlaylistStore } from '../store/playlistStore';
import TrackInfo from '../components/TrackInfo';
import Controls from '../components/Controls';
import ProgressBar from '../components/ProgressBar';
import { isLargeTextMode } from '../utils/storage';

const PlayerScreen: React.FC = () => {
  const { 
    state, 
    currentTrack, 
    position, 
    duration,
    play, 
    pause, 
    seekTo,
    skipToNext, 
    skipToPrevious,
    initialize
  } = usePlayerStore();
  
  const { getCurrentTrack } = usePlaylistStore();
  const [largeTextMode, setLargeTextMode] = React.useState(false);

  useEffect(() => {
    initialize();
    setLargeTextMode(isLargeTextMode());
  }, []);

  useEffect(() => {
    setLargeTextMode(isLargeTextMode());
  }, [state]);

  const handlePlayPause = () => {
    if (state === 'playing') {
      pause();
    } else {
      play();
    }
  };

  const handleSeek = (value: number) => {
    seekTo(value);
  };

  const isPlaying = state === 'playing';
  const displayTrack = currentTrack || getCurrentTrack();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" />
      <View style={styles.content}>
        <TrackInfo 
          track={displayTrack} 
          isLargeTextMode={largeTextMode}
        />
        <ProgressBar 
          position={position} 
          duration={duration} 
          onSeek={handleSeek}
          isLargeTextMode={largeTextMode}
        />
        <Controls
          isPlaying={isPlaying}
          onPlayPause={handlePlayPause}
          onSkipToNext={skipToNext}
          onSkipToPrevious={skipToPrevious}
          isLargeTextMode={largeTextMode}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
});

export default PlayerScreen;