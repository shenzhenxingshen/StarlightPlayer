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
import { isStartedFromZero, resetCycleIfCompleted } from '../services/playbackService';
import { loadTrack, getCurrentIndex, getNextIndex, getPrevIndex } from '../utils/trackManager';

// 标志：是否正在恢复上次状态，期间不保存
let restoring = true;

const PlayerScreen: React.FC = () => {
  const playbackState = usePlaybackState();
  const progress = useProgress(500);
  const activeTrack = useActiveTrack();
  const isPlaying = playbackState.state === State.Playing;
  const { isCareMode, repeatCount, isSyncMode, toggleSyncMode } = useSettingsStore();

  // 读取当前遍数（随 progress 刷新）
  const sessionCnt = loadSessionCount();
  const currentRepeat = isStartedFromZero() ? sessionCnt + 1 : sessionCnt;

  // 从持久化恢复 playMode
  const saved = useRef(loadPlayerState());
  const [playMode, setPlayMode] = useState<PlayMode>((saved.current?.playMode as PlayMode) || 'repeat-one');
  const [modeLabel, setModeLabel] = useState<string | null>(null);
  const labelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (labelTimer.current) clearTimeout(labelTimer.current); };
  }, []);

  // 恢复上次播放的歌曲
  useEffect(() => {
    (async () => {
      if (saved.current?.trackIndex != null && saved.current.trackIndex >= 0) {
        await loadTrack(saved.current.trackIndex);
        saved.current = null;
      }
      restoring = false;
    })();
  }, []);

  // 切歌时保存状态（恢复期间不保存）
  useEffect(() => {
    const sub = TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async () => {
      if (restoring) return;
      savePlayerState({ trackIndex: getCurrentIndex(), playMode });
    });
    return () => sub.remove();
  }, [playMode]);

  // App 进入后台时保存
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'background') {
        savePlayerState({ trackIndex: getCurrentIndex(), playMode });
      }
    });
    return () => sub.remove();
  }, [playMode]);

  // 关怀模式下精简通知栏按钮
  useEffect(() => {
    const caps = isCareMode
      ? [Capability.Play, Capability.Pause]
      : [Capability.Play, Capability.Pause, Capability.SkipToNext, Capability.SkipToPrevious, Capability.SeekTo, Capability.Stop];
    const compact = isCareMode
      ? [Capability.Play, Capability.Pause]
      : [Capability.Play, Capability.Pause, Capability.SkipToPrevious, Capability.SkipToNext];
    TrackPlayer.updateOptions({ capabilities: caps, compactCapabilities: compact }).catch(() => {});
  }, [isCareMode]);

  useEffect(() => {
    TrackPlayer.setRepeatMode(RepeatMode.Off);
  }, [playMode]);

  const showToast = useCallback((text: string) => {
    setModeLabel(text);
    if (labelTimer.current) clearTimeout(labelTimer.current);
    labelTimer.current = setTimeout(() => setModeLabel(null), 1500);
  }, []);

  const toggleMode = useCallback(() => {
    setPlayMode(prev => {
      const next = MODE_CONFIG[prev].next;
      showToast(MODE_CONFIG[next].label);
      savePlayerState({ trackIndex: getCurrentIndex(), playMode: next });
      return next;
    });
  }, [showToast]);

  const handleToggleSync = useCallback(() => {
    toggleSyncMode();
    showToast(isSyncMode ? '同步播放：关闭' : '同步播放：开启');
  }, [isSyncMode, toggleSyncMode, showToast]);

  const alignAndPlay = async () => {
    resetCycleIfCompleted();
    const track = TRACKS.find(t => t.id === activeTrack?.id);
    if (track?.durationMs && shouldSeekAlign(playMode)) {
      setAlignSeekExpectedUntil(Date.now() + 3000);
      await TrackPlayer.seekTo(msToSeconds(calculateAlignedPosition(track.durationMs)));
    }
    await TrackPlayer.play();
  };

  const handleSkipNext = async () => {
    await loadTrack(getNextIndex());
    await TrackPlayer.play();
  };

  const handleSkipPrev = async () => {
    await loadTrack(getPrevIndex());
    await TrackPlayer.play();
  };

  const displayTrack = TRACKS.find(t => t.id === activeTrack?.id) || null;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.albumArea}>
        <TrackInfo track={displayTrack} isPlaying={isPlaying} isCareMode={isCareMode} />
      </View>
      <View style={styles.progressArea}>
        <ProgressBar position={progress.position} duration={progress.duration} onSeek={() => {}} isCareMode={isCareMode} currentRepeat={currentRepeat} totalRepeat={repeatCount} />
      </View>
      <View style={styles.controlArea}>
        <Controls
          isPlaying={isPlaying}
          playMode={playMode}
          modeLabel={modeLabel}
          isSyncMode={isSyncMode}
          onPlayPause={isPlaying ? () => TrackPlayer.pause() : () => alignAndPlay()}
          onSkipToNext={handleSkipNext}
          onSkipToPrevious={handleSkipPrev}
          onToggleMode={toggleMode}
          onToggleSync={handleToggleSync}
          isCareMode={isCareMode}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  albumArea: { flex: 1, justifyContent: 'center' },
  progressArea: { paddingBottom: 8 },
  controlArea: { paddingBottom: 24 },
});

export default PlayerScreen;
