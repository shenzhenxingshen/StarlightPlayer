import { create } from 'zustand';
import { ScheduledTask, ScheduledTaskDraft } from '../types/scheduledTask';
import { loadScheduledTasks, saveScheduledTasks } from '../utils/storage';
import { syncTaskSchedules } from '../services/scheduledTaskScheduler';
import { addLog } from '../utils/logger';
import { findEnabledTaskTimeConflict } from '../constants/scheduledTasks';

interface ScheduledTaskStore {
  tasks: ScheduledTask[];
  replaceAll: (tasks: ScheduledTask[]) => void;
  addTask: (draft: ScheduledTaskDraft) => ScheduledTask;
  updateTask: (task: ScheduledTask) => ScheduledTask | null;
  deleteTask: (taskId: string) => void;
  setTaskEnabled: (taskId: string, enabled: boolean) => ScheduledTask | null;
  refresh: () => void;
}

function persistAndSchedule(tasks: readonly ScheduledTask[]): ScheduledTask[] {
  const saved = saveScheduledTasks(tasks);
  syncTaskSchedules(saved).catch(error =>
    addLog('ERROR', 'schedule tasks after save failed', error),
  );
  return saved;
}

function createTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const useScheduledTaskStore = create<ScheduledTaskStore>((set, get) => ({
  tasks: loadScheduledTasks(),
  replaceAll: tasks => set({ tasks: persistAndSchedule(tasks) }),
  addTask: draft => {
    const task = { ...draft, id: createTaskId() };
    set({ tasks: persistAndSchedule([...get().tasks, task]) });
    return task;
  },
  updateTask: task => {
    const conflict = findEnabledTaskTimeConflict(get().tasks, task);
    if (conflict) return conflict;
    set({
      tasks: persistAndSchedule(
        get().tasks.map(current => (current.id === task.id ? task : current)),
      ),
    });
    return null;
  },
  deleteTask: taskId => {
    set({ tasks: persistAndSchedule(get().tasks.filter(task => task.id !== taskId)) });
  },
  setTaskEnabled: (taskId, enabled) => {
    const current = get().tasks.find(task => task.id === taskId);
    if (!current) return null;
    const conflict = findEnabledTaskTimeConflict(get().tasks, { ...current, enabled });
    if (conflict) return conflict;
    set({
      tasks: persistAndSchedule(
        get().tasks.map(task => (task.id === taskId ? { ...task, enabled } : task)),
      ),
    });
    return null;
  },
  refresh: () => set({ tasks: loadScheduledTasks() }),
}));
