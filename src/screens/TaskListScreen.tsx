import React, { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Swipeable } from 'react-native-gesture-handler';
import { TaskStackParamList } from '../navigation/TaskNavigator';
import { useScheduledTaskStore } from '../store/scheduledTaskStore';
import { TRACKS } from '../constants/tracks';
import { formatTaskTime } from '../constants/scheduledTasks';
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
import { executeScheduledTask } from '../services/scheduledTaskExecutor';
import {
  getTaskSchedulingStatus,
  openTaskBackgroundSettings,
  requestTaskSchedulingPermission,
  syncTaskSchedules,
  TaskSchedulingStatus,
} from '../services/scheduledTaskScheduler';
import { formatRepeatCount } from '../utils/numberFormat';
import { addLog } from '../utils/logger';

type Props = NativeStackScreenProps<TaskStackParamList, 'TaskList'>;

function permissionMessage(status: TaskSchedulingStatus | null): string | null {
  if (!status) return null;
  if (status.platform === 'ios' && status.notificationPermission !== 'authorized') {
    return '请允许通知；iOS 被系统挂起或关闭时，需要通过通知继续启动任务。';
  }
  if (status.platform === 'android' && status.exactAlarmPermission === 'denied') {
    return '请允许“闹钟和提醒”权限，否则系统可能延迟任务。';
  }
  if (status.platform === 'android' && status.notificationPermission === 'denied') {
    return '请允许通知权限，任务后台播放时需要显示播放通知。';
  }
  return null;
}

