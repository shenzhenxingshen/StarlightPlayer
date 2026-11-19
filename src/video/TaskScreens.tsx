import React, { useState } from 'react';
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
import { NativeStackScreenProps } from '@react-navigation/native-stack';
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
import { joinVideoTask } from './runtime';
import { requestTaskSchedulingPermission } from '../services/scheduledTaskScheduler';

const DAYS = ['一', '二', '三', '四', '五', '六', '日'];
const clock = (t: VideoTask) =>
  [t.hour, t.minute, t.second].map(n => String(n).padStart(2, '0')).join(':');
export const videoDuration = (seconds: number) => {
  const s = Math.floor(Math.max(0, seconds));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map(n => String(n).padStart(2, '0'))
    .join(':');
};
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
  const { tasks, put } = useVideoTasks();
  const [busy, setBusy] = useState(false);
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.hint}>
        整套流程按启动时刻持续推进。迟到加入、暂停后继续都会追平当前进度；结束后不补播。暂停不暂停公共时间轴。
      </Text>
      <Text style={styles.hint}>
        视频在前台播放。App 在后台或被关闭时，请点击系统提醒返回加入；需要允许通知。
      </Text>
      {[...tasks]
        .sort((a, b) => clock(a).localeCompare(clock(b)))
        .map(task => (
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
                  ·{' '}
                  {videoDuration(
                    compileProgram(validateVideoTask(task, VIDEO_CATALOG)).totalTicks /
                      VIDEO_CATALOG.timescale,
                  )}
                </Text>
              </Pressable>
              <Switch
                accessibilityLabel={`${task.name}定时启动`}
                value={task.enabled}
                onValueChange={enabled => {
                  try {
                    put({ ...task, enabled });
                    if (enabled) requestTaskSchedulingPermission().catch(warn);
                  } catch (error) {
                    warn(error);
                  }
                }}
              />
            </View>
            <Button
              title={`加入${task.name}`}
              disabled={busy}
              onPress={() => {
                setBusy(true);
                joinVideoTask(task.id)
                  .then(() => navigation.getParent()?.navigate('Player'))
                  .catch(warn)
                  .finally(() => setBusy(false));
              }}
            />
          </View>
        ))}
      <Button title="增加视频任务" onPress={() => navigation.navigate('VideoTaskEdit')} />
    </ScrollView>
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
  let duration = '';
  try {
    duration = videoDuration(
      compileProgram(validateVideoTask(task, VIDEO_CATALOG)).totalTicks / VIDEO_CATALOG.timescale,
    );
  } catch {
    duration = '请完善设置';
  }
  const move = (from: number, to: number) => {
    const sequence = [...task.sequence];
    const [entry] = sequence.splice(from, 1);
    sequence.splice(to, 0, entry);
    setTask({ ...task, sequence });
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
      <Text style={styles.title}>按顺序播放 · 总时长 {duration}</Text>
      {task.sequence.map((entry, i) => (
        <View key={i} style={styles.card}>
          <Text style={styles.title}>
            {i + 1}. {VIDEO_CATALOG.assets.find(a => a.id === entry.assetId)?.title}
          </Text>
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
            <Button title={`第${i + 1}项上移`} disabled={i === 0} onPress={() => move(i, i - 1)} />
            <Button
              title={`第${i + 1}项下移`}
              disabled={i === task.sequence.length - 1}
              onPress={() => move(i, i + 1)}
            />
            <Button
              title={`移除第${i + 1}项`}
              onPress={() =>
                setTask({ ...task, sequence: task.sequence.filter((_, j) => j !== i) })
              }
            />
          </View>
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
