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
import { setAlignSeekExpectedUntil, savePlayerState, loadPlayerState, shouldSeekAlign, loadSessionCount } from '../utils/storage';
import { setManualSkip, isStartedFromZero } from '../services/playbackService';

// 标志：是否正在恢复上次状态，期间不保存
let restoring = true;

const PlayerScreen: React.FC = () => {
  const playbackState = usePlaybackState();
  const progress = useProgress(500);
  const activeTrack = useActiveTrack();
  const isPlaying = playbackState.state === State.Playing;
  const { isCareMode, repeatCount } = useSettingsStore();

  // 读取当前遍数（随 progress 刷新）
  // sessionCount 是已完成遍数；未从头播放的那遍显示为第 0 遍
  const sessionCnt = loadSessionCount();
  const currentRepeat = isStartedFromZero() ? sessionCnt + 1 : sessionCnt;

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
    (async () => {
      if (saved.current?.trackIndex != null && saved.current.trackIndex >= 0) {
        setManualSkip(true);
        await TrackPlayer.skip(saved.current.trackIndex).catch(() => {});
        saved.current = null;
      }
      // 恢复完成，允许后续保存
      restoring = false;
    })();
  }, []);

  // 需求1: 切歌时保存状态（恢复期间不保存）
  useEffect(() => {
    const sub = TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async () => {
      if (restoring) return;
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

  // 统一使用 RepeatMode.Off，播完由 PlaybackQueueEnded / ActiveTrackChanged 事件驱动
  useEffect(() => {
    TrackPlayer.setRepeatMode(RepeatMode.Off);
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
    if (track?.durationMs && shouldSeekAlign(playMode)) {
      setAlignSeekExpectedUntil(Date.now() + 3000);
      await TrackPlayer.seekTo(msToSeconds(calculateAlignedPosition(track.durationMs)));
    }
    await TrackPlayer.play();
  };

  const handleSkipNext = async () => {
    try {
      setManualSkip(true);
      await TrackPlayer.skipToNext();
      const idx = await TrackPlayer.getActiveTrackIndex();
      const queue = await TrackPlayer.getQueue();
      if (idx !== null && idx !== undefined) {
        if (shouldSeekAlign(playMode)) {
          await alignAndPlay(queue[idx]?.id);
        } else {
          await TrackPlayer.play();
        }
      }
    } catch { setManualSkip(false); }
  };

  const handleSkipPrev = async () => {
    try {
      setManualSkip(true);
      await TrackPlayer.skipToPrevious();
      const idx = await TrackPlayer.getActiveTrackIndex();
      const queue = await TrackPlayer.getQueue();
      if (idx !== null && idx !== undefined) {
        if (shouldSeekAlign(playMode)) {
          await alignAndPlay(queue[idx]?.id);
        } else {
          await TrackPlayer.play();
        }
      }
    } catch { setManualSkip(false); }
  };

  const displayTrack = TRACKS.find(t => t.id === activeTrack?.id) || null;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.topArea}>
        <TrackInfo track={displayTrack} isPlaying={isPlaying} isCareMode={isCareMode} />
        {/* onSeek 故意禁用：多人同步播放场景下，进度由 alignAndPlay 按时钟对齐，不允许手动 seek */}
        <ProgressBar position={progress.position} duration={progress.duration} onSeek={() => {}} isCareMode={isCareMode} currentRepeat={currentRepeat} totalRepeat={repeatCount} />
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
