export interface LyricLine {
  time: number;
  text: string;
}

export interface Track {
  id: string;
  code: string;
  title: string;
  subtitle: string;
  section: string;
  imageUrl: string;
  audioUrl: string;
  durationMs?: number;
  lyrics?: LyricLine[];
}

export interface PlayerState {
  state: 'idle' | 'playing' | 'paused' | 'stopped';
  currentTrack: Track | null;
  position: number;
  duration: number;
}

export interface PlaybackStats {
  [trackId: string]: number;
}

export interface AppSettings {
  isLargeTextMode: boolean;
}