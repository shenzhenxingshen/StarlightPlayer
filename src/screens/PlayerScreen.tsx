import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TrackPlayer, { usePlaybackState, useProgress, useActiveTrack, State } from 'react-native-track-player';
import TrackInfo from '../components/TrackInfo';
import Controls from '../components/Controls';
import ProgressBar from '../components/ProgressBar';
import { useSettingsStore } from '../store/settingsStore';
import { calculateAlignedPosition, msToSeconds } from '../utils/syncUtils';
import { TRACKS } from '../constants/tracks';
import { incrementPlaybackCount } from '../utils/storage';

const PlayerScreen: React.FC = () => {
  const playbackState = usePlaybackState();
  const progress = useProgress(500);
  const activeTrack = useActiveTrack();
  const isPlaying = playbackState.state === State.Playing;
  const { isLargeTextMode } = useSettingsStore();

  const alignAndPlay = async (trackId?: string) => {
    const id = trackId ?? activeTrack?.id;
    const track = TRACKS.find(t => t.id === id);
    if (track?.durationMs) {
      await TrackPlayer.seekTo(msToSeconds(calculateAlignedPosition(track.durationMs)));
      incrementPlaybackCount(track.id);
    }
    await TrackPlayer.play();
  };

  const handleSkipNext = async () => {
    await TrackPlayer.skipToNext();
    const idx = await TrackPlayer.getActiveTrackIndex();
    const queue = await TrackPlayer.getQueue();
    if (idx !== null && idx !== undefined) await alignAndPlay(queue[idx]?.id);
  };

  const handleSkipPrev = async () => {
    await TrackPlayer.skipToPrevious();
    const idx = await TrackPlayer.getActiveTrackIndex();
    const queue = await TrackPlayer.getQueue();
    if (idx !== null && idx !== undefined) await alignAndPlay(queue[idx]?.id);
  };

  const displayTrack = TRACKS.find(t => t.id === activeTrack?.id) || null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <TrackInfo track={displayTrack} isLargeTextMode={isLargeTextMode} />
        <ProgressBar position={progress.position} duration={progress.duration} onSeek={() => {}} isLargeTextMode={isLargeTextMode} />
        <Controls
          isPlaying={isPlaying}
          onPlayPause={isPlaying ? () => TrackPlayer.pause() : () => alignAndPlay()}
          onSkipToNext={handleSkipNext}
          onSkipToPrevious={handleSkipPrev}
          isLargeTextMode={isLargeTextMode}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  content: { flex: 1, justifyContent: 'center' },
});

export default PlayerScreen;
