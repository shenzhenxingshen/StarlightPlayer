import {
  getCurrentIndex,
  setCurrentIndex,
  getNextIndex,
  getPrevIndex,
  isLastTrack,
} from '@/utils/trackManager';
import { TRACKS } from '@/constants/tracks';

describe('trackManager · 索引边界', () => {
  beforeEach(() => {
    setCurrentIndex(0);
  });

  it('setCurrentIndex 越界会被夹紧', () => {
    setCurrentIndex(-1);
    expect(getCurrentIndex()).toBe(0);
    setCurrentIndex(TRACKS.length + 5);
    expect(getCurrentIndex()).toBe(TRACKS.length - 1);
  });

  it('getNextIndex 末尾回绕到 0', () => {
    setCurrentIndex(TRACKS.length - 1);
    expect(getNextIndex()).toBe(0);
  });

  it('getPrevIndex 开头回绕到末尾', () => {
    setCurrentIndex(0);
    expect(getPrevIndex()).toBe(TRACKS.length - 1);
  });

  it('isLastTrack 末尾时为 true', () => {
    setCurrentIndex(TRACKS.length - 1);
    expect(isLastTrack()).toBe(true);
    setCurrentIndex(0);
    expect(isLastTrack()).toBe(false);
  });
});
