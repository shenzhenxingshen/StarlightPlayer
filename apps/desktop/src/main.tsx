import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import type { Command, Mode, State, Track } from '../../../packages/playback-core/src';
import { displayedCount, MODES } from '../../../packages/playback-core/src';
import * as colors from '../../../src/constants/colors';
import { SECTIONS } from '../../../src/constants/tracks';
import { formatRepeatCount as format } from '../../../src/utils/numberFormat';
import './style.css';
import { TaskPanel, type TaskCommand } from './tasks';
import type { ScheduledTask } from '../../../packages/playback-core/src';
import { version as desktopVersion } from '../package.json';
import { productName as appName } from '../src-tauri/tauri.conf.json';

type DesktopCommand =
  | Command
  | TaskCommand
  | { type: 'next' | 'previous' | 'export-diagnostics' }
  | { type: 'preferences'; careMode: boolean; closeToBackground: boolean };
type Snapshot = {
  state: State;
  tracks: Track[];
  engine: string;
  tasks?: ScheduledTask[];
  preferences?: { careMode: boolean; closeToBackground: boolean; initialized: boolean };
  recentLogs?: unknown[];
  platform?: string;
  dayKey?: string;
  recovering?: boolean;
};
type Tab = '播放' | '列表' | '任务' | '我的';
type IconName =
  | 'play'
  | 'pause'
  | 'previous'
  | 'next'
  | 'single'
  | 'repeat'
  | 'list'
  | 'sync'
  | 'solo'
  | 'clock'
  | 'profile';
const MODE_LABEL: Record<Mode, string> = {
  'repeat-one': '单曲循环',
  'play-one': '单曲播放',
  'repeat-all': '列表循环',
  'play-all': '列表播放',
};
const CARE_KEY = 'starlight.desktop.care.v1';
// Palette and number formatting are imported from mobile, not approximate copies.
const theme = Object.fromEntries(
  Object.entries(colors).map(([key, value]) => [
    `--${key.toLowerCase().replaceAll('_', '-')}`,
    value,
  ]),
) as React.CSSProperties;
const time = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

function Icon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round">
      {name === 'play' && <path d="M8 4.5 19 12 8 19.5Z" fill="currentColor" stroke="none" />}
      {name === 'pause' && (
        <>
          <path d="M8 5v14M16 5v14" strokeWidth="4" />
        </>
      )}
      {name === 'previous' && (
        <>
          <path d="M6 5v14M18 5l-10 7 10 7Z" />
        </>
      )}
      {name === 'next' && (
        <>
          <path d="M18 5v14M6 5l10 7-10 7Z" />
        </>
      )}
      {name === 'single' && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="m11 8 2-1v10m-2 0h4" />
        </>
      )}
      {name === 'repeat' && (
        <>
          <path d="m17 2 4 4-4 4M21 6H7a4 4 0 0 0-4 4m4 12-4-4 4-4m-4 4h14a4 4 0 0 0 4-4" />
        </>
      )}
      {name === 'list' && (
        <>
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
        </>
      )}
      {(name === 'solo' || name === 'sync' || name === 'profile') && (
        <>
          <circle cx={name === 'sync' ? 9 : 12} cy="7" r="3" />
          <path
            d={
              name === 'sync'
                ? 'M2 21v-3a7 7 0 0 1 14 0v3M17 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v3'
                : 'M5 21v-3a7 7 0 0 1 14 0v3'
            }
          />
        </>
      )}
      {name === 'clock' && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 6v6l4 2" />
        </>
      )}
    </svg>
  );
}

