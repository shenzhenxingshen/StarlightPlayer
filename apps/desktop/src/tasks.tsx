import React, { useEffect, useRef, useState } from 'react';
import {
  NEW_SCHEDULED_TASK,
  formatTaskTime,
  formatTaskWeekdays,
  sortScheduledTasks,
  validateTask,
  type ScheduledTask,
  type TaskEdit,
  type Track,
  type Mode,
} from '../../../packages/playback-core/src';
import { formatRepeatCount } from '../../../src/utils/numberFormat';
import { ALL_TASK_WEEKDAYS, TASK_WEEKDAY_LABELS } from '../../../src/constants/scheduledTasks';

export type TaskCommand = TaskEdit | { type: 'task-play'; id: string };
const modes: Record<Mode, string> = {
  'play-one': '单曲',
  'repeat-one': '单曲循环',
  'play-all': '列表',
  'repeat-all': '列表循环',
};

export function TaskPanel({
  tasks,
  tracks,
  busy,
  error,
  send,
  onPlaying,
}: {
  tasks: ScheduledTask[];
  tracks: Track[];
  busy: boolean;
  error: string;
  send: (command: TaskCommand) => Promise<boolean>;
  onPlaying: () => void;
}) {
  const [editing, setEditing] = useState<ScheduledTask | null>(null);
  const [creating, setCreating] = useState(false);
  return (
    <main className="page tasks">
      <h1>任务</h1>
      <p className="muted">
        按任务的重复日期和本机时间启动。启用开关只控制定时，播放按钮始终可以立即开始新任务。
      </p>
      <div className="task-list">
        {sortScheduledTasks(tasks).map(task => (
          <article className="card task-card" key={task.id}>
            <button
              className="task-play"
              aria-label={`立即播放 ${task.name}`}
              disabled={busy}
              onClick={async () => {
                if (await send({ type: 'task-play', id: task.id })) onPlaying();
              }}>
              ▶
            </button>
            <button
              className="task-info"
              aria-label={`修改任务 ${task.name}`}
              disabled={busy}
              onClick={() => {
                setCreating(false);
                setEditing(task);
              }}>
              <time>
                {formatTaskTime(task)} · {formatTaskWeekdays(task)}
              </time>
              <span>
                {task.name}，{formatRepeatCount(task.repeatCount)} 遍
              </span>
              <small>
                {modes[task.playMode]}，{task.isSyncMode ? '同步' : '不同步'}
              </small>
            </button>
            <button
              role="switch"
              className={`switch${task.enabled ? ' on' : ''}`}
              aria-label={`定时启用 ${task.name}`}
              aria-checked={task.enabled}
              disabled={busy}
              onClick={() =>
                void send({ type: 'task-enable', id: task.id, enabled: !task.enabled })
              }>
              <i />
            </button>
          </article>
        ))}
      </div>
      {tasks.length === 0 && <p className="muted">还没有任务，点击下方按钮添加。</p>}
      <button
        className="primary add-task"
        disabled={busy}
        onClick={() => {
          setCreating(true);
          setEditing({
            ...NEW_SCHEDULED_TASK,
            weekdays: [...ALL_TASK_WEEKDAYS],
            id: `task-${crypto.randomUUID()}`,
          });
        }}>
        ＋增加任务
      </button>
      <aside className="card task-help">
        <h2>定时与后台运行</h2>
        <p>
          窗口最小化后仍可定时播放。需要关闭窗口后继续运行，可在“我的”中开启“关闭窗口后留在后台”。
        </p>
        <p>
          电脑睡眠、关机或完全退出应用时无法播放，也不会主动唤醒电脑。
          运行期间从睡眠恢复，延迟不超过 15 分钟的任务可以补执行；更早的任务不补播。
          重新启动应用不追补退出期间的任务。
        </p>
        <p>
          同步任务按当天 00:00:00 的统一时间轴对齐；不同步任务在实际执行时从头播放。
          若多个任务因休眠同时到期，会按时间先后执行，最后一个生效。
        </p>
      </aside>
      {editing && (
        <TaskEditor
          key={editing.id}
          initial={editing}
          creating={creating}
          tracks={tracks}
          busy={busy}
          error={error}
          send={send}
          close={() => setEditing(null)}
        />
      )}
    </main>
  );
}

