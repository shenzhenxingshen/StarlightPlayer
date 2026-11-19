import { compileProgram } from '../../packages/program-core/src';
import {
  defaultVideoTasks,
  occurrenceOnDate,
  sessionTimeline,
  VideoSession,
} from '../../packages/program-core/src/tasks';
import { VIDEO_CATALOG } from '@/video/catalog';
import {
  approximateEnd,
  durationText,
  fullscreenVideoLayout,
  programProgress,
  setVideoFullscreen,
  setVideoPlayerFocused,
  useVideoPresentation,
  videoTaskWindow,
} from '@/video/presentation';

const date = new Date(2026, 10, 19, 5, 40);
it.each([
  [390, 700],
  [750, 330],
  [1194, 834],
  [834, 1194],
  [320, 480],
])('常驻遍数在%s×%s视频内部、原计数区且不进入底部字幕区', (width, height) => {
  const { video, badge } = fullscreenVideoLayout(width, height);
  const scale = video.width / 856;
  const videoLeft = (width - video.width) / 2;
  const videoTop = (height - video.height) / 2;
  expect(video.width).toBeLessThanOrEqual(width);
  expect(video.height).toBeLessThanOrEqual(height);
  expect((badge.left - videoLeft) / scale).toBeCloseTo(100);
  expect((badge.top - videoTop) / scale).toBeCloseTo(324);
  expect(badge.top + badge.height).toBeLessThan(videoTop + 408 * scale);
  expect(badge.left + badge.width).toBeLessThan(videoLeft + video.width);
});

function session(count = 49): VideoSession {
  const task = defaultVideoTasks()[count === 49 ? 0 : 1];
  return { occurrence: occurrenceOnDate(task, VIDEO_CATALOG, date)!, intent: 'playing' };
}

it.each([49, 98])('%s遍的支撑片段不计正文，最后一遍计入正文总量', count => {
  const s = session(count);
  const timeline = sessionTimeline(s, VIDEO_CATALOG);
  for (const span of timeline.spans) {
    const now =
      s.occurrence.startEpochMs + Math.ceil((span.startTicks * 1000) / timeline.timescale);
    const progress = programProgress(s, timeline, now);
    expect(progress.currentCycle).toBe(span.cycle);
    expect(progress.totalCycles).toBe(count);
    expect(progress.entry?.asset).toBe(span.asset);
    expect(progress.clipElapsedSeconds).toBeLessThan(0.0011);
    expect(progress.clipTotalSeconds).toBe((span.endTicks - span.startTicks) / timeline.timescale);
  }
  const progress = programProgress(s, timeline, s.occurrence.startEpochMs);
  expect(progress.entries.map(e => e.repeat)).toEqual([1, 1, count - 1, 1, 1]);
  expect(progress.entries).toHaveLength(5);
});

it('开始前归零，终点归满且没有第N+1遍，暂停不冻结公共进度', () => {
  const s = session();
  const timeline = sessionTimeline(s, VIDEO_CATALOG);
  const start = s.occurrence.startEpochMs;
  expect(programProgress(s, timeline, start - 1)).toMatchObject({
    elapsedSeconds: 0,
    fraction: 0,
    currentCycle: null,
    entry: null,
    ended: false,
  });
  const end = programProgress(s, timeline, Math.ceil(s.occurrence.endEpochMs));
  expect(end).toMatchObject({ fraction: 1, ended: true, currentCycle: null, entry: null });
  expect(end.elapsedSeconds).toBe(end.totalSeconds);
  const before = programProgress(s, timeline, start + 100_000);
  const after = programProgress({ ...s, intent: 'paused' }, timeline, start + 200_000);
  expect(after.elapsedSeconds - before.elapsedSeconds).toBe(100);
  expect(after.currentCycle).toBeGreaterThan(before.currentCycle!);
});

