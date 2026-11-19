import React, { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  defaultVideoTasks,
  validateVideoTask,
  VideoTask,
} from '../../packages/program-core/src/tasks';
import { compileProgram } from '../../packages/program-core/src';
import { TaskStackParamList } from '../navigation/TaskNavigator';
import TaskTimePicker from '../components/TaskTimePicker';
import { BG_GROUND, BG_SURFACE, BORDER, GOLD, INK, TEXT_SEC } from '../constants/colors';
import { VIDEO_CATALOG } from './catalog';
import { useVideoTasks } from './taskStore';
import { joinVideoTask, useVideoState } from './runtime';
import { isVideoOwner } from './ownership';
import { approximateEnd, durationText, videoTaskWindow } from './presentation';
import { formatRepeatCount } from '../utils/numberFormat';
import { requestTaskSchedulingPermission } from '../services/scheduledTaskScheduler';

const DAYS = ['一', '二', '三', '四', '五', '六', '日'];
const clock = (t: VideoTask) =>
  [t.hour, t.minute, t.second].map(n => String(n).padStart(2, '0')).join(':');
export const videoDuration = durationText;
function Button({
  title,
  onPress,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      style={[styles.button, disabled && { opacity: 0.4 }]}
      onPress={onPress}>
      <Text style={styles.action}>{title}</Text>
    </Pressable>
  );
}
function warn(error: unknown) {
  Alert.alert('视频任务', String(error instanceof Error ? error.message : error));
}

export function VideoTaskListScreen({
  navigation,
}: NativeStackScreenProps<TaskStackParamList, 'VideoTasks'>) {
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <VideoTaskSection navigation={navigation} />
    </ScrollView>
  );
}

export function VideoTaskSection({
  navigation,
}: {
  navigation: Pick<NativeStackNavigationProp<TaskStackParamList>, 'navigate' | 'getParent'>;
}) {
  const { tasks, put } = useVideoTasks();
  const session = useVideoState(s => s.session);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.title}>
        视频任务
      </Text>
      <Text style={styles.hint}>
        到点按整套流程推进，加入即追平。视频需在前台播放；后台请通过通知返回。
      </Text>
      {[...tasks]
        .sort((a, b) => clock(a).localeCompare(clock(b)))
        .map(task => {
          const window = videoTaskWindow(task, VIDEO_CATALOG, now, isVideoOwner() ? session : null);
          const timeline = compileProgram(validateVideoTask(task, VIDEO_CATALOG));
          const current =
            isVideoOwner() &&
            session?.occurrence.task.id === task.id &&
            window.active?.key === session.occurrence.key;
          return (
            <View key={task.id} style={styles.card}>
              <View style={styles.row}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`修改${task.name}`}
                  style={{ flex: 1 }}
                  onPress={() => navigation.navigate('VideoTaskEdit', { taskId: task.id })}>
                  <Text style={styles.time}>{clock(task)}</Text>
                  <Text style={styles.title}>{task.name}</Text>
                  <Text style={styles.hint}>
                    周
                    {[...task.weekdays]
                      .sort()
                      .map(d => DAYS[d - 1])
                      .join('、')}{' '}
                    · {formatRepeatCount(timeline.totalCycles)}遍正文 ·{' '}
                    {videoDuration(timeline.totalTicks / timeline.timescale)}
                  </Text>
                </Pressable>
                <Switch
                  accessibilityLabel={`${task.name}定时启动`}
                  value={task.enabled}
                  onValueChange={enabled => {
                    try {
                      put({ ...task, enabled });
                      if (enabled) {
                        Alert.alert(
                          '视频任务提醒',
                          '视频需在前台播放。App 在后台或关闭时，将通过通知提醒你返回并追平进度；请允许通知。',
                        );
                        requestTaskSchedulingPermission().catch(warn);
                      }
                    } catch (error) {
                      warn(error);
                    }
                  }}
                />
              </View>
              <Text style={styles.hint}>
                {window.active
                  ? `进行中 · 约${new Date(Math.ceil(window.active.endEpochMs / 1000) * 1000).toLocaleTimeString('zh-CN', { hour12: false })}结束`
                  : window.next
                    ? `下次 ${new Date(window.next.startEpochMs).getMonth() + 1}月${new Date(window.next.startEpochMs).getDate()}日 ${clock(task)}`
                    : '请设置重复日期'}
                {!task.enabled ? ' · 自动启动已关闭' : ''}
              </Text>
              <Button
                title={
                  current
                    ? `${session?.intent === 'playing' ? '查看播放' : '追平并继续'}：${task.name}`
                    : `加入${task.name}`
                }
                disabled={busy || !window.active}
                onPress={() => {
                  setBusy(true);
                  const showPlaying =
                    current && session?.intent === 'playing'
                      ? Promise.resolve()
                      : joinVideoTask(task.id);
                  showPlaying
                    .then(() => navigation.getParent()?.navigate('Player'))
                    .catch(warn)
                    .finally(() => setBusy(false));
                }}
              />
            </View>
          );
        })}
      <Button title="增加视频任务" onPress={() => navigation.navigate('VideoTaskEdit')} />
    </View>
  );
}