function TaskEditor({
  initial,
  creating,
  tracks,
  busy,
  error,
  send,
  close,
}: {
  initial: ScheduledTask;
  creating: boolean;
  tracks: Track[];
  busy: boolean;
  error: string;
  send: (command: TaskCommand) => Promise<boolean>;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [task, setTask] = useState(() => ({
    ...initial,
    weekdays: [...(initial.weekdays ?? ALL_TASK_WEEKDAYS)],
  }));
  const [repeat, setRepeat] = useState(formatRepeatCount(initial.repeatCount));
  const [invalid, setInvalid] = useState('');
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setInvalid('');
    try {
      const text = repeat.replace(/,/g, '').trim();
      if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(Number(text)))
        throw new Error('每首重复遍数须为正整数，不超过 9,007,199,254,740,991');
      const validated = validateTask({ ...task, repeatCount: Number(text) }, tracks);
      if (await send({ type: 'task-save', task: validated })) close();
    } catch (e) {
      setInvalid(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <dialog
      ref={dialog}
      className="task-editor"
      aria-labelledby="task-editor-title"
      onCancel={e => {
        e.preventDefault();
        if (!busy) close();
      }}>
      <form onSubmit={e => void save(e)}>
        <header className="editor-header">
          <h2 id="task-editor-title">{creating ? '增加任务' : '修改任务'}</h2>
          <button type="button" disabled={busy} onClick={close} aria-label="关闭任务编辑">
            ×
          </button>
        </header>
        {(invalid || error) && (
          <p role="alert" className="error">
            {invalid || error}
          </p>
        )}
        <label>
          任务名称
          <input
            autoFocus
            maxLength={30}
            required
            value={task.name}
            onChange={e => setTask({ ...task, name: e.target.value })}
          />
        </label>
        <fieldset className="time-fields">
          <legend>启动时刻</legend>
          {(
            [
              ['hour', '时', 24],
              ['minute', '分', 60],
              ['second', '秒', 60],
            ] as const
          ).map(([key, label, count]) => (
            <label key={key}>
              <select
                aria-label={`启动${label}`}
                value={task[key]}
                onChange={e => setTask({ ...task, [key]: Number(e.target.value) })}>
                {Array.from({ length: count }, (_, n) => (
                  <option key={n} value={n}>
                    {String(n).padStart(2, '0')}
                  </option>
                ))}
              </select>
              {label}
            </label>
          ))}
        </fieldset>
        <fieldset aria-describedby="task-weekday-help">
          <legend>重复</legend>
          <div className="weekday-options">
            {ALL_TASK_WEEKDAYS.map(day => (
              <button
                key={day}
                type="button"
                aria-label={`周${TASK_WEEKDAY_LABELS[day - 1]}`}
                aria-pressed={task.weekdays.includes(day)}
                disabled={busy}
                onClick={() =>
                  setTask(current => ({
                    ...current,
                    weekdays: current.weekdays.includes(day)
                      ? current.weekdays.filter(selected => selected !== day)
                      : [...current.weekdays, day].sort((a, b) => a - b),
                  }))
                }>
                {TASK_WEEKDAY_LABELS[day - 1]}
              </button>
            ))}
          </div>
          <p id="task-weekday-help" className="muted">
            {formatTaskWeekdays(task)} · 至少选择一天，仅影响定时启动，不限制立即播放。
          </p>
        </fieldset>
        <label>
          歌曲名称
          <select
            value={task.trackId}
            onChange={e => setTask({ ...task, trackId: e.target.value })}>
            {tracks.map(t => (
              <option key={t.id} value={t.id}>
                {t.code} {t.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          每首重复遍数
          <input
            inputMode="numeric"
            value={repeat}
            onChange={e => setRepeat(e.target.value)}
            onBlur={() => {
              const text = repeat.replace(/,/g, '').trim();
              const n = Number(text);
              if (/^[1-9]\d*$/.test(text) && Number.isSafeInteger(n))
                setRepeat(formatRepeatCount(n));
            }}
          />
        </label>
        <fieldset>
          <legend>循环模式</legend>
          <div className="mode-options">
            {(Object.entries(modes) as [Mode, string][]).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                aria-pressed={task.playMode === mode}
                onClick={() => setTask({ ...task, playMode: mode })}>
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="sync-choice">
          <input
            type="checkbox"
            checked={task.isSyncMode}
            onChange={e => setTask({ ...task, isSyncMode: e.target.checked })}
          />
          同步播放
        </label>
        <p className="muted">
          保存不会开始播放。{creating ? '新任务默认关闭，请在列表中启用。' : '启用状态保持不变。'}
        </p>
        <footer className="editor-actions">
          {!creating && (
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={() => setDeleting(true)}>
              删除任务
            </button>
          )}
          <button type="button" disabled={busy} onClick={close}>
            取消
          </button>
          <button className="primary" type="submit" disabled={busy}>
            保存
          </button>
        </footer>
        {deleting && (
          <div className="delete-confirm" role="alert">
            <p>确定删除“{task.name}”吗？删除后不再定时启动；已经开始的播放不会被停止。</p>
            <button type="button" disabled={busy} onClick={() => setDeleting(false)}>
              保留任务
            </button>
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={async () => {
                if (await send({ type: 'task-delete', id: task.id })) close();
              }}>
              确认删除
            </button>
          </div>
        )}
      </form>
    </dialog>
  );
}
