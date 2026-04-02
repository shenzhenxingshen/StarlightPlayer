import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TrackPlayer, { usePlaybackState, useProgress, useActiveTrack, State, RepeatMode, Event, Capability } from 'react-native-track-player';
import TrackInfo from '../components/TrackInfo';
import Controls, { PlayMode, MODE_CONFIG } from '../components/Controls';
import ProgressBar from '../components/ProgressBar';
import { useSettingsStore } from '../store/settingsStore';
import { calculateAlignedPosition, msToSeconds } from '../utils/syncUtils';
import { TRACKS } from '../constants/tracks';
import { setAlignSeekExpectedUntil, savePlayerState, loadPlayerState } from '../utils/storage';

// 标志：是否为手动切歌或 play-one 回跳
let skipGuard = false;

const PlayerScreen: React.FC = () => {
  const playbackState = usePlaybackState();
  const progress = useProgress(500);
  const activeTrack = useActiveTrack();
  const isPlaying = playbackState.state === State.Playing;
  const { isCareMode } = useSettingsStore();

  // 需求1: 从持久化恢复 playMode
  const saved = useRef(loadPlayerState());
  const [playMode, setPlayMode] = useState<PlayMode>((saved.current?.playMode as PlayMode) || 'repeat-one');
  const [modeLabel, setModeLabel] = useState<string | null>(null);
  const labelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (labelTimer.current) clearTimeout(labelTimer.current); };
  }, []);

  // 需求1: 恢复上次播放的歌曲
  useEffect(() => {
    if (saved.current?.trackIndex != null && saved.current.trackIndex >= 0) {
      TrackPlayer.skip(saved.current.trackIndex).catch(() => {});
      saved.current = null; // 只恢复一次
    }
  }, []);

  // 需求1: 切歌时保存状态
  useEffect(() => {
    const sub = TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async () => {
      const idx = await TrackPlayer.getActiveTrackIndex();
      if (idx != null) savePlayerState({ trackIndex: idx, playMode });
    });
    return () => sub.remove();
  }, [playMode]);

  // 需求1: App 进入后台时保存
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'background') {
        const idx = await TrackPlayer.getActiveTrackIndex();
        if (idx != null) savePlayerState({ trackIndex: idx, playMode });
      }
    });
    return () => sub.remove();
  }, [playMode]);

  // 需求2: 关怀模式下精简通知栏按钮
  useEffect(() => {
    const caps = isCareMode
      ? [Capability.Play, Capability.Pause]
      : [Capability.Play, Capability.Pause, Capability.SkipToNext, Capability.SkipToPrevious, Capability.SeekTo, Capability.Stop];
    const compact = isCareMode
      ? [Capability.Play, Capability.Pause]
      : [Capability.Play, Capability.Pause, Capability.SkipToPrevious, Capability.SkipToNext];
    TrackPlayer.updateOptions({ capabilities: caps, compactCapabilities: compact }).catch(() => {});
  }, [isCareMode]);

  // 应用播放模式到 RNTP
  useEffect(() => {
    (async () => {
      switch (playMode) {
        case 'repeat-one': await TrackPlayer.setRepeatMode(RepeatMode.Track); break;
        case 'repeat-all': await TrackPlayer.setRepeatMode(RepeatMode.Queue); break;
        default: await TrackPlayer.setRepeatMode(RepeatMode.Off);
      }
    })();
  }, [playMode]);

  // 单曲播放：自动切歌时跳回并暂停
  useEffect(() => {
    const sub = TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async (e) => {
      if (skipGuard) { skipGuard = false; return; }
      if (playMode === 'play-one' && e.lastTrack != null && e.track != null) {
        if (e.lastIndex !== undefined && e.lastIndex !== null) {
          skipGuard = true; // 防止回跳触发再次进入
          await TrackPlayer.skip(e.lastIndex);
          await TrackPlayer.pause();
        }
      }
    });
    const subEnd = TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async () => {
      if (playMode === 'play-all' || playMode === 'play-one') await TrackPlayer.pause();
    });
    return () => { sub.remove(); subEnd.remove(); };
  }, [playMode]);

  const toggleMode = useCallback(() => {
    setPlayMode(prev => {
      const next = MODE_CONFIG[prev].next;
      setModeLabel(MODE_CONFIG[next].label);
      if (labelTimer.current) clearTimeout(labelTimer.current);
      labelTimer.current = setTimeout(() => setModeLabel(null), 1500);
      // 需求1: 切模式时保存
      TrackPlayer.getActiveTrackIndex().then(idx => {
        if (idx != null) savePlayerState({ trackIndex: idx, playMode: next });
      });
      return next;
    });
  }, []);

  const alignAndPlay = async (trackId?: string) => {
    const id = trackId ?? activeTrack?.id;
    const track = TRACKS.find(t => t.id === id);
    if (track?.durationMs) {
      setAlignSeekExpectedUntil(Date.now() + 3000);
      await TrackPlayer.seekTo(msToSeconds(calculateAlignedPosition(track.durationMs)));
    }
    await TrackPlayer.play();
  };

  const handleSkipNext = async () => {
    try {
      skipGuard = true;
      await TrackPlayer.skipToNext();
      const idx = await TrackPlayer.getActiveTrackIndex();
      const queue = await TrackPlayer.getQueue();
      if (idx !== null && idx !== undefined) await alignAndPlay(queue[idx]?.id);
    } catch { skipGuard = false; }
  };

  const handleSkipPrev = async () => {
    try {
      skipGuard = true;
      await TrackPlayer.skipToPrevious();
      const idx = await TrackPlayer.getActiveTrackIndex();
      const queue = await TrackPlayer.getQueue();
      if (idx !== null && idx !== undefined) await alignAndPlay(queue[idx]?.id);
    } catch { skipGuard = false; }
  };

  const displayTrack = TRACKS.find(t => t.id === activeTrack?.id) || null;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.topArea}>
        <TrackInfo track={displayTrack} isPlaying={isPlaying} isCareMode={isCareMode} />
        {/* onSeek 故意禁用：多人同步播放场景下，进度由 alignAndPlay 按时钟对齐，不允许手动 seek */}
        <ProgressBar position={progress.position} duration={progress.duration} onSeek={() => {}} isCareMode={isCareMode} />
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
          isCareMode={isCareMode}
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
