import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BG_GROUND, INK } from '../constants/colors';
import TaskListScreen from '../screens/TaskListScreen';
import TaskEditScreen from '../screens/TaskEditScreen';
import { VideoTaskListScreen, VideoTaskEditScreen } from '../video/TaskScreens';

export type TaskStackParamList = {
  TaskList: undefined;
  TaskEdit: { taskId?: string } | undefined;
  VideoTasks: undefined;
  VideoTaskEdit: { taskId?: string } | undefined;
};

const Stack = createNativeStackNavigator<TaskStackParamList>();

const TaskNavigator: React.FC = () => (
  <Stack.Navigator
    screenOptions={{
      headerStyle: { backgroundColor: BG_GROUND },
      headerTintColor: INK,
      headerShadowVisible: false,
    }}>
    <Stack.Screen name="TaskList" component={TaskListScreen} options={{ title: '任务' }} />
    <Stack.Screen
      name="VideoTasks"
      component={VideoTaskListScreen}
      options={{ title: '视频任务' }}
    />
    <Stack.Screen
      name="VideoTaskEdit"
      component={VideoTaskEditScreen}
      options={{ title: '编辑视频任务' }}
    />
    <Stack.Screen
      name="TaskEdit"
      component={TaskEditScreen}
      options={({ route }) => ({ title: route.params?.taskId ? '修改任务' : '增加任务' })}
    />
  </Stack.Navigator>
);

export default TaskNavigator;
