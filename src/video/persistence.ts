import { MMKV } from 'react-native-mmkv';
import {
  defaultVideoTasks,
  sessionTimeline,
  validateVideoTask,
  VideoSession,
  VideoTask,
} from '../../packages/program-core/src/tasks';
import { VIDEO_CATALOG } from './catalog';
import { addLog } from '../utils/logger';

const storage = new MMKV();
const TASKS = 'video_tasks_v1';
const SESSION = 'video_session_v1';
const SEEN = 'video_occurrences_v1';

export function loadVideoTasks(): VideoTask[] {
  const raw = storage.getString(TASKS);
  if (!raw) return defaultVideoTasks();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Invalid video tasks');
    const ids = new Set<string>();
    return parsed.filter(task => {
      try {
        validateVideoTask(task, VIDEO_CATALOG);
        if (ids.has(task.id)) return false;
        ids.add(task.id);
        return true;
      } catch {
        addLog('WARN', 'Invalid saved video task ignored');
        return false;
      }
    });
  } catch (error) {
    // Do not overwrite damaged data, nor silently recreate enabled tasks.
    addLog('ERROR', 'Read video tasks failed', error);
    return [];
  }
}

export function saveVideoTasks(tasks: VideoTask[]): void {
  tasks.forEach(task => validateVideoTask(task, VIDEO_CATALOG));
  if (new Set(tasks.map(t => t.id)).size !== tasks.length) throw new Error('重复的视频任务ID');
  storage.set(TASKS, JSON.stringify(tasks));
}

export function loadVideoSession(): VideoSession | null {
  try {
    const raw = storage.getString(SESSION);
    if (!raw) return null;
    const session = JSON.parse(raw);
    sessionTimeline(session, VIDEO_CATALOG);
    return session;
  } catch (error) {
    addLog('WARN', 'Invalid video snapshot ignored', error);
    return null;
  }
}

export function saveVideoSession(session: VideoSession | null): void {
  if (session) {
    sessionTimeline(session, VIDEO_CATALOG);
    storage.set(SESSION, JSON.stringify(session));
  } else storage.delete(SESSION);
}

export function seenVideoOccurrences(): string[] {
  try {
    const value: unknown = JSON.parse(storage.getString(SEEN) || '[]');
    return Array.isArray(value) ? value.filter(v => typeof v === 'string').slice(-100) : [];
  } catch {
    return [];
  }
}

export function markVideoOccurrence(key: string): void {
  storage.set(SEEN, JSON.stringify([...new Set([...seenVideoOccurrences(), key])].slice(-100)));
}