export function VideoTaskEditScreen({
  navigation,
  route,
}: NativeStackScreenProps<TaskStackParamList, 'VideoTaskEdit'>) {
  const { tasks, put, remove } = useVideoTasks();
  const existing = tasks.find(t => t.id === route.params?.taskId);
  const [task, setTask] = useState<VideoTask>(() =>
    JSON.parse(
      JSON.stringify(
        existing || {
          ...defaultVideoTasks()[0],
          id: `video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: '新视频任务',
          enabled: false,
        },
      ),
    ),
  );
  const [moving, setMoving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(2);
  let duration = '';
  let totalCycles = 0;
  let end = '';
  try {
    const timeline = compileProgram(validateVideoTask(task, VIDEO_CATALOG));
    const seconds = timeline.totalTicks / timeline.timescale;
    duration = videoDuration(seconds);
    totalCycles = timeline.totalCycles;
    end = approximateEnd(task, seconds);
  } catch {
    duration = '请完善设置';
  }
  const move = (from: number, to: number) => {
    const sequence = [...task.sequence];
    const [entry] = sequence.splice(from, 1);
    sequence.splice(to, 0, entry);
    setTask({ ...task, sequence });
    setExpanded(to);
  };
  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      scrollEnabled={!moving}>
      <Text style={styles.title}>任务名称</Text>
      <TextInput
        accessibilityLabel="视频任务名称"
        style={styles.input}
        value={task.name}
        onChangeText={name => setTask({ ...task, name })}
        placeholder="最多30个字符"
      />
      <Text style={styles.title}>启动时刻</Text>
      <TaskTimePicker
        value={task}
        onChange={time => setTask({ ...task, ...time })}
        onScrollingChange={setMoving}
      />
      <Text style={styles.hint}>上下滑动，首尾循环；时、分、秒独立调整。</Text>
      <Text style={styles.title}>星期重复</Text>
      <View style={styles.row}>
        {DAYS.map((day, index) => {
          const d = index + 1;
          const selected = task.weekdays.includes(d);
          return (
            <Pressable
              key={day}
              accessibilityRole="checkbox"
              accessibilityLabel={`星期${day}`}
              accessibilityState={{ checked: selected }}
              style={[styles.day, selected && { backgroundColor: GOLD }]}
              onPress={() =>
                setTask({
                  ...task,
                  weekdays: selected
                    ? task.weekdays.filter(n => n !== d)
                    : [...task.weekdays, d].sort(),
                })
              }>
              <Text style={{ color: selected ? 'white' : INK }}>{day}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.summary}>
        <Text style={styles.title}>
          {formatRepeatCount(totalCycles)}遍正文 · {task.sequence.length}项素材
        </Text>
        <Text style={styles.hint}>
          总时长 {duration}
          {end ? ` · 约${end}结束` : ''}
        </Text>
      </View>
      <Text style={styles.title}>按顺序播放</Text>
      {task.sequence.map((entry, i) => (
        <View key={i} style={styles.card}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`编辑第${i + 1}项`}
            accessibilityState={{ expanded: expanded === i }}
            onPress={() => setExpanded(expanded === i ? null : i)}>
            <Text style={styles.title}>
              {i + 1}. {VIDEO_CATALOG.assets.find(a => a.id === entry.assetId)?.title}
              {' × '}
              {Number.isSafeInteger(entry.repeat) ? formatRepeatCount(entry.repeat) : '—'}
            </Text>
            <Text style={styles.hint}>{expanded === i ? '收起设置' : '调整遍数与顺序'}</Text>
          </Pressable>
          {expanded === i && (
            <>
              <View style={styles.row}>
                <Text style={styles.hint}>重复遍数</Text>
                <TextInput
                  accessibilityLabel={`第${i + 1}项重复遍数`}
                  style={[styles.input, { flex: 1 }]}
                  keyboardType="number-pad"
                  value={Number.isNaN(entry.repeat) ? '' : String(entry.repeat)}
                  onChangeText={text => {
                    const repeat = /^\d+$/.test(text) ? Number(text) : NaN;
                    setTask({
                      ...task,
                      sequence: task.sequence.map((s, j) => (i === j ? { ...s, repeat } : s)),
                    });
                  }}
                />
              </View>
              <View style={styles.row}>
                <Button
                  title={`第${i + 1}项上移`}
                  disabled={i === 0}
                  onPress={() => move(i, i - 1)}
                />
                <Button
                  title={`第${i + 1}项下移`}
                  disabled={i === task.sequence.length - 1}
                  onPress={() => move(i, i + 1)}
                />
                <Button
                  title={`移除第${i + 1}项`}
                  onPress={() => {
                    setTask({ ...task, sequence: task.sequence.filter((_, j) => j !== i) });
                    setExpanded(null);
                  }}
                />
              </View>
            </>
          )}
        </View>
      ))}
      <Button title={adding ? '收起素材列表' : '添加视频片段'} onPress={() => setAdding(!adding)} />
      {adding &&
        VIDEO_CATALOG.assets.map(asset => (
          <Button
            key={asset.id}
            title={`添加：${asset.title}`}
            onPress={() => {
              setTask({ ...task, sequence: [...task.sequence, { assetId: asset.id, repeat: 1 }] });
              setExpanded(task.sequence.length);
              setAdding(false);
            }}
          />
        ))}
      <Text style={styles.hint}>
        已开始的任务使用启动时的配置，本次修改从下一次任务生效。每项最多1,000遍，整套最多1,000段且少于24小时。
      </Text>
      <Button
        title="保存视频任务"
        disabled={moving}
        onPress={() => {
          try {
            put({ ...task, name: task.name.trim() });
            navigation.goBack();
          } catch (error) {
            warn(error);
          }
        }}
      />
      {existing && (
        <Button
          title="删除视频任务"
          onPress={() =>
            Alert.alert('删除视频任务', '删除不打断已经开始的流程。', [
              { text: '取消', style: 'cancel' },
              {
                text: '删除',
                style: 'destructive',
                onPress: () => {
                  remove(task.id);
                  navigation.goBack();
                },
              },
            ])
          }
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  summary: { padding: 12, backgroundColor: '#E8F5F2', borderRadius: 10, gap: 6 },
  page: { flex: 1, backgroundColor: BG_GROUND },
  content: {
    padding: 18,
    gap: 12,
    paddingBottom: 36,
    maxWidth: 800,
    width: '100%',
    alignSelf: 'center',
  },
  card: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: BG_SURFACE,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  title: { fontSize: 17, color: INK, fontWeight: '600' },
  hint: { fontSize: 14, lineHeight: 22, color: TEXT_SEC },
  time: { fontSize: 30, color: INK, fontVariant: ['tabular-nums'] },
  button: { minHeight: 44, padding: 10, justifyContent: 'center', alignItems: 'center' },
  action: { color: GOLD, fontSize: 16 },
  input: {
    minHeight: 48,
    padding: 10,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    color: INK,
    backgroundColor: BG_SURFACE,
  },
  day: {
    flex: 1,
    minWidth: 32,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
  },
});
