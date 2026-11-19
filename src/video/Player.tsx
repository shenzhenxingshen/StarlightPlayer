import React, { useEffect, useState } from 'react';
import {
  Alert,
  NativeModules,
  Pressable,
  requireNativeComponent,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  useWindowDimensions,
  View,
  ViewProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { sessionPosition, sessionTimeline } from '../../packages/program-core/src/tasks';
import { BG_GROUND, GOLD, INK, TEXT_SEC } from '../constants/colors';
import { VIDEO_CATALOG } from './catalog';
import { leaveVideo, pauseVideo, resumeVideo, useVideoState } from './runtime';

const VideoSurface = UIManager.getViewManagerConfig('VideoProgramView')
  ? requireNativeComponent<ViewProps>('VideoProgramView')
  : View;
const clock = (seconds: number) => {
  const s = Math.floor(Math.max(0, seconds));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map(n => String(n).padStart(2, '0'))
    .join(':');
};

export default function VideoPlayer() {
  const { session, error } = useVideoState();
  const { width, height } = useWindowDimensions();
  const [now, setNow] = useState(Date.now());
  const [nativeError, setNativeError] = useState<string | null>(null);
  const [nativePlaying, setNativePlaying] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    let polling = false;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (polling || !NativeModules.VideoProgramPlayer) return;
      polling = true;
      NativeModules.VideoProgramPlayer.getStatus()
        .then((state: { error?: string; playing: boolean }) => {
          if (active) {
            setNativeError(state.error || null);
            setNativePlaying(state.playing);
          }
        })
        .catch(() => {})
        .finally(() => {
          polling = false;
        });
    }, 500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  const invoke = (action: () => Promise<void>) => {
    setBusy(true);
    action()
      .catch(e => Alert.alert('视频播放', String(e)))
      .finally(() => setBusy(false));
  };
  const timeline = session ? sessionTimeline(session, VIDEO_CATALOG) : null;
  const position = session ? sessionPosition(session, VIDEO_CATALOG, now) : null;
  const elapsed =
    session && timeline
      ? Math.max(
          0,
          Math.min(
            (now - session.occurrence.startEpochMs) / 1000,
            timeline.totalTicks / timeline.timescale,
          ),
        )
      : 0;
  const total = timeline ? timeline.totalTicks / timeline.timescale : 0;
  const ended = position?.status === 'ended' || session?.intent === 'stopped';
  const playing = session?.intent === 'playing' && !ended && nativePlaying !== false;
  const asset =
    position?.status === 'active'
      ? VIDEO_CATALOG.assets.find(a => a.file === position.span.asset)
      : null;
  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{session?.occurrence.task.name || '视频任务'}</Text>
        <VideoSurface
          testID="video-program-surface"
          style={{
            width: Math.max(
              1,
              Math.min(width - 32, (Math.max(120, height - 200) * 856) / 482, 900),
            ),
            aspectRatio: 856 / 482,
            backgroundColor: 'black',
            alignSelf: 'center',
          }}
        />
        <Text style={styles.label}>{ended ? '本次流程已结束' : asset?.title || '等待开始'}</Text>
        {position?.status === 'active' && (
          <Text style={styles.label}>
            流程第 {position.span.index + 1} / {timeline?.spans.length} 段 · 当前片段第{' '}
            {position.span.repetition} 遍
          </Text>
        )}
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="整套流程进度"
          accessibilityValue={{ min: 0, max: Math.ceil(total), now: Math.floor(elapsed) }}
          style={styles.progress}>
          <View style={[styles.fill, { width: `${total ? (100 * elapsed) / total : 0}%` }]} />
        </View>
        <Text style={styles.label}>
          {clock(elapsed)} / {clock(total)}
        </Text>
        <Text style={styles.hint}>
          显示的是公共流程进度，不是本机完成遍数。暂停后继续将追平当前时刻。
        </Text>
        {(error || nativeError) && (
          <Text accessibilityRole="alert" style={styles.error}>
            {error || nativeError}
          </Text>
        )}
        <View style={styles.row}>
          {!ended && (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              style={styles.button}
              onPress={() => invoke(playing ? pauseVideo : resumeVideo)}>
              <Text style={styles.action}>{playing ? '暂停视频' : '追平并继续'}</Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={styles.button}
            onPress={() => invoke(leaveVideo)}>
            <Text style={styles.action}>返回音频播放</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG_GROUND },
  content: { padding: 16, gap: 12, maxWidth: 1000, width: '100%', alignSelf: 'center' },
  title: { color: INK, fontSize: 22, textAlign: 'center', fontWeight: '600' },
  label: { color: INK, fontSize: 16, textAlign: 'center' },
  hint: { color: TEXT_SEC, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  progress: { height: 5, borderRadius: 4, backgroundColor: '#DDD4C4', overflow: 'hidden' },
  fill: { height: 5, backgroundColor: GOLD },
  row: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 16 },
  button: { minHeight: 48, padding: 12, justifyContent: 'center' },
  action: { fontSize: 18, color: GOLD },
  error: { color: '#A52A2A', textAlign: 'center' },
});
