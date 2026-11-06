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
import { NEW_SCHEDULED_TASK } from '../constants/scheduledTasks';
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

function clockPart(text: string, maximum: number): number | null {
  if (!/^\d{1,2}$/.test(text)) return null;
  const value = Number(text);
  return value >= 0 && value <= maximum ? value : null;
}

const TaskEditScreen: React.FC<Props> = ({ navigation, route }) => {
  const taskId = route.params?.taskId;
  const existing = useScheduledTaskStore(state => state.tasks.find(task => task.id === taskId));
  const addTask = useScheduledTaskStore(state => state.addTask);
  const updateTask = useScheduledTaskStore(state => state.updateTask);
  const deleteTask = useScheduledTaskStore(state => state.deleteTask);
  const initial = existing ?? NEW_SCHEDULED_TASK;
  const [name, setName] = useState(initial.name);
  const [hour, setHour] = useState(String(initial.hour).padStart(2, '0'));
  const [minute, setMinute] = useState(String(initial.minute).padStart(2, '0'));
  const [second, setSecond] = useState(String(initial.second).padStart(2, '0'));
  const [trackId, setTrackId] = useState(initial.trackId);
  const [repeatText, setRepeatText] = useState(String(initial.repeatCount));
  const [playMode, setPlayMode] = useState<PlayMode>(initial.playMode);
  const [isSyncMode, setIsSyncMode] = useState(initial.isSyncMode);
  const [trackPickerVisible, setTrackPickerVisible] = useState(false);
  const selectedTrack = useMemo(() => TRACKS.find(track => track.id === trackId), [trackId]);

  const save = () => {
    const normalizedName = name.trim();
    const parsedHour = clockPart(hour, 23);
    const parsedMinute = clockPart(minute, 59);
    const parsedSecond = clockPart(second, 59);
    const parsedRepeat = Number(unformatRepeatCount(repeatText));
    if (!normalizedName) return Alert.alert('无法保存', '请输入任务名称');
    if (parsedHour == null || parsedMinute == null || parsedSecond == null) {
      return Alert.alert('无法保存', '请输入有效的启动时刻');
    }
    if (!Number.isSafeInteger(parsedRepeat) || parsedRepeat <= 0) {
      return Alert.alert('无法保存', '每首重复遍数必须是大于 0 的整数');
    }
    const draft = {
      name: normalizedName,
      hour: parsedHour,
      minute: parsedMinute,
      second: parsedSecond,
      trackId,
      repeatCount: parsedRepeat,
      playMode,
      isSyncMode,
      enabled: existing?.enabled ?? false,
    };
    if (existing) updateTask({ ...draft, id: existing.id });
    else addTask(draft);
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
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
        <View style={styles.timeRow}>
          {[
            [hour, setHour, '时'],
            [minute, setMinute, '分'],
            [second, setSecond, '秒'],
          ].map(([value, setter, suffix], index) => (
            <React.Fragment key={suffix as string}>
              {index > 0 && <Text style={styles.colon}>:</Text>}
              <View style={styles.timeField}>
                <TextInput
                  accessibilityLabel={suffix as string}
                  value={value as string}
                  onChangeText={setter as (text: string) => void}
                  keyboardType="number-pad"
                  maxLength={2}
                  selectTextOnFocus
                  style={styles.timeInput}
                />
                <Text style={styles.timeSuffix}>{suffix as string}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>

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

        <Pressable accessibilityRole="button" style={styles.saveButton} onPress={save}>
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
  timeRow: { flexDirection: 'row', alignItems: 'center' },
  timeField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BG_SURFACE,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  timeInput: {
    flex: 1,
    color: INK,
    textAlign: 'center',
    fontSize: 22,
    paddingVertical: 10,
    fontVariant: ['tabular-nums'],
  },
  timeSuffix: { color: TEXT_TER, marginRight: 8, fontSize: 12 },
  colon: { color: TEXT_SEC, fontSize: 24, marginHorizontal: 5 },
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
