import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const context = vm.createContext({});
vm.runInContext(
  readFileSync(new URL('../generated/playback-core.js', import.meta.url), 'utf8'),
  context,
);
const core = context.PlaybackCore;
const plain = x => JSON.parse(JSON.stringify(x));
const tracks = [
  { id: 'a04', durationMs: 60008 },
  { id: 'a05', durationMs: 70385 },
];
const task = (extra = {}) => ({ ...core.DEFAULT_SCHEDULED_TASKS[0], ...extra });
const edit = (book, e, now = 100) => core.editTaskBook(book, e, now, tracks);
const enable = (book, id = 'default-morning', now = 100) =>
  edit(book, { type: 'task-enable', id, enabled: true }, now);

test('defaults match mobile v1.1 exactly and are disabled independent copies', () => {
  const book = core.initialTaskBook();
  assert.deepEqual(
    plain(
      book.tasks.map(t => [t.name, core.formatTaskTime(t), t.repeatCount, t.playMode, t.enabled]),
    ),
    [
      ['早自习', '05:30:00', 49, 'play-one', false],
      ['见缝插针', '06:30:00', 500, 'repeat-one', false],
      ['晚自习', '20:00:00', 98, 'play-one', false],
    ],
  );
  book.tasks[0].name = 'changed';
  assert.equal(core.initialTaskBook().tasks[0].name, '早自习');
  assert.ok(book.tasks.every(t => t.trackId === 'a05' && t.isSyncMode));
  book.tasks[0].weekdays.pop();
  assert.equal(core.initialTaskBook().tasks[0].weekdays.length, 7);
  assert.equal(book.tasks[1].weekdays.length, 7);
});
test('task validation covers all fields, unsafe input, 30 characters and large counts', () => {
  for (const n of [1, 5000000, Number.MAX_SAFE_INTEGER])
    assert.equal(core.validateTask(task({ repeatCount: n }), tracks).repeatCount, n);
  assert.equal(core.validateTask(task({ name: `  ${'中'.repeat(30)}  ` }), tracks).name.length, 30);
  for (const extra of [
    { name: '' },
    { name: ' ' },
    { name: '中'.repeat(31) },
    { name: 'a\nb' },
    { id: '../x' },
    { id: '__proto__' },
    { id: 'constructor' },
    { id: 'x'.repeat(81) },
    { hour: -1 },
    { hour: 24 },
    { minute: 60 },
    { second: 60 },
    { second: 1.5 },
    { second: '1' },
    { repeatCount: 0 },
    { repeatCount: -1 },
    { repeatCount: 1.5 },
    { repeatCount: Infinity },
    { repeatCount: Number.MAX_SAFE_INTEGER + 1 },
    { enabled: 'true' },
    { isSyncMode: 'false' },
    { playMode: 'shuffle' },
    { trackId: '../../a05' },
    { extra: 'field' },
    { weekdays: [] },
    { weekdays: null },
    { weekdays: [0] },
    { weekdays: [8] },
    { weekdays: [true] },
    { weekdays: ['1'] },
    { weekdays: [1.5] },
  ])
    assert.throws(() => core.validateTask(task(extra), tracks), JSON.stringify(extra));
  for (const raw of [null, [], 1, 'x']) assert.throws(() => core.validateTask(raw, tracks));
  for (const [hour, minute, second] of [
    [0, 0, 0],
    [23, 59, 59],
  ])
    assert.equal(core.validateTask(task({ hour, minute, second }), tracks).hour, hour);
});
test('legacy task books migrate to daily, subsets normalize and disjoint weekdays allow same time', () => {
  const old = core.initialTaskBook();
  for (const t of old.tasks) delete t.weekdays;
  assert.deepEqual(
    plain(core.restoreTaskBook(old, tracks).tasks[0].weekdays),
    [1, 2, 3, 4, 5, 6, 7],
  );
  assert.deepEqual(
    plain(core.validateTask(task({ weekdays: [7, 1, 7] }), tracks).weekdays),
    [1, 7],
  );
  let b = edit(core.initialTaskBook(), { type: 'task-save', task: task({ weekdays: [1] }) });
  b = edit(b, { type: 'task-save', task: task({ id: 'tuesday', weekdays: [2] }) });
  b = enable(enable(b), 'tuesday');
  assert.equal(b.tasks.filter(t => t.enabled).length, 2);
  assert.throws(() =>
    edit(b, { type: 'task-save', task: task({ id: 'tuesday', weekdays: [1, 2], enabled: true }) }),
  );
  const updated = edit(
    b,
    { type: 'task-save', task: task({ weekdays: [3], enabled: true }) },
    2000,
  );
  assert.equal(updated.notBefore['default-morning'], 2000);
});
test('automatic candidates honor selected weekday, manual settings ignore it', () => {
  const sunday = new Date(2026, 10, 15, 5, 30, 0).getTime();
  const monday = new Date(2026, 10, 16, 5, 30, 0).getTime();
  let b = edit(core.initialTaskBook(), { type: 'task-save', task: task({ weekdays: [7] }) });
  b = enable(b);
  const occurrence = at => ({ taskId: 'default-morning', scheduledAt: at, key: `day@${at}` });
  assert.equal(core.dueOccurrences(b, [occurrence(sunday)], sunday - 1, sunday).length, 1);
  assert.equal(core.dueOccurrences(b, [occurrence(monday)], monday - 1, monday).length, 0);
  assert.equal(core.taskConfig(b.tasks[0]).trackId, 'a05');
});
test('create/save/delete preserve switch and never imply playback; empty book stays empty on restore', () => {
  const before = core.initialTaskBook();
  const added = edit(before, {
    type: 'task-save',
    task: task({ id: 'new', hour: 1, name: '  测试  ' }),
  });
  assert.equal(added.tasks[0].name, '测试');
  assert.equal(before.tasks.length, 3);
  assert.equal(added.notBefore.new, 100);
  assert.throws(() =>
    edit(before, { type: 'task-save', task: task({ id: 'new', enabled: true }) }),
  );
  const active = enable(added, 'new');
  assert.throws(() =>
    edit(active, { type: 'task-save', task: task({ id: 'new', enabled: false }) }),
  );
  const saved = edit(
    active,
    { type: 'task-save', task: { ...active.tasks[0], repeatCount: 5000000 } },
    200,
  );
  assert.equal(saved.tasks[0].enabled, true);
  assert.equal(saved.notBefore.new, 100);
  let empty = saved;
  for (const t of saved.tasks) empty = edit(empty, { type: 'task-delete', id: t.id });
  assert.equal(core.restoreTaskBook(empty, tracks).tasks.length, 0);
  assert.throws(() => edit(empty, { type: 'task-delete', id: 'absent' }));
});
test('same second conflict applies only to enabled tasks and self-edit is allowed', () => {
  let b = edit(core.initialTaskBook(), { type: 'task-save', task: task({ id: 'same' }) });
  b = enable(b);
  assert.throws(() => enable(b, 'same'));
  b = edit(b, { type: 'task-save', task: { ...b.tasks.find(t => t.id === 'same'), second: 1 } });
  b = enable(b, 'same');
  assert.equal(b.tasks.filter(t => t.enabled).length, 2);
  assert.doesNotThrow(() =>
    edit(b, { type: 'task-save', task: b.tasks.find(t => t.id === 'same') }),
  );
  assert.throws(() => edit(b, { type: 'task-save', task: task({ id: 'same', enabled: true }) }));
});
test('restored task data validates IDs/conflicts/timestamps and does not reseed deleted defaults', () => {
  const initial = core.initialTaskBook();
  assert.deepEqual(plain(core.restoreTaskBook(initial, tracks)), plain(initial));
  for (const raw of [
    null,
    {},
    { ...initial, version: 2 },
    { ...initial, tasks: [task(), task()] },
    { ...initial, tasks: [task({ enabled: true }), task({ id: 'other', enabled: true })] },
    { ...initial, handled: { key: -1 } },
    { ...initial, notBefore: { '../x': 1 } },
    { ...initial, handled: [] },
    { ...initial, tasks: Array(1001).fill(task()) },
  ])
    assert.throws(() => core.restoreTaskBook(raw, tracks));
});
test('manual config ignores enabled and time; each mode and sync flag is applied unchanged', () => {
  for (const mode of core.MODES)
    for (const sync of [false, true]) {
      const config = core.taskConfig(
        task({ enabled: false, playMode: mode, isSyncMode: sync, repeatCount: 5000000 }),
      );
      assert.deepEqual(plain(config), { trackId: 'a05', mode, sync, repeatCount: 5000000 });
      const before = { ...core.initialState(config), completedCount: 39, sessionCount: 2 };
      const result = core.transition(
        before,
        { type: 'start', config },
        { nowMs: 1000, midnightMs: 0 },
        tracks,
      );
      assert.equal(result.state.completedCount, 0);
      assert.equal(result.effects[0].type, 'load');
    }
});
test('automatic time boundaries, 15 minute lateness, enable/edit barriers and backward clock', () => {
  const b = enable(core.initialTaskBook());
  const o = {
    taskId: 'default-morning',
    scheduledAt: 1000,
    key: 'default-morning@2026-11-15T05:30:00',
  };
  const due = (prev, now, book = b, occurrence = o) =>
    core.dueOccurrences(book, [occurrence], prev, now);
  assert.equal(due(999, 1000).length, 1);
  assert.equal(due(1000, 1000).length, 0);
  assert.equal(due(998, 999).length, 0);
  assert.equal(due(999, 901000).length, 1);
  assert.equal(due(999, 901001).length, 0);
  assert.equal(due(1001, 1000).length, 0);
  assert.equal(due(999, 1000, core.initialTaskBook()).length, 0);
  assert.equal(due(999, 1000, enable(core.initialTaskBook(), 'default-morning', 1000)).length, 0);
  const changed = edit(b, { type: 'task-save', task: { ...b.tasks[0], second: 1 } }, 2000);
  assert.equal(changed.notBefore['default-morning'], 2000);
  assert.equal(due(999, 1000, changed).length, 0);
});
test('durable occurrence claim survives restart and repeated civil time, sorted catchup last wins', () => {
  let book = enable(core.initialTaskBook());
  book = enable(book, 'default-opportunity');
  const one = { taskId: 'default-morning', scheduledAt: 1000, key: 'first@2026-11-15T05:30:00' };
  const two = {
    taskId: 'default-opportunity',
    scheduledAt: 2000,
    key: 'second@2026-11-15T06:30:00',
  };
  assert.deepEqual(plain(core.dueOccurrences(book, [two, one], 999, 3000)), [one, two]);
  book = core.claimOccurrence(book, one, 3000);
  const restored = core.restoreTaskBook(book, tracks);
  assert.equal(core.dueOccurrences(restored, [one], 999, 3000).length, 0);
  assert.equal(
    core.dueOccurrences(restored, [{ ...one, scheduledAt: 3601000 }], 3600000, 3601000).length,
    0,
  );
  assert.equal(
    core.dueOccurrences(
      restored,
      [{ ...one, key: 'next-day', scheduledAt: 86401000 }],
      86400000,
      86401000,
    ).length,
    1,
  );
  const pruned = core.claimOccurrence(book, two, 10 * 86400000);
  assert.equal(Object.keys(pruned.handled).length, 1);
});
