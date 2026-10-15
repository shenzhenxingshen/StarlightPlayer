import { PlayMode } from './storage';

export interface RepeatDisplayVisibility {
  showCurrentRepeat: boolean;
  showTotalRepeat: boolean;
}

export function getRepeatDisplayVisibility(
  repeatCount: number,
  playMode: PlayMode,
  isCareMode: boolean,
): RepeatDisplayVisibility {
  if (isCareMode) return { showCurrentRepeat: false, showTotalRepeat: false };
  if (repeatCount > 1) return { showCurrentRepeat: true, showTotalRepeat: true };
  if (playMode === 'repeat-one') return { showCurrentRepeat: true, showTotalRepeat: false };
  return { showCurrentRepeat: false, showTotalRepeat: false };
}
