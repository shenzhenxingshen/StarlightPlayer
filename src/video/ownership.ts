import { DeviceEventEmitter, NativeModules } from 'react-native';
import { MMKV } from 'react-native-mmkv';

const storage = new MMKV();
const OWNER = 'media_owner_v1';
export const MEDIA_OWNER_CHANGED = 'StarlightMediaOwnerChanged';
export const isVideoOwner = (): boolean => storage.getString(OWNER) === 'video';

export function setMediaOwner(owner: 'audio' | 'video'): void {
  storage.set(OWNER, owner);
  DeviceEventEmitter.emit(MEDIA_OWNER_CHANGED, owner);
}

/** Call only inside the process-wide player command lock. No imports from audio/video stores. */
export async function claimAudioInCommand(): Promise<void> {
  if (!isVideoOwner()) return;
  await NativeModules.VideoProgramPlayer?.stop();
  setMediaOwner('audio');
}
