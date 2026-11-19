import { create } from 'zustand';
import { validateVideoTask, VideoTask } from '../../packages/program-core/src/tasks';
import { VIDEO_CATALOG } from './catalog';
import { loadVideoTasks, saveVideoTasks } from './persistence';
import { loadScheduledTasks } from '../utils/storage';
import { syncTaskSchedules } from '../services/scheduledTaskScheduler';
import { addLog } from '../utils/logger';

interface TaskStore {
  tasks: VideoTask[];
  put: (task: VideoTask) => void;
  remove: (id: string) => void;
}

function persist(tasks: VideoTask[]) {
  saveVideoTasks(tasks);
  syncTaskSchedules(loadScheduledTasks()).catch(error =>
    addLog('ERROR', 'Video task schedules failed', error),
  );
  return tasks;
}

export const useVideoTasks = create<TaskStore>((set, get) => ({
  tasks: loadVideoTasks(),
  put: task => {
    validateVideoTask(task, VIDEO_CATALOG);
    const conflict = [...loadScheduledTasks(), ...get().tasks].find(
      t =>
        task.enabled &&
        t.enabled &&
        task.id !== t.id &&
        task.hour === t.hour &&
        task.minute === t.minute &&
        task.second === t.second &&
        task.weekdays.some(d => (t.weekdays as number[]).includes(d)),
    );
    if (conflict)
      throw new Error(`同一天的相同时刻已有任务“${conflict.name}”，请调整时刻或重复日期。`);
    const tasks = get().tasks;
    set({
      tasks: persist(
        tasks.some(t => t.id === task.id)
          ? tasks.map(t => (t.id === task.id ? task : t))
          : [...tasks, task],
      ),
    });
  },
  remove: id => set({ tasks: persist(get().tasks.filter(t => t.id !== id)) }),
}));
