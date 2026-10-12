import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TrackPlayer, {
  usePlaybackState,
  useProgress,
  useActiveTrack,
  State,
  Event,
} from 'react-native-track-player';
import TrackInfo from '../components/TrackInfo';
import Controls, { PlayMode, MODE_CONFIG } from '../components/Controls';
import ProgressBar from '../components/ProgressBar';
import { useSettingsStore } from '../store/settingsStore';
import { calculateAlignedPosition, msToSeconds } from '../utils/syncUtils';
import { TRACKS } from '../constants/tracks';
import {
  loadCycleEligible,
  getSettings,
  loadPlayerState,
  loadSessionCount,
  loadTrackGeneration,
  savePlaybackPausedAt,
  saveExpectedPlaying,
  savePlayerState,
} from '../utils/storage';
import {
  getCurrentIndex,
  getNextIndex,
  getPrevIndex,
  ensureCurrentTrackLoadedInCommand,
  ensurePlayableAndPlayInCommand,
  loadNextTrackAndPlay,
  loadPreviousTrackAndPlay,
} from '../utils/trackManager';
import { addLog } from '../utils/logger';
import { BG_GROUND } from '../constants/colors';
import { enqueuePlayerCommand } from '../utils/playerCommandQueue';
import { resetCycleIfCompleted, seekWithReasonInCommand } from '../utils/playbackCycle';
import { buildPlayerOptions } from '../utils/playerOptions';

// 标志：是否正在恢复上次状态，期间不保存
let restoring = true;

