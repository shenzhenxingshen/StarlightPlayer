import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  BackHandler,
  NativeModules,
  Pressable,
  requireNativeComponent,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  UIManager,
  useWindowDimensions,
  View,
  ViewProps,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { sessionTimeline } from '../../packages/program-core/src/tasks';
import { BG_GROUND, BG_SURFACE, BORDER, GOLD, INK, TEXT_SEC } from '../constants/colors';
import { formatRepeatCount } from '../utils/numberFormat';
import { VIDEO_CATALOG } from './catalog';
import { leaveVideo, pauseVideo, resumeVideo, useVideoState } from './runtime';
import {
  durationText,
  fullscreenVideoLayout,
  programProgress,
  setVideoFullscreen,
  useVideoPresentation,
} from './presentation';

const VideoSurface = UIManager.getViewManagerConfig('VideoProgramView')
  ? requireNativeComponent<ViewProps>('VideoProgramView')
  : View;
const RATIO = 856 / 482;
type NativeStatus = { error?: string; playing: boolean; buffering?: boolean };

export default function VideoPlayer() {
  const { session, error } = useVideoState();
  const fullscreen = useVideoPresentation(s => s.fullscreen);
  const focused = useVideoPresentation(s => s.focused);
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(Date.now());
  const [native, setNative] = useState<NativeStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const invoking = useRef(false);
  const mounted = useRef(true);
  const scroll = useRef<ScrollView>(null);
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [interaction, setInteraction] = useState(0);
  const [showFlow, setShowFlow] = useState(false);
  const [screenReader, setScreenReader] = useState(true);
  const landscapePhone = width > height && height < 600;
  const wide = width >= 850 && height >= 600 && fontScale < 1.6;
  const timeline = useMemo(
    () => (session ? sessionTimeline(session, VIDEO_CATALOG) : null),
    [session],
  );
  const progress = useMemo(
    () => (session && timeline ? programProgress(session, timeline, now) : null),
    [session, timeline, now],
  );
  const ended = progress?.ended || session?.intent === 'stopped';
  const failure = error || native?.error;
  const running = session?.intent === 'playing' && !ended;
  const playing = running && native?.playing === true && !failure;
  const buffering = running && !failure && (native === null || native.buffering);
  const paused = !ended && !buffering && (!running || native?.playing === false || !!failure);
  const active = progress?.position.status === 'active' ? progress.position : null;
  const asset = active ? VIDEO_CATALOG.assets.find(a => a.file === active.span.asset) : null;
  const stage = ended ? '本次流程已结束' : asset?.title || '等待开始';
  const status = ended
    ? '本次流程已结束'
    : failure
      ? '播放中断 · 可重试追平'
      : busy
        ? '正在处理…'
        : buffering
          ? '正在准备并追平…'
          : paused
            ? '本机已暂停 · 任务仍在进行'
            : '按任务时间同步播放';

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      setVideoFullscreen(false);
    };
  }, []);
  useEffect(() => {
    setVideoFullscreen(focused && landscapePhone);
  }, [landscapePhone, focused]);
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [fullscreen]);
  useEffect(() => {
    let activePoll = true;
    let polling = false;
    setNative(null);
    const poll = () => {
      setNow(Date.now());
      if (polling || !NativeModules.VideoProgramPlayer) return;
      polling = true;
      NativeModules.VideoProgramPlayer.getStatus()
        .then((state: NativeStatus) => {
          if (activePoll) setNative(state);
        })
        .catch(() => {
          if (activePoll) setNative({ playing: false, error: '无法读取播放器状态，请重试' });
        })
        .finally(() => {
          polling = false;
        });
    };
    poll();
    const timer = setInterval(poll, 500);
    return () => {
      activePoll = false;
      clearInterval(timer);
    };
  }, [session?.occurrence.key]);
  useEffect(() => {
    let activeQuery = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then(value => {
        if (activeQuery) setScreenReader(value);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => {
      activeQuery = false;
      subscription.remove();
    };
  }, []);
  useEffect(() => {
    if (!fullscreen) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setVideoFullscreen(false);
      return true;
    });
    return () => subscription.remove();
  }, [fullscreen]);
  useEffect(() => {
    setShowControls(true);
    if (!fullscreen || !playing || busy || screenReader) return;
    const timer = setTimeout(() => setShowControls(false), 3000);
    return () => clearTimeout(timer);
  }, [fullscreen, playing, busy, screenReader, interaction]);
  const controlsVisible = showControls || !playing || busy || screenReader;
  const invoke = (action: () => Promise<void>) => {
    if (invoking.current) return;
    invoking.current = true;
    setBusy(true);
    action()
      .catch(e => Alert.alert('视频播放', String(e)))
      .finally(() => {
        invoking.current = false;
        if (mounted.current) setBusy(false);
      });
  };
  const toggleControls = () => {
    if (controlsVisible && playing && !screenReader) setShowControls(false);
    else {
      setShowControls(true);
      setInteraction(n => n + 1);
    }
  };
  const currentText =
    progress?.currentCycle != null ? formatRepeatCount(progress.currentCycle) : stage;
  const totalText = progress?.totalCycles ? formatRepeatCount(progress.totalCycles) : '';
  const renderProgress = (dark = false, compact = false) => (
    <View style={styles.timeline}>
      {!compact && <Text style={[styles.caption, dark && styles.light]}>正文进度</Text>}
      {!compact && (
        <Text
          testID="video-current-cycle"
          accessibilityLabel={
            progress?.currentCycle != null ? `正文进度第${progress.currentCycle}遍` : stage
          }
          style={[
            styles.cycle,
            progress?.currentCycle == null && styles.stage,
            dark && styles.light,
          ]}>
          {currentText}
        </Text>
      )}
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="整套流程已过时间（非本机完成量，不可拖动）"
        accessibilityValue={{
          min: 0,
          max: Math.ceil(progress?.totalSeconds || 0),
          now: Math.floor(progress?.elapsedSeconds || 0),
          text: `${durationText(progress?.elapsedSeconds || 0)} / ${durationText(progress?.totalSeconds || 0)}`,
        }}
        style={styles.progress}>
        <View style={[styles.fill, { width: `${(progress?.fraction || 0) * 100}%` }]} />
      </View>
      <View style={styles.times}>
        <Text style={[styles.time, dark && styles.light]}>
          {durationText(progress?.elapsedSeconds || 0)}
        </Text>
        {!compact && (
          <Text
            accessibilityLabel={`正文共${progress?.totalCycles || 0}遍`}
            testID="video-total-cycles"
            style={[styles.total, dark && styles.light]}>
            {totalText}
          </Text>
        )}
        <Text style={[styles.time, styles.right, dark && styles.light]}>
          {durationText(progress?.totalSeconds || 0)}
        </Text>
      </View>
    </View>
  );
  const renderPause = (dark = false) =>
    !ended && (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={paused ? '追平并继续' : '暂停视频'}
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        style={[styles.button, dark && styles.darkButton]}
        onPress={() => invoke(paused ? resumeVideo : pauseVideo)}>
        <Icon name={paused ? 'play-arrow' : 'pause'} size={28} color={dark ? 'white' : GOLD} />
        <Text style={[styles.action, dark && styles.light]}>
          {paused ? '追平并继续' : '暂停视频'}
        </Text>
      </Pressable>
    );
  // Measure the real navigation/safe-area viewport. Window dimensions alone can
  // include the tab bar, and aspectRatio + height can widen a Yoga node offscreen.
  const availableWidth = viewport?.width ?? width - insets.left - insets.right;
  const availableHeight = viewport?.height ?? Math.max(1, height - insets.top - insets.bottom);
  const fullLayout = fullscreenVideoLayout(availableWidth, availableHeight);
  const badgeText = ended
    ? '已结束'
    : progress?.currentCycle != null
      ? `${formatRepeatCount(progress.currentCycle)}/${totalText}`
      : asset?.role === 'intro'
        ? '片头'
        : asset?.role === 'salutation'
          ? '礼敬'
          : asset?.role === 'outro'
            ? '片尾'
            : '等待开始';
  const badgeLabel =
    !ended && progress?.currentCycle != null
      ? `公共正文进度第${progress.currentCycle}遍，共${progress.totalCycles}遍，非本机完成量`
      : `公共流程：${ended ? '已结束' : stage}`;
  return (
    <SafeAreaView
      style={[styles.root, fullscreen && styles.dark]}
      edges={['top', 'left', 'right', 'bottom']}>
      {fullscreen && <StatusBar hidden />}
      <ScrollView
        ref={scroll}
        testID="video-player-viewport"
        onLayout={({ nativeEvent: { layout } }) => {
          if (layout.width <= 0 || layout.height <= 0) return;
          setViewport(previous =>
            previous?.width === layout.width && previous.height === layout.height
              ? previous
              : { width: layout.width, height: layout.height },
          );
        }}
        scrollEnabled={!fullscreen}
        contentContainerStyle={fullscreen ? styles.fullContent : styles.content}>
        <View style={fullscreen && styles.hidden}>
          <Text style={styles.title}>{session?.occurrence.task.name || '视频任务'}</Text>
          <Text style={styles.caption}>{status}</Text>
        </View>
        <View style={[styles.layout, wide && !fullscreen && styles.columns]}>
          <View style={[styles.playerPane, wide && !fullscreen && styles.flexPane]}>
            {/* Same native surface/tree position: fullscreen never reloads or seeks. */}
            <View
              testID="video-stage"
              style={[
                styles.videoStage,
                fullscreen
                  ? { width: availableWidth, height: availableHeight }
                  : styles.normalVideoStage,
              ]}>
              <VideoSurface
                testID="video-program-surface"
                style={fullscreen ? fullLayout.video : styles.surface}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={fullscreen ? '显示或隐藏视频控制' : '全屏播放视频'}
                style={StyleSheet.absoluteFill}
                onPress={fullscreen ? toggleControls : () => setVideoFullscreen(true)}
              />
              {!fullscreen && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="进入全屏"
                  style={styles.expand}
                  onPress={() => setVideoFullscreen(true)}>
                  <Icon name="fullscreen" size={28} color="white" />
                </Pressable>
              )}
              {fullscreen && controlsVisible && (
                <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
                  <View style={styles.fullTop}>
                    <View style={styles.fullTopRow}>
                      <Text numberOfLines={1} style={[styles.fullTitle, styles.light]}>
                        {session?.occurrence.task.name}
                      </Text>
                      {renderPause(true)}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="退出全屏"
                        onPress={() => setVideoFullscreen(false)}
                        style={styles.iconButton}>
                        <Icon name="fullscreen-exit" size={30} color="white" />
                      </Pressable>
                    </View>
                    <Text style={[styles.caption, styles.light]}>{status}</Text>
                    {!!failure && (
                      <Text numberOfLines={2} accessibilityRole="alert" style={styles.light}>
                        {failure}
                      </Text>
                    )}
                  </View>
                  <View style={styles.fullBottom}>{renderProgress(true, true)}</View>
                </View>
              )}
              {fullscreen && (
                <View
                  testID="video-persistent-progress"
                  pointerEvents="none"
                  accessible
                  accessibilityLabel={badgeLabel}
                  style={[styles.persistentProgress, fullLayout.badge]}>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    maxFontSizeMultiplier={1.3}
                    style={[styles.persistentNumber, { fontSize: fullLayout.fontSize }]}>
                    {badgeText}
                  </Text>
                </View>
              )}
            </View>
            <View style={[styles.normalControls, fullscreen && styles.hidden]}>
              {renderProgress()}
              {!!active && (
                <Text style={styles.caption}>
                  {asset?.title} · {active.span.repetition}/{progress?.entry?.repeat}遍 ·{' '}
                  {durationText(progress?.clipElapsedSeconds || 0)} /{' '}
                  {durationText(progress?.clipTotalSeconds || 0)}
                </Text>
              )}
              {!!failure && (
                <Text accessibilityRole="alert" style={styles.error}>
                  {failure}
                </Text>
              )}
              <View style={styles.row}>
                {renderPause()}
                <Pressable
                  accessibilityRole="button"
                  style={styles.button}
                  onPress={() => setShowFlow(!showFlow)}>
                  <Text style={styles.action}>{showFlow ? '收起流程' : '查看流程'}</Text>
                </Pressable>
              </View>
              <Text style={styles.caption}>显示公共流程进度；暂停后继续将追平当前时刻。</Text>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                style={styles.button}
                onPress={() => invoke(leaveVideo)}>
                <Text style={styles.action}>返回音频播放</Text>
              </Pressable>
            </View>
          </View>
          <View
            style={[
              styles.flow,
              wide && styles.flowSide,
              (!(showFlow || wide) || fullscreen) && styles.hidden,
            ]}>
            <Text style={styles.sectionTitle}>本次播放流程</Text>
            {progress?.entries.map(entry => (
              <View
                key={entry.index}
                style={[styles.entry, entry.index === progress.entry?.index && styles.activeEntry]}>
                <Text style={styles.entryTitle}>
                  {entry.index + 1}. {VIDEO_CATALOG.assets.find(a => a.file === entry.asset)?.title}
                  {' × '}
                  {formatRepeatCount(entry.repeat)}
                </Text>
                <Text style={styles.caption}>
                  {entry.index === progress.entry?.index
                    ? '正在进行'
                    : progress.elapsedSeconds * (timeline?.timescale || 1) >= entry.endTicks
                      ? '流程已过'
                      : '待播放'}
                  {' · '}
                  {durationText(entry.startTicks / (timeline?.timescale || 1))}
                  {' — '}
                  {durationText(entry.endTicks / (timeline?.timescale || 1))}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG_GROUND },
  dark: { backgroundColor: 'black' },
  content: { padding: 16, gap: 12, maxWidth: 1400, width: '100%', alignSelf: 'center' },
  fullContent: { padding: 0, width: '100%', alignSelf: 'center' },
  hidden: { display: 'none' },
  layout: { gap: 20 },
  columns: { flexDirection: 'row', alignItems: 'flex-start' },
  playerPane: { minWidth: 0 },
  flexPane: { flex: 1 },
  title: { color: INK, fontSize: 22, textAlign: 'center', fontWeight: '600', marginBottom: 6 },
  caption: { color: TEXT_SEC, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  videoStage: {
    backgroundColor: 'black',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  normalVideoStage: { aspectRatio: RATIO },
  surface: { width: '100%', height: '100%' },
  expand: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#0009',
  },
  normalControls: { gap: 10, paddingTop: 16 },
  timeline: { gap: 6 },
  cycle: {
    color: INK,
    fontSize: 40,
    fontWeight: '500',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  stage: { fontSize: 20 },
  progress: { height: 5, borderRadius: 4, backgroundColor: '#8886', overflow: 'hidden' },
  fill: { height: 5, backgroundColor: GOLD },
  times: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  time: { color: TEXT_SEC, fontSize: 12, fontVariant: ['tabular-nums'], flex: 1 },
  right: { textAlign: 'right' },
  total: { color: INK, fontSize: 19, textAlign: 'center', fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 16 },
  button: {
    minHeight: 48,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  action: { fontSize: 17, color: GOLD },
  darkButton: { alignSelf: 'center' },
  error: { color: '#A52A2A', textAlign: 'center' },
  light: { color: 'white' },
  fullTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0009',
    paddingHorizontal: 12,
  },
  fullTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fullTitle: { flex: 1, fontSize: 17 },
  iconButton: { padding: 12 },
  fullBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#000B',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  persistentProgress: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  persistentNumber: {
    color: 'white',
    backgroundColor: '#0008',
    borderRadius: 5,
    overflow: 'hidden',
    paddingHorizontal: 3,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    textShadowColor: '#000',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  flow: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: BG_SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 12,
  },
  flowSide: { width: 300 },
  sectionTitle: { color: INK, fontSize: 18, fontWeight: '600' },
  entry: { padding: 10, borderRadius: 8, gap: 6 },
  activeEntry: { backgroundColor: '#E8F5F2', borderWidth: 1, borderColor: GOLD },
  entryTitle: { color: INK, fontSize: 15, lineHeight: 22 },
});
