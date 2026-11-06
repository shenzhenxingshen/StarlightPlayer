import { MMKV } from 'react-native-mmkv';
import {
  DEFAULT_SCHEDULED_TASKS,
  formatTaskTime,
  sortScheduledTasks,
} from '@/constants/scheduledTasks';
import {
  loadScheduledTask,
  loadScheduledTasks,
  normalizeScheduledTask,
  saveScheduledTasks,
} from '@/utils/storage';

beforeEach(() => (new MMKV() as any).clearAll());

describe('每日定时任务持久化', () => {
  it('首次使用生成三条默认关闭的任务', () => {
    const tasks = loadScheduledTasks();
    expect(tasks).toHaveLength(3);
    expect(tasks.map(task => task.name)).toEqual(['早自习', '见缝插针', '晚自习']);
    expect(tasks.every(task => !task.enabled)).toBe(true);
    expect(tasks.map(task => formatTaskTime(task))).toEqual(['05:30:00', '06:30:00', '20:00:00']);
    expect(tasks).toEqual(DEFAULT_SCHEDULED_TASKS);
  });

  it('空列表表示用户已删除全部任务，不会重新生成预置项', () => {
    saveScheduledTasks([]);
    expect(loadScheduledTasks()).toEqual([]);
  });

  it('保存时去重、按时刻排序并规范字段', () => {
    const base = DEFAULT_SCHEDULED_TASKS[0];
    const saved = saveScheduledTasks([
      { ...base, id: 'late', hour: 20, name: '  晚间  ', repeatCount: 5_000_000 },
      { ...base, id: 'early', hour: 1, name: '早间' },
      { ...base, id: 'late', hour: 8, name: '替换同ID' },
    ]);
    expect(saved.map(task => task.id)).toEqual(['early', 'late']);
    expect(loadScheduledTask('late')).toMatchObject({ name: '替换同ID', hour: 8 });
    expect(loadScheduledTask('early')?.repeatCount).toBe(49);
  });

  it('拒绝非法名称、时刻和不存在的曲目', () => {
    const base = DEFAULT_SCHEDULED_TASKS[0];
    expect(normalizeScheduledTask({ ...base, name: '' })).toBeNull();
    expect(normalizeScheduledTask({ ...base, hour: 24 })).toBeNull();
    expect(normalizeScheduledTask({ ...base, minute: 60 })).toBeNull();
    expect(normalizeScheduledTask({ ...base, second: -1 })).toBeNull();
    expect(normalizeScheduledTask({ ...base, trackId: 'missing' })).toBeNull();
    expect(normalizeScheduledTask(null)).toBeNull();
  });

  it('损坏JSON恢复预置任务，非法数组成员被过滤', () => {
    const raw = new MMKV() as any;
    raw.set('scheduled_tasks_v1', '{broken');
    expect(loadScheduledTasks()).toHaveLength(3);
    raw.set('scheduled_tasks_v1', JSON.stringify([{ bad: true }]));
    expect(loadScheduledTasks()).toEqual([]);
  });

  it('排序函数不修改原数组且同一时刻按ID稳定排序', () => {
    const source = [
      { ...DEFAULT_SCHEDULED_TASKS[0], id: 'b', hour: 9 },
      { ...DEFAULT_SCHEDULED_TASKS[0], id: 'a', hour: 9 },
    ];
    expect(sortScheduledTasks(source).map(task => task.id)).toEqual(['a', 'b']);
    expect(source.map(task => task.id)).toEqual(['b', 'a']);
  });
});
