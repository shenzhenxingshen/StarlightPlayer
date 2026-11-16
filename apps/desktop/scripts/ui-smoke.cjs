// Run with playwright-cli run-code --filename from repository root.
// This intentionally mocks IPC: layout/form coverage only, never audio evidence.
async page => {
  await page.addInitScript(() => {
    const state = {
      version: 1,
      config: { trackId: 'a05', repeatCount: 5000000, mode: 'play-one', sync: true },
      status: 'playing',
      generation: 1,
      sessionCount: 38,
      completedCount: 38,
      eligible: true,
      positionMs: 20000,
      pausedAtMs: null,
      error: null,
      dailyStats: { '2026-11-15': { a05: 38 } },
    };
    const tracks = [
      { id: 'a04', code: 'A04', title: '大悲咒（快版）', durationMs: 60008 },
      { id: 'a05', code: 'A05', title: '大悲咒（共修版）', durationMs: 70385 },
    ];
    window.__UI_TEST_STATE__ = state;
    window.__UI_TEST_COMMANDS__ = [];
    window.__UI_TEST_RECOVERING__ = false;
    const preferences = JSON.parse(localStorage.getItem('desktop-ui-test-preferences') ||
      '{"careMode":false,"closeToBackground":true,"initialized":true}');
    let tasks = [
      { id: 'default-morning', name: '早自习', hour: 5, minute: 30, second: 0, trackId: 'a05', repeatCount: 49, playMode: 'play-one', isSyncMode: true, enabled: false },
      { id: 'default-opportunity', name: '见缝插针', hour: 6, minute: 30, second: 0, trackId: 'a05', repeatCount: 500, playMode: 'repeat-one', isSyncMode: true, enabled: false },
      { id: 'default-evening', name: '晚自习', hour: 20, minute: 0, second: 0, trackId: 'a05', repeatCount: 98, playMode: 'play-one', isSyncMode: true, enabled: false },
    ].map(task => ({ ...task, weekdays: [1, 2, 3, 4, 5, 6, 7] }));
    // IPC mock mirrors the conflict boundary; real rules are exercised by core/native tests.
    const checkConflict = task => {
      if (task.enabled && tasks.some(t => t.id !== task.id && t.enabled &&
        t.hour === task.hour && t.minute === task.minute && t.second === task.second &&
        t.weekdays.some(day => task.weekdays.includes(day))))
        throw Error('启动时刻和重复星期冲突');
    };
    const start = config => {
      state.config = { ...config };
      state.completedCount = state.sessionCount = 0;
      state.eligible = true;
      state.status = 'playing';
    };
    window.__TAURI_INTERNALS__ = {
      invoke: async (name, args) => {
        if (name === 'control') {
          const command = args.command;
          window.__UI_TEST_COMMANDS__.push(structuredClone(command));
          if (command.type === 'start') {
            start(command.config);
          } else if (command.type === 'configure') {
            Object.assign(state.config, command.settings);
          } else if (command.type === 'pause') {
            state.status = 'paused';
            window.__UI_TEST_RECOVERING__ = false;
          }
          else if (command.type === 'play') state.status = 'playing';
          else if (command.type === 'seek') state.positionMs = command.positionMs;
          else if (command.type === 'preferences') {
            Object.assign(preferences, command);
            localStorage.setItem('desktop-ui-test-preferences', JSON.stringify(preferences));
          } else if (command.type === 'task-save') {
            const old = tasks.find(t => t.id === command.task.id);
            const value = { ...command.task, enabled: old?.enabled ?? false };
            checkConflict(value);
            tasks = [...tasks.filter(t => t.id !== value.id), value];
          } else if (command.type === 'task-enable') {
            const task = tasks.find(t => t.id === command.id);
            checkConflict({ ...task, enabled: command.enabled });
            task.enabled = command.enabled;
          } else if (command.type === 'task-delete') tasks = tasks.filter(t => t.id !== command.id);
          else if (command.type === 'task-play') {
            const task = tasks.find(t => t.id === command.id);
            start({ trackId: task.trackId, repeatCount: task.repeatCount, mode: task.playMode, sync: task.isSyncMode });
          } else if (command.type === 'next' || command.type === 'previous') {
            start({ ...state.config, trackId: state.config.trackId === 'a05' ? 'a04' : 'a05' });
          } else if (command.type === 'export-diagnostics') {
            return { path: '/isolated-ui-test/exports/diagnostics.jsonl' };
          }
        }
        return structuredClone({ state, tracks, tasks, preferences, dayKey: '2026-11-15',
          recovering: window.__UI_TEST_RECOVERING__,
          recentLogs: [{ event: 'mock-only' }], platform: 'UI test',
          engine: 'UI MOCK · no audio' });
      },
    };
  });
  await page.evaluate(() => {
    localStorage.removeItem('starlight.desktop.care.v1');
    localStorage.removeItem('desktop-ui-test-preferences');
  });
  await page.reload();
  await page.getByRole('heading', { name: '大悲咒（共修版）' }).waitFor();
  if ((await page.locator('.app-header > span').first().innerText()) !== '星光播放器' ||
    await page.title() !== '星光播放器' || await page.getByText(/技术预览/).count())
    throw Error('App name/title must be 星光播放器, without a preview label');
  if ((await page.locator('.record').textContent()).trim() !== '')
    throw Error('Record artwork must not contain text');
  const results = [];
  for (const [name, width, height] of [
    ['wide', 1120, 780],
    ['square', 800, 800],
    ['landscape-boundary', 1024, 768],
    ['portrait', 420, 820],
    ['portrait-minimum', 420, 620],
  ]) {
    await page.setViewportSize({ width, height });
    const layout = await page.evaluate(() => {
      const rect = selector => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          cx: r.x + r.width / 2,
          cy: r.y + r.height / 2,
        };
      };
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        background: getComputedStyle(document.querySelector('.app')).backgroundColor,
        accent: getComputedStyle(document.querySelector('.play')).color,
        play: rect('.play'),
        record: rect('.record'),
        recordHole: rect('.record-label i'),
        controls: rect('.controls'),
        timeline: rect('.timeline'),
        count: rect('.counts strong'),
        repeat: rect('.counts small'),
        slider: rect('.rail input'),
      };
    });
    if (layout.overflow) throw Error(`${name}: horizontal overflow`);
    if (
      Math.abs(layout.recordHole.cx - layout.record.cx) > 1 ||
      Math.abs(layout.recordHole.cy - layout.record.cy) > 1
    )
      throw Error(`${name}: record hole must remain centered`);
    if (layout.background !== 'rgb(242, 242, 242)' || layout.accent !== 'rgb(77, 188, 170)')
      throw Error(`${name}: palette differs from mobile`);
    if (width >= height) {
      if (
        Math.abs(layout.play.cy - layout.record.cy) > 2 ||
        Math.abs(layout.controls.height - layout.timeline.height) > 2
      )
        throw Error(`${name}: alignment mismatch ${JSON.stringify(layout)}`);
      if (layout.repeat.x >= layout.slider.x) throw Error(`${name}: counts must be left of slider`);
    } else if (!(layout.count.y < layout.slider.y && layout.repeat.y > layout.slider.y)) {
      throw Error(`${name}: portrait count order`);
    }
    results.push({ name, width, height, layout });
    await page.screenshot({ path: `output/playwright/desktop-${name}.png`, fullPage: true });
  }
  await page.evaluate(() => {
    window.__UI_TEST_STATE__.status = 'error';
    window.__UI_TEST_RECOVERING__ = true;
  });
  await page.getByText('播放中断，正在尝试恢复…', { exact: true }).waitFor();
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  if (await page.evaluate(() => window.__UI_TEST_RECOVERING__))
    throw Error('Pause did not cancel recovery');
  await page.locator('.controls').getByRole('button', { name: '播放', exact: true }).click();
  if (!(await page.getByRole('slider').isDisabled())) throw Error('Sync seek must be disabled');
  if (await page.locator('.player-hint').count()) throw Error('Sync explanatory hint must be removed');
  await page.getByRole('button', { name: '我的', exact: true }).click();
  const count = page.getByLabel('每首重复遍数');
  await count.fill('0');
  await page.getByRole('button', { name: '确定', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '请输入有效的正整数' }).waitFor();
  await count.fill('5000000');
  // Several snapshot refreshes must not discard an in-progress form edit.
  await page.waitForTimeout(800);
  if ((await count.inputValue()) !== '5000000') throw Error('Polling overwrote draft');
  await page.getByRole('button', { name: '确定', exact: true }).click();
  if ((await count.inputValue()) !== '5,000,000') throw Error('Missing formatted thousands');
  await page.getByRole('navigation').getByRole('button', { name: '播放', exact: true }).click();
  await page.getByRole('button', { name: '同步播放', exact: true }).click();
  if (await page.locator('.player-hint').count())
    throw Error('Non-sync explanatory hint must be removed');
  if ((await page.locator('.counts strong').textContent()) !== '39')
    throw Error('Sync change cleared counts');
  await page.getByRole('button', { name: '循环模式：单曲播放' }).click();
  await page.getByRole('button', { name: '循环模式：列表循环' }).waitFor();
  if ((await page.locator('.counts strong').textContent()) !== '39')
    throw Error('Mode change cleared counts');
  await page.getByRole('slider', { name: '播放进度', exact: true }).waitFor();
  if (await page.getByRole('slider').isDisabled()) throw Error('Non-sync seek should be enabled');
  const slider = page.getByRole('slider');
  await slider.press('Home');
  const beforeDrag = await page.evaluate(
    () => window.__UI_TEST_COMMANDS__.filter(c => c.type === 'seek').length,
  );
  const box = await slider.boundingBox();
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, { steps: 8 });
  const duringDrag = await page.evaluate(
    () => window.__UI_TEST_COMMANDS__.filter(c => c.type === 'seek').length,
  );
  if (duringDrag !== beforeDrag) throw Error('Dragging must not flood native seek commands');
  await page.mouse.up();
  const afterDrag = await page.evaluate(
    () => window.__UI_TEST_COMMANDS__.filter(c => c.type === 'seek').length,
  );
  if (beforeDrag !== 1 || afterDrag !== beforeDrag + 1)
    throw Error('Keyboard or pointer seek did not commit once');
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.locator('.controls').getByRole('button', { name: '播放', exact: true }).waitFor();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await page.getByRole('button', { name: '1', exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: '播放', exact: true }).click();
  if (await page.locator('.counts strong, .counts small').count())
    throw Error('N=1/list must hide both counts');
  await page.getByRole('button', { name: '循环模式：列表循环' }).click();
  await page.getByRole('button', { name: '循环模式：列表播放' }).click();
  if (
    (await page.locator('.counts strong').textContent()) !== '39' ||
    (await page.locator('.counts small').count())
  )
    throw Error('N=1/single-repeat must show current count only');
  await page.getByRole('button', { name: '循环模式：单曲循环' }).click();
  if (await page.locator('.counts strong, .counts small').count())
    throw Error('N=1/play-one must hide both counts');
  const noResets = await page.evaluate(() =>
    window.__UI_TEST_COMMANDS__.every(c => c.type !== 'start'),
  );
  if (!noResets) throw Error('Settings must not create new playback tasks');
  await page.getByRole('button', { name: '任务', exact: true }).click();
  if (await page.locator('.task-card').count() !== 3) throw Error('Missing default tasks');
  if ((await page.locator('.task-card').allTextContents()).join('').includes('大悲咒'))
    throw Error('Task card must omit song title');
  await page.screenshot({ path: 'output/playwright/desktop-tasks-narrow.png', fullPage: true });
  await page.getByRole('button', { name: '＋增加任务' }).click();
  const dialog = page.getByRole('dialog');
  const name = dialog.getByLabel('任务名称', { exact: true });
  await name.fill('桌面任务验证');
  await page.waitForTimeout(800);
  if ((await name.inputValue()) !== '桌面任务验证') throw Error('Polling overwrote task draft');
  if (await name.getAttribute('maxlength') !== '30') throw Error('Task name limit missing');
  await dialog.getByLabel('启动时', { exact: true }).selectOption('23');
  await dialog.getByLabel('启动分', { exact: true }).selectOption('59');
  await dialog.getByLabel('启动秒', { exact: true }).selectOption('59');
  await dialog.getByLabel('歌曲名称').selectOption('a04');
  await dialog.getByLabel('每首重复遍数').fill('1e3');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await dialog.getByRole('alert').filter({ hasText: '正整数' }).waitFor();
  if (await dialog.getByLabel('每首重复遍数').inputValue() !== '1e3')
    throw Error('Invalid numeric syntax was silently accepted on blur');
  await dialog.getByLabel('每首重复遍数').fill('9007199254740992');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await dialog.getByRole('alert').filter({ hasText: '正整数' }).waitFor();
  await dialog.getByLabel('每首重复遍数').fill('5000000');
  await dialog.getByRole('button', { name: '列表循环', exact: true }).click();
  await dialog.getByLabel('同步播放').uncheck();
  const weekdayButtons = dialog.locator('.weekday-options button');
  if (await weekdayButtons.count() !== 7 ||
    await dialog.locator('.weekday-options [aria-pressed=true]').count() !== 7)
    throw Error('New tasks must select every weekday');
  for (const button of await weekdayButtons.all()) await button.click();
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await dialog.getByRole('alert').filter({ hasText: '重复星期' }).waitFor();
  if (await page.locator('.task-card').count() !== 3) throw Error('Empty weekday selection saved');
  await dialog.getByRole('button', { name: '周六', exact: true }).click();
  const sunday = dialog.getByRole('button', { name: '周日', exact: true });
  await sunday.focus();
  await sunday.press('Space');
  await page.waitForTimeout(800);
  if (await sunday.getAttribute('aria-pressed') !== 'true' ||
    await dialog.locator('.weekday-options [aria-pressed=true]').count() !== 2)
    throw Error('Keyboard toggle or weekday draft retention failed');
  await dialog.locator('#task-weekday-help').filter({ hasText: '周末' }).waitFor();
  const weekdayLayout = await dialog.locator('.weekday-options').evaluate(el => {
    const bounds = el.getBoundingClientRect();
    return [...el.querySelectorAll('button')].every(button => {
      const rect = button.getBoundingClientRect();
      return rect.x >= bounds.x && rect.right <= bounds.right + 1 && rect.height >= 44;
    }) && el.scrollWidth <= el.clientWidth;
  });
  if (!weekdayLayout) throw Error('Weekday buttons overflow at minimum window width');
  results.push({ name: 'weekdays', selection: 'weekend', width: 420, keyboard: true, noOverflow: true });
  await page.screenshot({ path: 'output/playwright/desktop-task-editor-narrow.png', fullPage: true });
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  const taskInfo = page.getByRole('button', { name: '修改任务 桌面任务验证' });
  await taskInfo.waitFor();
  if (!(await taskInfo.innerText()).includes('5,000,000')) throw Error('Task count not formatted');
  if (!(await taskInfo.innerText()).includes('周末')) throw Error('Weekday summary not saved');
  await taskInfo.click();
  if (await dialog.locator('.weekday-options [aria-pressed=true]').count() !== 2)
    throw Error('Saved weekdays not restored to editor');
  await page.screenshot({ path: 'output/playwright/desktop-task-editor-narrow.png', fullPage: true });
  await dialog.getByRole('button', { name: '周一', exact: true }).click();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  if (!(await taskInfo.innerText()).includes('周末')) throw Error('Cancel modified saved weekdays');
  if (await page.getByRole('switch', { name: '定时启用 桌面任务验证' }).getAttribute('aria-checked') !== 'false')
    throw Error('New task should be disabled');
  if ((await page.evaluate(() => window.__UI_TEST_STATE__.config.trackId)) !== 'a05')
    throw Error('Saving task changed playback');
  await page.getByRole('button', { name: '立即播放 桌面任务验证' }).click();
  await page.getByRole('heading', { name: '大悲咒（快版）' }).waitFor();
  const applied = await page.evaluate(() => window.__UI_TEST_STATE__.config);
  if (applied.repeatCount !== 5000000 || applied.mode !== 'repeat-all' || applied.sync)
    throw Error('Manual task did not apply all four settings');
  await page.getByRole('button', { name: '任务', exact: true }).click();
  await page.getByRole('switch', { name: '定时启用 桌面任务验证' }).click();
  await taskInfo.click();
  await name.fill('已修改');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  if (await page.getByRole('switch', { name: '定时启用 已修改' }).getAttribute('aria-checked') !== 'true')
    throw Error('Task editing changed enabled state');
  // Exercise error presentation and retained drafts with the same-time weekday boundary.
  await page.getByRole('button', { name: '＋增加任务' }).click();
  await name.fill('同刻星期验证');
  await dialog.getByLabel('启动时', { exact: true }).selectOption('23');
  await dialog.getByLabel('启动分', { exact: true }).selectOption('59');
  await dialog.getByLabel('启动秒', { exact: true }).selectOption('59');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  const otherSwitch = page.getByRole('switch', { name: '定时启用 同刻星期验证' });
  await otherSwitch.click();
  await page.getByRole('alert').filter({ hasText: '星期冲突' }).waitFor();
  if (await otherSwitch.getAttribute('aria-checked') !== 'false')
    throw Error('Conflicting task became enabled');
  const otherInfo = page.getByRole('button', { name: '修改任务 同刻星期验证' });
  await otherInfo.click();
  for (const label of ['周二', '周三', '周四', '周五', '周六', '周日'])
    await dialog.getByRole('button', { name: label, exact: true }).click();
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await otherSwitch.click();
  if (await otherSwitch.getAttribute('aria-checked') !== 'true')
    throw Error('Disjoint weekdays must allow the same clock time');
  await otherInfo.click();
  await dialog.getByRole('button', { name: '周日', exact: true }).click();
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await dialog.getByRole('alert').filter({ hasText: '星期冲突' }).waitFor();
  if (await dialog.getByRole('button', { name: '周日', exact: true }).getAttribute('aria-pressed') !== 'true')
    throw Error('Failed save discarded the weekday draft');
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await otherInfo.click();
  if (await dialog.getByRole('button', { name: '周日', exact: true }).getAttribute('aria-pressed') !== 'false')
    throw Error('Failed save modified the persisted weekday selection');
  await dialog.getByRole('button', { name: '删除任务', exact: true }).click();
  await dialog.getByRole('button', { name: '确认删除', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  results.push({ name: 'weekday-conflicts', enableOverlapRejected: true,
    disjointAllowed: true, editOverlapRejected: true, failedDraftRetained: true });
  await page.setViewportSize({ width: 1120, height: 780 });
  await page.screenshot({ path: 'output/playwright/desktop-tasks-wide.png', fullPage: true });
  await page.getByRole('button', { name: '修改任务 已修改' }).click();
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '修改任务 已修改' }).click();
  await dialog.getByRole('button', { name: '删除任务', exact: true }).click();
  await dialog.getByRole('button', { name: '保留任务', exact: true }).click();
  await dialog.getByRole('button', { name: '删除任务', exact: true }).click();
  await dialog.getByRole('button', { name: '确认删除', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  if (await page.locator('.task-card').count() !== 3) throw Error('Delete did not remove task');
  if (await page.evaluate(() => window.__UI_TEST_STATE__.status) !== 'playing')
    throw Error('Deleting task stopped playback');
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await page.getByText('星光播放器 · v0.1.1', { exact: false }).waitFor();
  const background = page.getByLabel('关闭窗口后留在后台');
  if (!(await background.isChecked())) throw Error('Background must default to enabled');
  await background.uncheck();
  await page.waitForFunction(() =>
    JSON.parse(localStorage.getItem('desktop-ui-test-preferences')).closeToBackground === false);
  await page.reload();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  if (await background.isChecked()) throw Error('Background opt-out must survive reload');
  await background.check();
  await page.waitForFunction(() =>
    JSON.parse(localStorage.getItem('desktop-ui-test-preferences')).closeToBackground === true);
  await page.getByText('播放诊断', { exact: true }).click();
  await page.getByRole('button', { name: '导出诊断文件', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '已导出' }).waitFor();
  await page.getByRole('switch', { name: '关怀模式' }).click();
  if (
    (await page.getByRole('button', { name: '任务', exact: true }).count()) ||
    (await page.getByLabel('每首重复遍数', { exact: true }).count())
  )
    throw Error('Care mode must hide tasks and repeat settings');
  await page.getByRole('navigation').getByRole('button', { name: '播放', exact: true }).click();
  if (
    (await page.locator('.controls button').count()) !== 1 ||
    (await page.locator('.counts strong, .counts small').count()) ||
    !(await page.getByRole('slider').isDisabled())
  )
    throw Error('Care controls mismatch');
  await page.screenshot({ path: 'output/playwright/desktop-care.png', fullPage: true });
  await page.reload();
  await page.locator('.care').waitFor();
  if ((await page.locator('.controls button').count()) !== 1)
    throw Error('Care mode did not persist');
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await page.getByRole('switch', { name: '关怀模式' }).click();
  if (!(await background.isChecked())) throw Error('Background opt-in must survive reload');
  await page.screenshot({ path: 'output/playwright/desktop-profile.png', fullPage: true });
  await page.getByRole('button', { name: '列表', exact: true }).click();
  await page.getByRole('heading', { name: '播放列表' }).waitFor();
  await page.getByRole('heading', { name: '大悲咒系列' }).waitFor();
  await page.getByRole('button', { name: /A04.*大悲咒/ }).click();
  await page.getByRole('heading', { name: '播放列表' }).waitFor();
  await page.screenshot({ path: 'output/playwright/desktop-playlist.png', fullPage: true });
  await page.getByRole('navigation').getByRole('button', { name: '播放', exact: true }).click();
  await page.getByRole('heading', { name: '大悲咒（快版）' }).waitFor();
  // Capture the final mobile-themed wide UI without changing real native state.
  await page.setViewportSize({ width: 1120, height: 780 });
  await page.screenshot({ path: 'output/playwright/desktop-final.png', fullPage: true });
  return { status: 'PASS', scope: 'mock UI only', results };
}