function SeekBar({
  positionMs,
  durationMs,
  disabled,
  onSeek,
}: {
  positionMs: number;
  durationMs: number;
  disabled: boolean;
  onSeek: (position: number) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const pending = useRef<number | null>(null);
  const value = draft ?? Math.min(durationMs, positionMs);
  useEffect(() => {
    if (disabled) {
      pending.current = null;
      setDraft(null);
    }
  }, [disabled]);
  function commit() {
    const next = pending.current;
    if (disabled || next === null) return;
    pending.current = null;
    void onSeek(next).finally(() => setDraft(null));
  }
  return (
    <input
      aria-label="播放进度"
      aria-valuetext={`${time(value)} / ${time(durationMs)}`}
      type="range"
      min="0"
      max={durationMs}
      step="100"
      value={value}
      disabled={disabled}
      onChange={e => {
        pending.current = Number(e.target.value);
        setDraft(pending.current);
      }}
      onPointerDown={e => e.currentTarget.setPointerCapture(e.pointerId)}
      onPointerUp={commit}
      onPointerCancel={() => {
        pending.current = null;
        setDraft(null);
      }}
      onKeyUp={e => {
        if (
          [
            'ArrowLeft',
            'ArrowRight',
            'ArrowUp',
            'ArrowDown',
            'Home',
            'End',
            'PageUp',
            'PageDown',
          ].includes(e.key)
        )
          commit();
      }}
      onBlur={commit}
    />
  );
}

function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [tab, setTab] = useState<Tab>('播放');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [repeatDraft, setRepeatDraft] = useState('');
  const [exportPath, setExportPath] = useState('');
  const [care, setCare] = useState(() => {
    try {
      return localStorage.getItem(CARE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const busyRef = useRef(false);
  const revision = useRef(0);
  const preferenceMigration = useRef(false);
  useEffect(() => {
    let active = true;
    let polling = false;
    const refresh = async () => {
      if (busyRef.current || polling) return;
      polling = true;
      const version = revision.current;
      try {
        const value = await invoke<Snapshot>('snapshot');
        if (active && version === revision.current) setSnapshot(value);
      } catch {
        if (active) setError('无法连接桌面播放服务。请通过桌面应用启动；浏览器预览没有音频引擎。');
      } finally {
        polling = false;
      }
    };
    void refresh();
    const timer = setInterval(refresh, 250);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 1800);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const prefs = snapshot?.preferences;
    if (!prefs) return;
    if (prefs.initialized) setCare(prefs.careMode);
    else if (!preferenceMigration.current) {
      preferenceMigration.current = true;
      // Migrate the preview's earlier WebView-only preference once.
      void send({
        type: 'preferences',
        careMode: care,
        closeToBackground: prefs.closeToBackground,
      });
    }
  }, [snapshot?.preferences?.initialized, snapshot?.preferences?.careMode]);

  async function send(command: DesktopCommand): Promise<boolean> {
    if (busyRef.current) return false;
    busyRef.current = true;
    revision.current += 1;
    setBusy(true);
    setError('');
    try {
      const result = await invoke<{ path?: string }>('control', { command });
      if (command.type === 'export-diagnostics' && result.path) setExportPath(result.path);
      setSnapshot(await invoke<Snapshot>('snapshot'));
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const configure = (settings: Extract<Command, { type: 'configure' }>['settings']) =>
    send({ type: 'configure', settings });
  const state = snapshot?.state;
  const config = state?.config;
  const track = snapshot?.tracks.find(t => t.id === config?.trackId);
  const playing = state?.status === 'playing';
  const loading = state?.status === 'loading';
  const canPause = playing || loading || !!snapshot?.recovering;
  const showCount = !care && !!config && (config.repeatCount > 1 || config.mode === 'repeat-one');
  const showRepeat = !care && !!config && config.repeatCount > 1;

  function selectTab(next: Tab) {
    if (next === '我的' && config) setRepeatDraft(format(config.repeatCount));
    setTab(next);
    setError('');
  }
  async function toggleCare() {
    const next = !care;
    if (
      !(await send({
        type: 'preferences',
        careMode: next,
        closeToBackground: snapshot?.preferences?.closeToBackground ?? true,
      }))
    )
      return;
    setCare(next);
    try {
      localStorage.setItem(CARE_KEY, String(next));
    } catch {
      setError('本机无法保存关怀模式偏好，重新打开后可能恢复默认。');
    }
    if (next && tab === '任务') setTab('播放');
  }
  async function applyRepeat(raw = repeatDraft) {
    const cleaned = raw.replace(/,/g, '').trim();
    const value = Number(cleaned);
    if (!/^\d+$/.test(cleaned) || !Number.isSafeInteger(value) || value < 1) {
      setError('请输入有效的正整数（不超过 9,007,199,254,740,991）。');
      return;
    }
    if (await configure({ repeatCount: value })) {
      setRepeatDraft(format(value));
      setNotice('每首重复遍数已更新');
    }
  }
  function adjacent(offset: number) {
    void send({ type: offset > 0 ? 'next' : 'previous' });
  }
  async function nextMode() {
    if (!config) return;
    const mode = MODES[(MODES.indexOf(config.mode) + 1) % MODES.length];
    if (await configure({ mode })) setNotice(MODE_LABEL[mode]);
  }

  return (
    <div className={`app${care ? ' care' : ''}`} style={theme}>
      <header className="app-header">
        <span>{appName}</span>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="notice" role="status">
        {notice}
      </div>
      {!state || !config || !track ? (
        <main className="empty">
          <h1>正在连接播放服务</h1>
          <p>首次启动正在校验本地音频。</p>
        </main>
      ) : (
        <>
          {tab === '播放' && (
            <main className="player">
              <header className="track-heading">
                <p>{track.code}</p>
                <h1>{track.title}</h1>
                <span className="state-caption">
                  {state.status === 'complete'
                    ? '播放任务已完成'
                    : snapshot.recovering
                      ? '播放中断，正在尝试恢复…'
                      : state.status === 'error'
                        ? '播放出错，请重试'
                        : loading
                          ? '正在加载…'
                          : '\u00a0'}
                </span>
              </header>
              <div className="stage">
                <div className="controls" aria-label="播放控制">
                  {!care && (
                    <>
                      <button
                        disabled={busy}
                        onClick={() => void nextMode()}
                        aria-label={`循环模式：${MODE_LABEL[config.mode]}`}
                        title={MODE_LABEL[config.mode]}>
                        <Icon
                          name={
                            config.mode === 'play-one'
                              ? 'single'
                              : config.mode === 'play-all'
                                ? 'list'
                                : 'repeat'
                          }
                        />
                        <span>{MODE_LABEL[config.mode]}</span>
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => adjacent(-1)}
                        aria-label="上一首"
                        title="上一首">
                        <Icon name="previous" />
                      </button>
                    </>
                  )}
                  <button
                    className="play"
                    disabled={busy}
                    aria-label={canPause ? '暂停' : '播放'}
                    onClick={() => void send({ type: canPause ? 'pause' : 'play' })}>
                    <Icon name={canPause ? 'pause' : 'play'} />
                  </button>
                  {!care && (
                    <>
                      <button
                        disabled={busy}
                        onClick={() => adjacent(1)}
                        aria-label="下一首"
                        title="下一首">
                        <Icon name="next" />
                      </button>
                      <button
                        className={config.sync ? 'active' : ''}
                        disabled={busy}
                        aria-label="同步播放"
                        aria-pressed={config.sync}
                        title={config.sync ? '关闭同步播放' : '开启同步播放'}
                        onClick={async () => {
                          if (await configure({ sync: !config.sync }))
                            setNotice(config.sync ? '已关闭同步播放' : '已开启同步播放');
                        }}>
                        <Icon name={config.sync ? 'sync' : 'solo'} />
                        <span>{config.sync ? '同步' : '不同步'}</span>
                      </button>
                    </>
                  )}
                </div>
                <div className={`record${playing ? ' spinning' : ''}`} aria-hidden="true">
                  <div className="record-label">
                    <i />
                  </div>
                </div>
                <div className="timeline">
                  <div className="counts">
                    {showCount && (
                      <strong aria-label={`当前遍数 ${format(displayedCount(state))}`}>
                        {format(displayedCount(state))}
                      </strong>
                    )}
                    {showRepeat && (
                      <small aria-label={`每首重复遍数 ${format(config.repeatCount)}`}>
                        {format(config.repeatCount)}
                      </small>
                    )}
                  </div>
                  <div className="rail">
                    <time className="elapsed">{time(state.positionMs)}</time>
                    <SeekBar
                      key={`${track.id}-${state.generation}`}
                      positionMs={state.positionMs}
                      durationMs={track.durationMs}
                      disabled={
                        busy || care || config.sync || !['playing', 'paused'].includes(state.status)
                      }
                      onSeek={positionMs => send({ type: 'seek', positionMs })}
                    />
                    <time className="duration">{time(track.durationMs)}</time>
                  </div>
                </div>
              </div>
              {care && <p className="player-hint">关怀模式</p>}
            </main>
          )}
          {tab === '列表' && (
            <main className="page playlist">
              <h1>播放列表</h1>
              <p className="muted">选择曲目开始新的播放任务，当前遍数从头计算。</p>
              {SECTIONS.map(section => (
                <section
                  className="track-section"
                  key={section.code}
                  style={
                    {
                      '--section-color': colors[`SECTION_${section.code}` as keyof typeof colors],
                    } as React.CSSProperties
                  }>
                  <h2>{section.name}</h2>
                  <div className="track-list">
                    {snapshot.tracks
                      .filter(t => t.code.startsWith(section.code))
                      .map(t => (
                        <button
                          key={t.id}
                          className={t.id === track.id ? 'selected' : ''}
                          disabled={busy}
                          aria-label={`${t.code} ${t.title}`}
                          aria-current={t.id === track.id ? 'true' : undefined}
                          onClick={() =>
                            void send({ type: 'start', config: { ...config, trackId: t.id } })
                          }>
                          <span className="track-code">{t.code}</span>
                          <span>{t.title}</span>
                          <time>{time(t.durationMs)}</time>
                          <span className="track-indicator">{t.id === track.id ? '♪' : '›'}</span>
                        </button>
                      ))}
                  </div>
                </section>
              ))}
            </main>
          )}
          {tab === '任务' && (
            <TaskPanel
              tasks={snapshot.tasks ?? []}
              tracks={snapshot.tracks}
              busy={busy}
              error={error}
              send={send}
              onPlaying={() => setTab('播放')}
            />
          )}
          {tab === '我的' && (
            <main className="page profile">
              <h1>我的</h1>
              <section className="card care-setting">
                <div>
                  <h2>关怀模式</h2>
                  <p>更大字体、更简洁的播放操作</p>
                </div>
                <button
                  role="switch"
                  aria-checked={care}
                  aria-label="关怀模式"
                  className={`switch${care ? ' on' : ''}`}
                  disabled={busy}
                  onClick={() => void toggleCare()}>
                  <i />
                </button>
              </section>
              {!care && (
                <>
                  <section className="card">
                    <h2>每首重复遍数</h2>
                    <div className="presets">
                      {[1, 108, 1000, 10000].map(value => (
                        <button
                          key={value}
                          disabled={busy}
                          className={config.repeatCount === value ? 'selected' : ''}
                          onClick={() => void applyRepeat(String(value))}>
                          {format(value)}
                        </button>
                      ))}
                    </div>
                    <form
                      onSubmit={e => {
                        e.preventDefault();
                        void applyRepeat();
                      }}
                      className="repeat-form">
                      <label htmlFor="repeat-count">自定义遍数</label>
                      <div>
                        <input
                          id="repeat-count"
                          aria-label="每首重复遍数"
                          type="text"
                          inputMode="numeric"
                          value={repeatDraft}
                          onChange={e => setRepeatDraft(e.target.value)}
                          onBlur={() => {
                            const value = Number(repeatDraft.replace(/,/g, '').trim());
                            if (
                              /^[\d,]+$/.test(repeatDraft) &&
                              Number.isSafeInteger(value) &&
                              value > 0
                            )
                              setRepeatDraft(format(value));
                          }}
                        />
                        <button className="primary" disabled={busy} type="submit">
                          确定
                        </button>
                      </div>
                    </form>
                    <p className="muted">设置立即生效，不清空当前计数；本遍结束后按新设置判断。</p>
                  </section>
                  <section className="card">
                    <h2>后台运行</h2>
                    <label className="background-setting">
                      <input
                        type="checkbox"
                        aria-label="关闭窗口后留在后台"
                        checked={snapshot.preferences?.closeToBackground ?? true}
                        disabled={busy}
                        onChange={e =>
                          void send({
                            type: 'preferences',
                            careMode: care,
                            closeToBackground: e.target.checked,
                          })
                        }
                      />
                      关闭窗口后留在后台
                    </label>
                    <p>
                      开启后，关窗口只隐藏界面，播放和定时继续。可从系统托盘/菜单栏重新打开；
                      选择“退出”才完全停止。电脑睡眠或关机时不能播放。
                    </p>
                  </section>
                  <section className="card">
                    <details>
                      <summary>播放诊断</summary>
                      <dl>
                        <dt>音频引擎</dt>
                        <dd>{snapshot.engine}</dd>
                        <dt>运行平台</dt>
                        <dd>{snapshot.platform ?? '桌面预览'}</dd>
                        <dt>播放状态</dt>
                        <dd>{state.status}</dd>
                        <dt>已完成遍数</dt>
                        <dd>{format(state.completedCount)}</dd>
                        <dt>本遍计数资格</dt>
                        <dd>{state.eligible ? '有效' : '不计入'}</dd>
                        <dt>循环模式</dt>
                        <dd>{MODE_LABEL[config.mode]}</dd>
                        <dt>同步播放</dt>
                        <dd>{config.sync ? '开启' : '关闭'}</dd>
                        <dt>播放代次</dt>
                        <dd>{state.generation}</dd>
                      </dl>
                      <h3>今日有效完整播放</h3>
                      <p className="muted">
                        {snapshot.dayKey} · 仅统计有效完整周期，不含同步跳入的无效尾段。
                      </p>
                      <dl>
                        {Object.entries(state.dailyStats?.[snapshot.dayKey ?? ''] ?? {}).map(
                          ([id, n]) => (
                            <React.Fragment key={id}>
                              <dt>{snapshot.tracks.find(t => t.id === id)?.code ?? id}</dt>
                              <dd>{format(n)} 遍</dd>
                            </React.Fragment>
                          ),
                        )}
                      </dl>
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() => void send({ type: 'export-diagnostics' })}>
                        导出诊断文件
                      </button>
                      <p className="muted">
                        导出当前状态、任务配置和保留的完整日志。可能含任务名称和本机时间，
                        分享前请检查。日志自动轮转，不使用截断的剪贴板文本。
                      </p>
                      {exportPath && (
                        <p className="export-path" role="status">
                          已导出：{exportPath}
                        </p>
                      )}
                      <h3>最近 30 条日志</h3>
                      <pre className="diagnostic-log">
                        {(snapshot.recentLogs ?? []).map(log => JSON.stringify(log)).join('\n')}
                      </pre>
                    </details>
                  </section>
                </>
              )}
              <p className="about">
                {appName} · v{desktopVersion}
                <br />
                播放器最小化后仍可播放；关闭行为可在后台运行设置中选择。
                <br />
                电脑睡眠、关机或完全退出后不能定时播放。
              </p>
            </main>
          )}
        </>
      )}
      <nav className="tabs" aria-label="主导航">
        {(['播放', '列表', '任务', '我的'] as Tab[])
          .filter(t => !care || t !== '任务')
          .map(t => (
            <button
              key={t}
              aria-current={tab === t ? 'page' : undefined}
              onClick={() => selectTab(t)}>
              <Icon
                name={
                  t === '播放' ? 'play' : t === '列表' ? 'list' : t === '任务' ? 'clock' : 'profile'
                }
              />
              <span>{t}</span>
            </button>
          ))}
      </nav>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