const PlayerScreen: React.FC = () => {
  const playbackState = usePlaybackState();
  const progress = useProgress(500);
  const activeTrack = useActiveTrack();
  const isPlaying =
    playbackState.state === State.Playing ||
    playbackState.state === State.Buffering ||
    playbackState.state === State.Loading;
  const { isCareMode, repeatCount, isSyncMode, toggleSyncMode } = useSettingsStore();

  // 读取当前遍数（随 progress 刷新）
  const sessionCnt = loadSessionCount();
  const currentRepeat = loadCycleEligible() ? sessionCnt + 1 : sessionCnt;

  // 从持久化恢复 playMode（曲目本身已由 App.tsx 初始化时加载）
  const saved = useRef(loadPlayerState());
  const [playMode, setPlayMode] = useState<PlayMode>(
    (saved.current?.playMode as PlayMode) || 'repeat-one',
  );
  const playModeRef = useRef(playMode);
  playModeRef.current = playMode;
  const [modeLabel, setModeLabel] = useState<string | null>(null);
  const labelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (labelTimer.current) clearTimeout(labelTimer.current);
    };
  }, []);

  // 恢复完成标志：曲目由 App.tsx 一次性 loadTrack 完成，这里仅释放 restoring
  useEffect(() => {
    saved.current = null;
    restoring = false;
  }, []);

  // 切歌时保存状态（恢复期间不保存）
  useEffect(() => {
    const sub = TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async () => {
      if (restoring) return;
      savePlayerState({ trackIndex: getCurrentIndex(), playMode: playModeRef.current });
    });
    return () => sub.remove();
  }, []);

  // App 进入后台时保存
  useEffect(() => {
    const sub = AppState.addEventListener('change', async state => {
      if (state === 'background' || state === 'active') addLog('INFO', `AppState: ${state}`);
      if (state === 'background') {
        savePlayerState({ trackIndex: getCurrentIndex(), playMode: playModeRef.current });
      }
    });
    return () => sub.remove();
  }, []);

  // 关怀/同步设置改变时同步收紧锁屏能力。
  useEffect(() => {
    enqueuePlayerCommand('UI:updateOptions', () =>
      TrackPlayer.updateOptions(buildPlayerOptions({ isCareMode, isSyncMode })),
    ).catch(error => addLog('ERROR', 'UI:updateOptions failed', error));
  }, [isCareMode, isSyncMode]);

  const showToast = useCallback((text: string) => {
    setModeLabel(text);
    if (labelTimer.current) clearTimeout(labelTimer.current);
    labelTimer.current = setTimeout(() => setModeLabel(null), 1500);
  }, []);

  const toggleMode = useCallback(() => {
    setPlayMode(prev => {
      const next = MODE_CONFIG[prev].next;
      addLog('INFO', `toggleMode: ${prev}→${next}`);
      showToast(MODE_CONFIG[next].label);
      playModeRef.current = next;
      savePlayerState({ trackIndex: getCurrentIndex(), playMode: next });
      return next;
    });
  }, [showToast]);

  const handleToggleSync = useCallback(async () => {
    const currentSyncMode = useSettingsStore.getState().isSyncMode;
    const willSync = !currentSyncMode;
    addLog('INFO', `toggleSync: ${currentSyncMode}→${willSync}`);
    toggleSyncMode();
    showToast(willSync ? '同步播放：开启' : '同步播放：关闭');
    // 开启同步时立即执行一次进度对齐
    if (willSync && activeTrack?.id) {
      const track = TRACKS.find(t => t.id === activeTrack.id);
      if (track?.durationMs) {
        await enqueuePlayerCommand('UI:enableSync', async () => {
          if (!getSettings().isSyncMode) {
            addLog('INFO', 'UI:enableSync cancelled because sync mode changed again');
            return;
          }
          const loadedTrack = await ensureCurrentTrackLoadedInCommand('UI:enableSync');
          if (!getSettings().isSyncMode) {
            addLog('INFO', 'UI:enableSync cancelled after track lookup because sync mode changed');
            return;
          }
          if (!loadedTrack.durationMs) return;
          await seekWithReasonInCommand(
            msToSeconds(calculateAlignedPosition(loadedTrack.durationMs)),
            'sync-join',
            msToSeconds(loadedTrack.durationMs),
          );
        }).catch(error => addLog('ERROR', 'UI:enableSync failed', error));
      }
    }
  }, [toggleSyncMode, showToast, activeTrack]);

  const playCurrent = async () => {
    addLog('INFO', `Play(UI): track=${activeTrack?.id} session=${loadSessionCount()}`);
    await enqueuePlayerCommand('UI:play', async () => {
      const didReset = resetCycleIfCompleted();
      const track = await ensureCurrentTrackLoadedInCommand('UI:play');
      const syncMode = getSettings().isSyncMode;
      if (track.durationMs && syncMode) {
        await seekWithReasonInCommand(
          msToSeconds(calculateAlignedPosition(track.durationMs)),
          'sync-resume',
          msToSeconds(track.durationMs),
        );
      } else if (didReset) {
        await seekWithReasonInCommand(0, 'cycle-restart', msToSeconds(track?.durationMs || 0));
      }
      await ensurePlayableAndPlayInCommand('UI:play', { restartTerminal: !syncMode });
    }).catch(error => {
      saveExpectedPlaying(false);
      addLog('ERROR', 'UI:play failed', error);
    });
  };

  const pauseCurrent = async () => {
    await enqueuePlayerCommand('UI:pause', async () => {
      saveExpectedPlaying(false);
      savePlaybackPausedAt();
      await TrackPlayer.pause();
    }).catch(error => addLog('ERROR', 'UI:pause failed', error));
  };

  const handleSkipNext = async () => {
    addLog('INFO', `SkipNext: ${getCurrentIndex()}→${getNextIndex()}`);
    await loadNextTrackAndPlay('user').catch(error => {
      saveExpectedPlaying(false);
      addLog('ERROR', 'UI:skipNext failed', error);
    });
  };

  const handleSkipPrev = async () => {
    addLog('INFO', `SkipPrev: ${getCurrentIndex()}→${getPrevIndex()}`);
    await loadPreviousTrackAndPlay('user').catch(error => {
      saveExpectedPlaying(false);
      addLog('ERROR', 'UI:skipPrevious failed', error);
    });
  };

  const handleSeek = async (position: number) => {
    const requestedTrackId = activeTrack?.id == null ? null : String(activeTrack.id);
    const requestedGeneration = loadTrackGeneration();
    await enqueuePlayerCommand('UI:seek', async () => {
      const nativeTrack = await TrackPlayer.getActiveTrack();
      const settings = getSettings();
      if (
        requestedGeneration !== loadTrackGeneration() ||
        requestedTrackId !== String(nativeTrack?.id) ||
        settings.isSyncMode ||
        settings.isCareMode
      ) {
        addLog(
          'WARN',
          `UI:seek stale/locked ignored for ${requestedTrackId ?? 'none'} sync=${settings.isSyncMode} care=${settings.isCareMode}`,
        );
        return;
      }
      const track = TRACKS.find(t => t.id === requestedTrackId);
      await seekWithReasonInCommand(position, 'user-seek', msToSeconds(track?.durationMs || 0));
    }).catch(error => addLog('ERROR', 'UI:seek failed', error));
  };

  const displayTrack = TRACKS.find(t => t.id === activeTrack?.id) || null;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.albumArea}>
        <TrackInfo track={displayTrack} isPlaying={isPlaying} isCareMode={isCareMode} />
      </View>
      <View style={styles.progressArea}>
        <ProgressBar
          position={progress.position}
          duration={progress.duration}
          onSeek={handleSeek}
          seekable={!isSyncMode && !isCareMode}
          isCareMode={isCareMode}
          currentRepeat={currentRepeat}
          totalRepeat={repeatCount}
        />
      </View>
      <View style={styles.controlArea}>
        <Controls
          isPlaying={isPlaying}
          playMode={playMode}
          isSyncMode={isSyncMode}
          modeLabel={modeLabel}
          onPlayPause={isPlaying ? pauseCurrent : playCurrent}
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
  container: { flex: 1, backgroundColor: BG_GROUND },
  albumArea: { flex: 1, justifyContent: 'center', overflow: 'hidden' },
  progressArea: { paddingBottom: 8 },
  controlArea: { paddingBottom: 24, paddingTop: 16 },
});

export default PlayerScreen;