const TaskListScreen: React.FC<Props> = ({ navigation }) => {
  const tasks = useScheduledTaskStore(state => state.tasks);
  const setTaskEnabled = useScheduledTaskStore(state => state.setTaskEnabled);
  const deleteTask = useScheduledTaskStore(state => state.deleteTask);
  const [status, setStatus] = useState<TaskSchedulingStatus | null>(null);
  const [playingTaskId, setPlayingTaskId] = useState<string | null>(null);

  const refreshStatus = useCallback(() => {
    getTaskSchedulingStatus()
      .then(setStatus)
      .catch(error => addLog('ERROR', 'read task scheduling status failed', error));
  }, []);

  useEffect(refreshStatus, [refreshStatus, tasks]);

  // Android 的精确闹钟授权页会暂时离开 App；返回时重新把任务升级为精确闹钟。
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      syncTaskSchedules(tasks)
        .then(setStatus)
        .catch(error => addLog('ERROR', 'resync tasks after settings failed', error));
    });
    return () => subscription.remove();
  }, [tasks]);

  const toggleTask = useCallback(
    async (taskId: string, enabled: boolean) => {
      const conflict = setTaskEnabled(taskId, enabled);
      if (conflict) {
        Alert.alert(
          '启动时刻冲突',
          `“${conflict.name}”已在 ${formatTaskTime(conflict)} 启用。同一时刻只能启用一个任务，请先关闭原任务。`,
        );
        return;
      }
      if (enabled) {
        try {
          setStatus(await requestTaskSchedulingPermission());
        } catch (error) {
          addLog('ERROR', 'request task scheduling permission failed', error);
        }
      }
    },
    [setTaskEnabled],
  );

  const confirmDelete = useCallback(
    (taskId: string, taskName: string) => {
      Alert.alert('删除任务', `确定删除“${taskName}”吗？`, [
        { text: '取消', style: 'cancel' },
        { text: '删除', style: 'destructive', onPress: () => deleteTask(taskId) },
      ]);
    },
    [deleteTask],
  );

  const playNow = useCallback(async (taskId: string) => {
    setPlayingTaskId(taskId);
    try {
      await executeScheduledTask({ taskId, source: 'manual' });
    } catch (error) {
      Alert.alert('播放失败', String(error));
    } finally {
      setPlayingTaskId(null);
    }
  }, []);

  const hasEnabledTasks = tasks.some(task => task.enabled);
  const warning = hasEnabledTasks ? permissionMessage(status) : null;
  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      {warning && (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            requestTaskSchedulingPermission()
              .then(setStatus)
              .catch(() => {})
          }
          style={styles.warning}>
          <Icon name="notifications-active" size={20} color="#9A6519" />
          <Text style={styles.warningText}>{warning}</Text>
          <Text style={styles.warningAction}>去设置</Text>
        </Pressable>
      )}
      {hasEnabledTasks && status?.platform === 'android' && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="检查后台运行设置"
          onPress={() =>
            openTaskBackgroundSettings()
              .then(setStatus)
              .catch(error => addLog('ERROR', 'open background settings failed', error))
          }
          style={styles.platformHint}>
          <Icon name="battery-saver" size={19} color={TEXT_SEC} />
          <Text style={styles.platformHintText}>
            为提高后台准时率，请允许后台运行和自启动，并将电池策略设为“不限制”。系统“强行停止”后任务无法自动执行。
          </Text>
          <Text style={styles.platformHintAction}>检查</Text>
        </Pressable>
      )}
      {hasEnabledTasks && status?.platform === 'ios' && (
        <View style={styles.platformHint} accessibilityRole="text">
          <Icon name="info-outline" size={19} color={TEXT_SEC} />
          <Text style={styles.platformHintText}>
            正在后台播放且进程仍可执行时会尝试自动切换；被系统挂起或关闭时将通过通知提醒，点击后启动任务。
          </Text>
        </View>
      )}
      <FlatList
        data={tasks}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<Text style={styles.empty}>暂无任务，可点击下方增加。</Text>}
        renderItem={({ item }) => {
          const track = TRACKS.find(candidate => candidate.id === item.trackId);
          return (
            <Swipeable
              containerStyle={styles.swipeRow}
              friction={2}
              rightThreshold={40}
              overshootRight={false}
              renderRightActions={() => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`删除任务${item.name}`}
                  style={styles.swipeDelete}
                  onPress={() => confirmDelete(item.id, item.name)}>
                  <Icon name="delete-outline" size={25} color="#FFFFFF" />
                  <Text style={styles.swipeDeleteText}>删除</Text>
                </Pressable>
              )}>
              <View style={styles.taskCard}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`立即播放任务${item.name}`}
                  onPress={() => playNow(item.id)}
                  disabled={playingTaskId === item.id}
                  style={styles.playButton}>
                  <Icon
                    name={playingTaskId === item.id ? 'hourglass-top' : 'play-arrow'}
                    size={30}
                    color="#FFFFFF"
                  />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`修改任务${item.name}`}
                  style={styles.taskInfo}
                  onPress={() => navigation.navigate('TaskEdit', { taskId: item.id })}>
                  <View style={styles.titleRow}>
                    <Text style={styles.time}>{formatTaskTime(item)}</Text>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.name}
                    </Text>
                  </View>
                  <Text style={styles.details} numberOfLines={2}>
                    {track?.title ?? item.trackId}　{formatRepeatCount(item.repeatCount)} 遍
                  </Text>
                  <Text style={styles.mode}>
                    {MODE_CONFIG[item.playMode].label} · {item.isSyncMode ? '同步' : '不同步'}
                  </Text>
                </Pressable>
                <Switch
                  accessibilityLabel={`${item.name}${item.enabled ? '已启用' : '已关闭'}`}
                  value={item.enabled}
                  onValueChange={enabled => toggleTask(item.id, enabled)}
                  trackColor={{ false: BG_RECESS, true: GOLD }}
                />
              </View>
            </Swipeable>
          );
        }}
      />
      <Pressable
        accessibilityRole="button"
        style={styles.addButton}
        onPress={() => navigation.navigate('TaskEdit')}>
        <Icon name="add" size={24} color={GOLD} />
        <Text style={styles.addText}>增加任务</Text>
      </Pressable>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG_GROUND },
  listContent: { padding: 16, paddingBottom: 100 },
  swipeRow: { marginBottom: 12, borderRadius: 14, overflow: 'hidden' },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BG_SURFACE,
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  swipeDelete: {
    width: 88,
    backgroundColor: '#C45B4F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeDeleteText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', marginTop: 3 },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  taskInfo: { flex: 1, minWidth: 0, marginRight: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline' },
  time: { color: INK, fontSize: 24, fontWeight: '400', fontVariant: ['tabular-nums'] },
  name: { color: INK, fontSize: 16, fontWeight: '600', marginLeft: 10, flex: 1 },
  details: { color: TEXT_SEC, fontSize: 14, marginTop: 5 },
  mode: { color: TEXT_TER, fontSize: 12, marginTop: 3 },
  addButton: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    height: 54,
    borderRadius: 12,
    backgroundColor: BG_SURFACE,
    borderWidth: 1,
    borderColor: GOLD,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: { color: GOLD, fontSize: 17, fontWeight: '600', marginLeft: 4 },
  empty: { color: TEXT_SEC, textAlign: 'center', marginTop: 80 },
  warning: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#FFF3D8',
    flexDirection: 'row',
    alignItems: 'center',
  },
  warningText: { flex: 1, color: '#76501B', fontSize: 13, lineHeight: 19, marginHorizontal: 8 },
  warningAction: { color: '#9A6519', fontSize: 13, fontWeight: '700' },
  platformHint: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 11,
    borderRadius: 10,
    backgroundColor: BG_SURFACE,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    flexDirection: 'row',
    alignItems: 'center',
  },
  platformHintText: { flex: 1, color: TEXT_SEC, fontSize: 12, lineHeight: 18, marginLeft: 8 },
  platformHintAction: { color: GOLD, fontSize: 13, fontWeight: '700', marginLeft: 8 },
});

export default TaskListScreen;
