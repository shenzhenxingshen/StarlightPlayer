import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TrackPlayer, { usePlaybackState, useProgress, useActiveTrack, State, RepeatMode, Event } from 'react-native-track-player';
import TrackInfo from '../components/TrackInfo';
import Controls, { PlayMode, MODE_CONFIG } from '../components/Controls';
import ProgressBar from '../components/ProgressBar';
import { useSettingsStore } from '../store/settingsStore';
import { calculateAlignedPosition, msToSeconds } from '../utils/syncUtils';
import { TRACKS } from '../constants/tracks';

// 标志：是否为手动切歌
let manualSkip = false;

const PlayerScreen: React.FC = () => {
  const playbackState = usePlaybackState();
  const progress = useProgress(500);
  const activeTrack = useActiveTrack();
  const isPlaying = playbackState.state === State.Playing;
  const { isLargeTextMode } = useSettingsStore();
  const [playMode, setPlayMode] = useState<PlayMode>('repeat-one');
  const [modeLabel, setModeLabel] = useState<string | null>(null);
  const labelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 应用播放模式到 RNTP
  useEffect(() => {
    (async () => {
      switch (playMode) {
        case 'repeat-one':
          await TrackPlayer.setRepeatMode(RepeatMode.Track);
          break;
        case 'repeat-all':
          await TrackPlayer.setRepeatMode(RepeatMode.Queue);
          break;
        default:
          // play-one 和 play-all 都用 Off，由事件控制行为
          await TrackPlayer.setRepeatMode(RepeatMode.Off);
      }
    })();
  }, [playMode]);

  // 单曲播放：自动切歌时跳回并暂停
  useEffect(() => {
    const sub = TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async (e) => {
      if (manualSkip) {
        manualSkip = false;
        return;
      }
      // 自动切歌
      if (playMode === 'play-one' && e.lastTrack != null && e.track != null) {
        if (e.lastIndex !== undefined && e.lastIndex !== null) {
          await TrackPlayer.skip(e.lastIndex);
          await TrackPlayer.pause();
        }
      }
    });

    const subEnd = TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async () => {
      if (playMode === 'play-all' || playMode === 'play-one') {
        await TrackPlayer.pause();
      }
    });

    return () => { sub.remove(); subEnd.remove(); };
  }, [playMode]);

  const toggleMode = useCallback(() => {
    setPlayMode(prev => {
      const next = MODE_CONFIG[prev].next;
      setModeLabel(MODE_CONFIG[next].label);
      if (labelTimer.current) clearTimeout(labelTimer.current);
      labelTimer.current = setTimeout(() => setModeLabel(null), 1500);
      return next;
    });
  }, []);

  const alignAndPlay = async (trackId?: string) => {
    const id = trackId ?? activeTrack?.id;
    const track = TRACKS.find(t => t.id === id);
    if (track?.durationMs) {
      await TrackPlayer.seekTo(msToSeconds(calculateAlignedPosition(track.durationMs)));
    }
    await TrackPlayer.play();
  };

  const handleSkipNext = async () => {
    manualSkip = true;
    await TrackPlayer.skipToNext();
    const idx = await TrackPlayer.getActiveTrackIndex();
    const queue = await TrackPlayer.getQueue();
    if (idx !== null && idx !== undefined) await alignAndPlay(queue[idx]?.id);
  };

  const handleSkipPrev = async () => {
    manualSkip = true;
    await TrackPlayer.skipToPrevious();
    const idx = await TrackPlayer.getActiveTrackIndex();
    const queue = await TrackPlayer.getQueue();
    if (idx !== null && idx !== undefined) await alignAndPlay(queue[idx]?.id);
  };

  const displayTrack = TRACKS.find(t => t.id === activeTrack?.id) || null;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.topArea}>
        <TrackInfo track={displayTrack} isPlaying={isPlaying} isLargeTextMode={isLargeTextMode} />
        <ProgressBar position={progress.position} duration={progress.duration} onSeek={() => {}} isLargeTextMode={isLargeTextMode} />
      </View>
      <View style={styles.bottomArea}>
        <Controls
          isPlaying={isPlaying}
          playMode={playMode}
          modeLabel={modeLabel}
          onPlayPause={isPlaying ? () => TrackPlayer.pause() : () => alignAndPlay()}
          onSkipToNext={handleSkipNext}
          onSkipToPrevious={handleSkipPrev}
          onToggleMode={toggleMode}
          isLargeTextMode={isLargeTextMode}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  topArea: { flex: 1, justifyContent: 'center' },
  bottomArea: { justifyContent: 'center', paddingBottom: 24, flex: 0.4 },
});

export default PlayerScreen;
