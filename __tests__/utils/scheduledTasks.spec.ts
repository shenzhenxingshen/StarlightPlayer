import { MMKV } from 'react-native-mmkv';
import {
  DEFAULT_SCHEDULED_TASKS,
  findEnabledTaskTimeConflict,
  formatTaskTime,
  formatTaskWeekdays,
  normalizeTaskWeekdays,
  isTaskScheduledOn,
  matchesTaskOccurrence,
  sortScheduledTasks,
} from '@/constants/scheduledTasks';
import {
  loadScheduledTask,
  loadScheduledTasks,
  normalizeScheduledTask,
  saveScheduledTasks,
} from '@/utils/storage';

beforeEach(() => (new MMKV() as any).clearAll());

describe('按星期定时任务持久化', () => {
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

  it('只把同一时刻的其他已启用任务视为冲突', () => {
    const candidate = { ...DEFAULT_SCHEDULED_TASKS[0], enabled: true };
    const sameTime = { ...DEFAULT_SCHEDULED_TASKS[1], id: 'same', hour: 5, enabled: true };
    const disabled = { ...sameTime, id: 'disabled', enabled: false };
    expect(findEnabledTaskTimeConflict([sameTime], candidate)?.id).toBe('same');
    expect(findEnabledTaskTimeConflict([disabled], candidate)).toBeNull();
    expect(findEnabledTaskTimeConflict([sameTime], { ...candidate, enabled: false })).toBeNull();
    expect(findEnabledTaskTimeConflict([candidate], candidate)).toBeNull();
  });

  it('旧任务缺失星期字段迁移为每天并回写，不共享数组', () => {
    const { weekdays: _weekdays, ...old } = DEFAULT_SCHEDULED_TASKS[0];
    const raw = new MMKV() as any;
    raw.set('scheduled_tasks_v1', JSON.stringify([old]));
    const loaded = loadScheduledTasks();
    expect(loaded[0].weekdays).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(JSON.parse(raw.getString('scheduled_tasks_v1'))[0].weekdays).toEqual(loaded[0].weekdays);
    loaded[0].weekdays.pop();
    expect(loadScheduledTasks()[0].weekdays).toHaveLength(7);
    expect(DEFAULT_SCHEDULED_TASKS[0].weekdays).toHaveLength(7);
  });

  it.each([null, [], [0], [8], [1.5], [true], ['1'], {}, 'daily'])(
    '拒绝损坏星期数据 %j，不默认为每天',
    value => {
      expect(normalizeTaskWeekdays(value)).toBeNull();
      expect(normalizeScheduledTask({ ...DEFAULT_SCHEDULED_TASKS[0], weekdays: value })).toBeNull();
    },
  );

  it('穷举127个非空星期组合，验证规范化与全部16129组冲突交集', () => {
    const selections = Array.from({ length: 127 }, (_, index) =>
      [1, 2, 3, 4, 5, 6, 7].filter(day => ((index + 1) & (1 << (day - 1))) !== 0),
    );
    for (const left of selections) {
      expect(normalizeTaskWeekdays([...left].reverse().concat(left))).toEqual(left);
      for (const right of selections) {
        const a = {
          ...DEFAULT_SCHEDULED_TASKS[0],
          id: 'a',
          enabled: true,
          weekdays: normalizeTaskWeekdays(left)!,
        };
        const b = { ...a, id: 'b', weekdays: normalizeTaskWeekdays(right)! };
        expect(Boolean(findEnabledTaskTimeConflict([b], a))).toBe(
          left.some(day => right.includes(day)),
        );
      }
    }
  });

  it('星期显示简洁且周日使用ISO 7，严格匹配时分秒', () => {
    const task = { ...DEFAULT_SCHEDULED_TASKS[0], weekdays: [7] as const };
    const sundayTask = { ...task, weekdays: [...task.weekdays] };
    const sunday = new Date(2026, 10, 15, 5, 30, 0).getTime();
    expect(matchesTaskOccurrence(sundayTask, sunday)).toBe(true);
    expect(matchesTaskOccurrence(sundayTask, sunday + 999)).toBe(true);
    expect(matchesTaskOccurrence(sundayTask, sunday + 1_000)).toBe(false);
    expect(isTaskScheduledOn(sundayTask, new Date(2026, 10, 16).getTime())).toBe(false);
    for (const invalid of [NaN, Infinity, -Infinity, 1e20])
      expect(isTaskScheduledOn(sundayTask, invalid)).toBe(false);
    expect(formatTaskWeekdays(sundayTask)).toBe('周日');
    expect(formatTaskWeekdays({ weekdays: [6, 7] })).toBe('周末');
    expect(formatTaskWeekdays({ weekdays: [1, 2, 3, 4, 5] })).toBe('周一至周五');
    expect(formatTaskWeekdays(DEFAULT_SCHEDULED_TASKS[0])).toBe('每天');
    expect(formatTaskWeekdays({ weekdays: [1, 3, 5] })).toBe('周一、三、五');
  });
});
