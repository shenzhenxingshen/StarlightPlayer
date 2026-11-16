import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { TaskStackParamList } from '../navigation/TaskNavigator';
import { useScheduledTaskStore } from '../store/scheduledTaskStore';
import {
  ALL_TASK_WEEKDAYS,
  NEW_SCHEDULED_TASK,
  normalizeTaskWeekdays,
  TASK_WEEKDAY_LABELS,
} from '../constants/scheduledTasks';
import TaskTimePicker from '../components/TaskTimePicker';
import { TaskWeekday } from '../types/scheduledTask';
import { TRACKS } from '../constants/tracks';
import { PlayMode } from '../utils/storage';
import { MODE_CONFIG } from '../components/Controls';
import {
  BG_GROUND,
  BG_RECESS,
  BG_SURFACE,
  BORDER,
  GOLD,
  INK,
  TEXT_SEC,
  TEXT_TER,
} from '../constants/colors';
import { unformatRepeatCount } from '../utils/numberFormat';

type Props = NativeStackScreenProps<TaskStackParamList, 'TaskEdit'>;

const PLAY_MODES: readonly PlayMode[] = ['play-one', 'repeat-one', 'play-all', 'repeat-all'];

const TaskEditScreen: React.FC<Props> = ({ navigation, route }) => {
  const taskId = route.params?.taskId;
  const existing = useScheduledTaskStore(state => state.tasks.find(task => task.id === taskId));
  const addTask = useScheduledTaskStore(state => state.addTask);
  const updateTask = useScheduledTaskStore(state => state.updateTask);
  const deleteTask = useScheduledTaskStore(state => state.deleteTask);
  const initial = existing ?? NEW_SCHEDULED_TASK;
  const [name, setName] = useState(initial.name);
  const [clock, setClock] = useState({
    hour: initial.hour,
    minute: initial.minute,
    second: initial.second,
  });
  const [weekdays, setWeekdays] = useState<TaskWeekday[]>(
    normalizeTaskWeekdays(initial.weekdays) ?? [],
  );
  const [timeScrolling, setTimeScrolling] = useState(false);
  const [trackId, setTrackId] = useState(initial.trackId);
  const [repeatText, setRepeatText] = useState(String(initial.repeatCount));
  const [playMode, setPlayMode] = useState<PlayMode>(initial.playMode);
  const [isSyncMode, setIsSyncMode] = useState(initial.isSyncMode);
  const [trackPickerVisible, setTrackPickerVisible] = useState(false);
  const selectedTrack = useMemo(() => TRACKS.find(track => track.id === trackId), [trackId]);

  const save = () => {
    if (timeScrolling) return;
    const normalizedName = name.trim();
    const parsedRepeat = Number(unformatRepeatCount(repeatText));
    if (!normalizedName) return Alert.alert('无法保存', '请输入任务名称');
    if (weekdays.length === 0) return Alert.alert('无法保存', '请至少选择一个重复日期');
    if (!Number.isSafeInteger(parsedRepeat) || parsedRepeat <= 0) {
      return Alert.alert('无法保存', '每首重复遍数必须是大于 0 的整数');
    }
    const draft = {
      name: normalizedName,
      ...clock,
      weekdays,
      trackId,
      repeatCount: parsedRepeat,
      playMode,
      isSyncMode,
      enabled: existing?.enabled ?? false,
    };
    if (existing) {
      const conflict = updateTask({ ...draft, id: existing.id });
      if (conflict) {
        return Alert.alert(
          '启动时刻冲突',
          `“${conflict.name}”已在 ${[conflict.hour, conflict.minute, conflict.second]
            .map(value => String(value).padStart(2, '0'))
            .join(':')} 启用。同一天的同一时刻只能启用一个任务，请调整时间或重复日期。`,
        );
      }
    } else addTask(draft);
    navigation.goBack();
  };

  const confirmDelete = () => {
    if (!existing) return;
    Alert.alert('删除任务', `确定删除“${existing.name}”吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          deleteTask(existing.id);
          navigation.goBack();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView
        scrollEnabled={!timeScrolling}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>任务名称</Text>
        <TextInput
          accessibilityLabel="任务名称"
          value={name}
          onChangeText={setName}
          maxLength={30}
          placeholder="最多30个字符"
          placeholderTextColor={TEXT_TER}
          style={styles.input}
        />

        <Text style={styles.label}>启动时刻</Text>
        <TaskTimePicker value={clock} onChange={setClock} onScrollingChange={setTimeScrolling} />
        <Text style={styles.label}>重复</Text>
        <View style={styles.weekdayRow}>
          {ALL_TASK_WEEKDAYS.map(day => (
            <Pressable
              key={day}
              accessibilityRole="checkbox"
              accessibilityLabel={`星期${TASK_WEEKDAY_LABELS[day - 1]}`}
              accessibilityState={{ checked: weekdays.includes(day) }}
              onPress={() =>
                setWeekdays(previous =>
                  previous.includes(day)
                    ? previous.filter(item => item !== day)
                    : [...previous, day].sort((a, b) => a - b),
                )
              }
              style={[styles.weekdayButton, weekdays.includes(day) && styles.weekdayActive]}>
              <Text
                style={[styles.weekdayText, weekdays.includes(day) && styles.weekdayTextActive]}>
                {TASK_WEEKDAY_LABELS[day - 1]}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.weekdayHint}>至少选择一天，仅影响自动启动；手动播放始终可用。</Text>

        <Text style={styles.label}>歌曲名称</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="选择歌曲"
          style={styles.select}
          onPress={() => setTrackPickerVisible(true)}>
          <Text style={styles.selectText}>{selectedTrack?.title ?? '请选择'}</Text>
          <Icon name="chevron-right" size={24} color={TEXT_TER} />
        </Pressable>

        <Text style={styles.label}>每首重复遍数</Text>
        <TextInput
          accessibilityLabel="每首重复遍数"
          value={repeatText}
          onChangeText={text => setRepeatText(unformatRepeatCount(text))}
          keyboardType="number-pad"
          style={styles.input}
        />

        <Text style={styles.label}>循环模式</Text>
        <View style={styles.modeGrid}>
          {PLAY_MODES.map(mode => (
            <Pressable
              key={mode}
              onPress={() => setPlayMode(mode)}
              style={[styles.modeButton, playMode === mode && styles.modeButtonActive]}>
              <Icon
                name={MODE_CONFIG[mode].icon}
                size={21}
                color={playMode === mode ? '#FFFFFF' : TEXT_SEC}
              />
              <Text style={[styles.modeText, playMode === mode && styles.modeTextActive]}>
                {MODE_CONFIG[mode].label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.syncRow}>
          <View style={styles.syncInfo}>
            <Text style={styles.syncTitle}>同步模式</Text>
            <Text style={styles.syncDesc}>
              {isSyncMode ? '按当天 00:00:00 对齐进度' : '从曲目开头播放'}
            </Text>
          </View>
          <Switch
            accessibilityLabel="同步模式"
            value={isSyncMode}
            onValueChange={setIsSyncMode}
            trackColor={{ false: BG_RECESS, true: GOLD }}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: timeScrolling }}
          disabled={timeScrolling}
          style={[styles.saveButton, timeScrolling && styles.disabled]}
          onPress={save}>
          <Text style={styles.saveText}>保存</Text>
        </Pressable>
        {existing && (
          <Pressable style={styles.deleteButton} onPress={confirmDelete}>
            <Text style={styles.deleteText}>删除任务</Text>
          </Pressable>
        )}
      </ScrollView>

      <Modal
        visible={trackPickerVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setTrackPickerVisible(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>选择歌曲</Text>
            <Pressable onPress={() => setTrackPickerVisible(false)}>
              <Text style={styles.done}>完成</Text>
            </Pressable>
          </View>
          <FlatList
            data={TRACKS}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <Pressable
                style={styles.trackRow}
                onPress={() => {
                  setTrackId(item.id);
                  setTrackPickerVisible(false);
                }}>
                <Text style={styles.trackCode}>{item.code}</Text>
                <Text style={styles.trackTitle}>{item.title}</Text>
                {item.id === trackId && <Icon name="check" size={22} color={GOLD} />}
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG_GROUND },
  content: { padding: 18, paddingBottom: 40 },
  label: { color: TEXT_SEC, fontSize: 13, fontWeight: '600', marginTop: 16, marginBottom: 7 },
  input: {
    backgroundColor: BG_SURFACE,
    color: INK,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  weekdayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  weekdayButton: {
    flexGrow: 1,
    minWidth: 40,
    minHeight: 44,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    backgroundColor: BG_SURFACE,
  },
  weekdayActive: { backgroundColor: GOLD, borderColor: GOLD },
  weekdayText: { color: TEXT_SEC, fontSize: 16 },
  weekdayTextActive: { color: '#FFFFFF', fontWeight: '600' },
  weekdayHint: { color: TEXT_TER, fontSize: 12, marginTop: 8 },
  disabled: { opacity: 0.5 },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BG_SURFACE,
    borderRadius: 10,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  selectText: { flex: 1, color: INK, fontSize: 16 },
  modeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modeButton: {
    width: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BG_SURFACE,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 11,
  },
  modeButtonActive: { backgroundColor: GOLD, borderColor: GOLD },
  modeText: { color: TEXT_SEC, fontSize: 14, marginLeft: 6 },
  modeTextActive: { color: '#FFFFFF', fontWeight: '600' },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 22,
    backgroundColor: BG_SURFACE,
    borderRadius: 10,
    padding: 14,
  },
  syncInfo: { flex: 1 },
  syncTitle: { color: INK, fontSize: 16, fontWeight: '600' },
  syncDesc: { color: TEXT_SEC, fontSize: 12, marginTop: 3 },
  saveButton: {
    backgroundColor: GOLD,
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 28,
  },
  saveText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  deleteButton: {
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 12,
    backgroundColor: BG_SURFACE,
  },
  deleteText: { color: '#C45B4F', fontSize: 16, fontWeight: '600' },
  modalContainer: { flex: 1, backgroundColor: BG_GROUND },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: BG_SURFACE,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  modalTitle: { flex: 1, color: INK, fontSize: 18, fontWeight: '700' },
  done: { color: GOLD, fontSize: 16, fontWeight: '600' },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BG_SURFACE,
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  trackCode: { width: 44, color: TEXT_TER, fontSize: 13 },
  trackTitle: { flex: 1, color: INK, fontSize: 16 },
});

export default TaskEditScreen;
