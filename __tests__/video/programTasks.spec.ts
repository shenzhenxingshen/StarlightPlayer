import { compileProgram, locateTicks, locateWallClock } from '../../packages/program-core/src';
import {
  activeOccurrence,
  defaultVideoTasks,
  dueOccurrence,
  occurrenceOnDate,
  sessionPosition,
  sessionTimeline,
  validateVideoTask,
  VideoSession,
  VideoTask,
} from '../../packages/program-core/src/tasks';
import { VIDEO_CATALOG } from '@/video/catalog';

const date = (hour: number, minute = 0, day = 19) =>
  new Date(2026, 10, day, hour, minute).getTime();
const task = (patch: Partial<VideoTask> = {}): VideoTask => ({
  ...defaultVideoTasks()[0],
  ...patch,
});

describe('完整视频流程日历与不可分割时间轴', () => {
  it.each([49, 98])('%i遍默认结构、所有逐帧边界、结束不循环', count => {
    const t = defaultVideoTasks()[count === 49 ? 0 : 1];
    const timeline = compileProgram(validateVideoTask(t, VIDEO_CATALOG));
    expect(t.sequence.map(s => s.repeat)).toEqual([1, 1, count - 1, 1, 1]);
    expect(timeline.totalCycles).toBe(count);
    expect(timeline.spans).toHaveLength(count + 3);
    expect(timeline.totalTicks).toBe(count === 49 ? 164341590 : 323248590);
    for (const span of timeline.spans) {
      expect(locateTicks(timeline, span.startTicks)).toMatchObject({
        status: 'active',
        offsetTicks: 0,
        span,
      });
      expect(locateTicks(timeline, span.endTicks - 1)).toMatchObject({ status: 'active', span });
      if (span.index)
        expect(locateTicks(timeline, span.startTicks - 1)).toMatchObject({
          span: { index: span.index - 1 },
        });
    }
    expect(locateTicks(timeline, -1).status).toBe('waiting');
    expect(locateTicks(timeline, timeline.totalTicks).status).toBe('ended');
    expect(locateTicks(timeline, timeline.totalTicks * 3).status).toBe('ended');
    expect(() => locateTicks(timeline, NaN)).toThrow();
    expect(() => locateWallClock(timeline, 0, Infinity)).toThrow();
  });

  it('晚到十分钟直接定位；禁用只阻止自动，不阻止时段内手动加入', () => {
    const t = task();
    const at = date(5, 40);
    const o = activeOccurrence(t, VIDEO_CATALOG, at)!;
    expect(o.startEpochMs).toBe(date(5, 30));
    const position = sessionPosition({ occurrence: o, intent: 'playing' }, VIDEO_CATALOG, at);
    expect(position).toMatchObject({ status: 'active', span: { role: 'regular', repetition: 8 } });
    expect(dueOccurrence([t], VIDEO_CATALOG, at, [])).toBeNull();
    expect(activeOccurrence(t, VIDEO_CATALOG, date(5, 29))).toBeNull();
    expect(activeOccurrence(t, VIDEO_CATALOG, Math.ceil(o.endEpochMs))).toBeNull();
    expect(dueOccurrence([{ ...t, enabled: true }], VIDEO_CATALOG, at, [])?.key).toBe(o.key);
  });

  it('跨午夜的星期按开始日期，暂停不冻结公共进度', () => {
    const t = task({ hour: 23, minute: 50, weekdays: [4] }); // Thursday
    const at = date(0, 10, 20);
    const o = activeOccurrence(t, VIDEO_CATALOG, at)!;
    expect(o.startEpochMs).toBe(date(23, 50, 19));
    expect(activeOccurrence(t, VIDEO_CATALOG, date(23, 50, 20))).toBeNull();
    expect(sessionPosition({ occurrence: o, intent: 'paused' }, VIDEO_CATALOG, at)).toMatchObject({
      elapsedTicks: 1200 * 44100,
    });
  });

  it('重叠任务取最新；最新已处理后不再回退旧任务', () => {
    const earlier = task({ id: 'video-earlier', enabled: true });
    const later = task({ id: 'video-later', enabled: true, minute: 35 });
    const at = date(5, 40);
    const due = dueOccurrence([earlier, later], VIDEO_CATALOG, at, [])!;
    expect(due.task.id).toBe(later.id);
    expect(dueOccurrence([earlier, later], VIDEO_CATALOG, at, [due.key])).toBeNull();
  });

  it('快照深拷贝；篡改媒体路径、时长、起点、revision 或 intent 均拒绝', () => {
    const original = task();
    const occurrence = occurrenceOnDate(original, VIDEO_CATALOG, new Date(date(0)))!;
    const snapshot: VideoSession = { occurrence, intent: 'playing' };
    original.sequence[2].repeat = 1;
    expect(occurrence.task.sequence[2].repeat).toBe(48);
    expect(() => sessionTimeline(snapshot, VIDEO_CATALOG)).not.toThrow();
    const mutate = (fn: (s: VideoSession) => void) => {
      const damaged = JSON.parse(JSON.stringify(snapshot));
      fn(damaged);
      expect(() => sessionTimeline(damaged, VIDEO_CATALOG)).toThrow();
    };
    mutate(s => {
      s.occurrence.definition.segments[0].asset = '../../unknown.mp4';
    });
    mutate(s => {
      s.occurrence.endEpochMs++;
    });
    mutate(s => {
      s.occurrence.startEpochMs++;
    });
    mutate(s => {
      s.occurrence.definition.revision = 'old';
    });
    mutate(s => {
      s.intent = 'invalid' as never;
    });
  });

  it.each([
    { name: '' },
    { name: '字'.repeat(31) },
    { hour: 24 },
    { minute: -1 },
    { second: 1.5 },
    { weekdays: [] },
    { weekdays: [1, 1] },
    { weekdays: [0] },
    { sequence: [] },
    { sequence: [{ assetId: 'unknown', repeat: 1 }] },
    { sequence: [{ assetId: 'intro49', repeat: 0 }] },
    { sequence: [{ assetId: 'intro49', repeat: 1001 }] },
    {
      sequence: [
        { assetId: 'regular', repeat: 1000 },
        { assetId: 'final', repeat: 1 },
      ],
    },
    {
      sequence: [
        { assetId: 'final', repeat: 600 },
        { assetId: 'outro', repeat: 401 },
      ],
    },
  ])('拒绝无效/超限设置 %j', patch => {
    expect(() => validateVideoTask(task(patch), VIDEO_CATALOG)).toThrow();
  });
  it('允许Unicode30字符、最大1000段及非默认序列', () => {
    expect(() =>
      validateVideoTask(
        task({
          name: '🙂'.repeat(30),
          sequence: [{ assetId: 'intro49', repeat: 1000 }],
        }),
        VIDEO_CATALOG,
      ),
    ).not.toThrow();
  });
  it('非法当前时间/日期安全拒绝', () => {
    expect(() => activeOccurrence(task(), VIDEO_CATALOG, Infinity)).toThrow();
    expect(() => occurrenceOnDate(task(), VIDEO_CATALOG, new Date(NaN))).toThrow();
  });
});
