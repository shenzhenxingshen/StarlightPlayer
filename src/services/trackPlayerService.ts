import TrackPlayer, { Event, State } from 'react-native-track-player';

class TrackPlayerService {
  async setup(): Promise<void> {
    await TrackPlayer.setupPlayer({
      minBuffer: 15,
      maxBuffer: 50,
      playBuffer: 2.5,
      backBuffer: 1,
    });
  }

  async add(track: any): Promise<void> {
    await TrackPlayer.add(track);
  }

  async addPlaylist(tracks: any[]): Promise<void> {
    await TrackPlayer.reset();
    await TrackPlayer.add(tracks);
  }

  async reset(): Promise<void> {
    await TrackPlayer.reset();
  }

  async play(): Promise<void> {
    await TrackPlayer.play();
  }

  async pause(): Promise<void> {
    await TrackPlayer.pause();
  }

  async stop(): Promise<void> {
    await TrackPlayer.stop();
  }

  async seekTo(position: number): Promise<void> {
    await TrackPlayer.seekTo(position);
  }

  async skipToNext(): Promise<void> {
    await TrackPlayer.skipToNext();
  }

  async skipToPrevious(): Promise<void> {
    await TrackPlayer.skipToPrevious();
  }

  async skip(index: number): Promise<void> {
    await TrackPlayer.skip(index);
  }

  async getCurrentTrack(): Promise<any> {
    const track = await TrackPlayer.getCurrentTrack();
    return track;
  }

  async getPosition(): Promise<number> {
    return await TrackPlayer.getPosition();
  }

  async getDuration(): Promise<number> {
    return await TrackPlayer.getDuration();
  }

  async getState(): Promise<State> {
    return await TrackPlayer.getState();
  }

  setupEventHandlers(handlers: {
    onPlaybackStateChange?: (state: State) => void;
    onPlaybackProgressUpdate?: (position: number) => void;
    onTrackChange?: (track: any) => void;
  }): void {
    TrackPlayer.addEventListener(Event.PlaybackState, (event) => {
      handlers.onPlaybackStateChange?.(event.state);
    });

    TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, (event) => {
      handlers.onPlaybackProgressUpdate?.(event.position);
    });

    TrackPlayer.addEventListener(Event.PlaybackTrackChanged, (event) => {
      handlers.onTrackChange?.(event.track);
    });

    // 远程控制事件
    TrackPlayer.addEventListener(Event.RemotePlay, () => {
      this.play();
    });

    TrackPlayer.addEventListener(Event.RemotePause, () => {
      this.pause();
    });

    TrackPlayer.addEventListener(Event.RemoteNext, () => {
      this.skipToNext();
    });

    TrackPlayer.addEventListener(Event.RemotePrevious, () => {
      this.skipToPrevious();
    });

    TrackPlayer.addEventListener(Event.RemoteSeek, (event) => {
      this.seekTo(event.position);
    });
  }
}

export default new TrackPlayerService();