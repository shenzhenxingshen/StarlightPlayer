// 最小可用的 react-native-track-player mock
const noop = jest.fn(() => {});

const handlers = new Map();

const TrackPlayer = {
  setupPlayer: jest.fn(async () => {}),
  updateOptions: jest.fn(async () => {}),
  add: jest.fn(async () => {}),
  remove: jest.fn(async () => {}),
  reset: jest.fn(async () => {}),
  play: jest.fn(async () => {}),
  pause: jest.fn(async () => {}),
  stop: jest.fn(async () => {}),
  seekTo: jest.fn(async () => {}),
  retry: jest.fn(async () => {}),
  setRepeatMode: jest.fn(async () => {}),
  getPlaybackState: jest.fn(async () => ({ state: 'paused' })),
  getProgress: jest.fn(async () => ({ position: 0, duration: 0, buffered: 0 })),
  getActiveTrack: jest.fn(async () => undefined),
  registerPlaybackService: noop,
  addEventListener: jest.fn((event, cb) => {
    handlers.set(event, cb);
    return { remove: () => handlers.delete(event) };
  }),
  // 测试辅助：手动触发事件
  __emit: (event, payload) => {
    const cb = handlers.get(event);
    if (cb) return cb(payload);
  },
  __reset: () => handlers.clear(),
};

const Capability = {
  Play: 'play',
  Pause: 'pause',
  SkipToNext: 'next',
  SkipToPrevious: 'prev',
  SeekTo: 'seek',
  Stop: 'stop',
};

const State = {
  Ready: 'ready',
  Playing: 'playing',
  Paused: 'paused',
  Stopped: 'stopped',
  Loading: 'loading',
  Buffering: 'buffering',
  Error: 'error',
  Ended: 'ended',
  None: 'none',
};

const RepeatMode = { Off: 0, Track: 1, Queue: 2 };

const Event = {
  RemotePlay: 'remote-play',
  RemotePause: 'remote-pause',
  RemoteNext: 'remote-next',
  RemotePrevious: 'remote-previous',
  RemoteStop: 'remote-stop',
  RemoteSeek: 'remote-seek',
  RemoteDuck: 'remote-duck',
  PlaybackActiveTrackChanged: 'playback-active-track-changed',
  PlaybackQueueEnded: 'playback-queue-ended',
  PlaybackError: 'playback-error',
  PlayerError: 'player-error',
  PlaybackState: 'playback-state',
};

const AppKilledPlaybackBehavior = {
  ContinuePlayback: 'continue-playback',
  PausePlayback: 'pause-playback',
  StopPlaybackAndRemoveNotification: 'stop-playback-and-remove-notification',
};

module.exports = TrackPlayer;
module.exports.default = TrackPlayer;
module.exports.Capability = Capability;
module.exports.State = State;
module.exports.RepeatMode = RepeatMode;
module.exports.Event = Event;
module.exports.AppKilledPlaybackBehavior = AppKilledPlaybackBehavior;
module.exports.usePlaybackState = () => ({ state: State.Paused });
module.exports.useProgress = () => ({ position: 0, duration: 0, buffered: 0 });
module.exports.useActiveTrack = () => null;