it('相邻相同素材仍保留独立条目；无正文流程不制造计数', () => {
  const s = session();
  const timeline = compileProgram({
    id: 'test',
    revision: 'test',
    timescale: 1000,
    segments: [
      { asset: 'same', role: 'intro', repeat: 2, durationTicks: 1000 },
      { asset: 'same', role: 'intro', repeat: 3, durationTicks: 1000 },
    ],
  });
  const first = programProgress(s, timeline, s.occurrence.startEpochMs + 1999);
  const second = programProgress(s, timeline, s.occurrence.startEpochMs + 2000);
  expect(first.entry?.index).toBe(0);
  expect(second.entry?.index).toBe(1);
  expect(second.entries.map(e => e.repeat)).toEqual([2, 3]);
  expect(second.currentCycle).toBeNull();
  expect(second.totalCycles).toBe(0);
  expect(second.clipElapsedSeconds).toBe(0);
});

it('关闭自动启动仍可在窗口内加入；窗外显示下次日期', () => {
  const s = session();
  const task = { ...s.occurrence.task, enabled: false, weekdays: [4] };
  expect(videoTaskWindow(task, VIDEO_CATALOG, date.getTime(), null).active?.key).toBe(
    s.occurrence.key,
  );
  const before = videoTaskWindow(task, VIDEO_CATALOG, s.occurrence.startEpochMs - 1, null);
  expect(before.active).toBeNull();
  expect(before.next?.startEpochMs).toBe(s.occurrence.startEpochMs);
  const after = videoTaskWindow(task, VIDEO_CATALOG, Math.ceil(s.occurrence.endEpochMs), null);
  expect(after.active).toBeNull();
  expect(new Date(after.next!.startEpochMs).getDate()).toBe(26);
});

it('编辑时间与序列后已开始的快照优先，其他任务不得借用该快照', () => {
  const s = session();
  const changed = { ...s.occurrence.task, hour: 22, sequence: [{ assetId: 'intro49', repeat: 1 }] };
  expect(videoTaskWindow(changed, VIDEO_CATALOG, date.getTime(), s).active).toBe(s.occurrence);
  expect(videoTaskWindow(changed, VIDEO_CATALOG, date.getTime(), null).active).toBeNull();
  expect(
    videoTaskWindow(defaultVideoTasks()[1], VIDEO_CATALOG, date.getTime(), s).active,
  ).toBeNull();
  expect(
    videoTaskWindow(changed, VIDEO_CATALOG, Math.ceil(s.occurrence.endEpochMs), s).active,
  ).toBeNull();
});

it('跨午夜按前一天的星期加入，结束后查找下一次选定星期', () => {
  const task = { ...defaultVideoTasks()[0], hour: 23, minute: 30, weekdays: [4] };
  const window = videoTaskWindow(
    task,
    VIDEO_CATALOG,
    new Date(2026, 10, 20, 0, 10).getTime(),
    null,
  );
  expect(new Date(window.active!.startEpochMs).getDate()).toBe(19);
  expect(new Date(window.next!.startEpochMs).getDate()).toBe(26);
  expect(approximateEnd(task, 3726.566667)).toBe('次日 00:32:07');
});

it.each([
  [-1, '00:00:00'],
  [0, '00:00:00'],
  [59.999, '00:00:59'],
  [60, '00:01:00'],
  [3600, '01:00:00'],
  [7329.9, '02:02:09'],
])('时长%s格式化为%s', (seconds, expected) => {
  expect(durationText(seconds)).toBe(expected);
});

it('切换标签立即退出全屏，非播放标签不能进入全屏', () => {
  setVideoPlayerFocused(true);
  setVideoFullscreen(true);
  expect(useVideoPresentation.getState().fullscreen).toBe(true);
  setVideoPlayerFocused(false);
  setVideoFullscreen(true);
  expect(useVideoPresentation.getState()).toMatchObject({ focused: false, fullscreen: false });
  setVideoPlayerFocused(true);
  expect(useVideoPresentation.getState().fullscreen).toBe(false);
});
