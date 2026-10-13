import { NativeModules } from 'react-native';
import { addLog } from './logger';

let commandQueue: Promise<void> = Promise.resolve();
let commandSequence = 0;

interface NativePlayerCommandLock {
  acquire(token: string): Promise<void>;
  renew?(token: string): void;
  release(token: string): void;
}

const nativeCommandLock = NativeModules.PlayerCommandLock as NativePlayerCommandLock | undefined;

/**
 * JS Promise 链保证单 runtime 顺序，原生进程锁保证 UI/Service 双 runtime 互斥。
 * 多步换曲另由 storage 中的 pending token 防止过期操作提交状态。
 */
export function enqueuePlayerCommand<T>(label: string, operation: () => Promise<T>): Promise<T> {
  const sequence = ++commandSequence;
  const execute = async () => {
    const lockToken = `${Date.now()}-${Math.random()}-${sequence}`;
    let leaseHeartbeat: ReturnType<typeof setInterval> | null = null;
    addLog('INFO', `PlayerCommand#${sequence} start: ${label}`);
    try {
      if (!nativeCommandLock?.acquire) {
        throw new Error('PlayerCommandLock native module is unavailable');
      }
      await nativeCommandLock.acquire(lockToken);
      if (nativeCommandLock.renew) {
        leaseHeartbeat = setInterval(() => nativeCommandLock.renew?.(lockToken), 10_000);
      }
      const result = await operation();
      addLog('INFO', `PlayerCommand#${sequence} done: ${label}`);
      return result;
    } catch (error) {
      addLog('ERROR', `PlayerCommand#${sequence} failed: ${label}`, error);
      throw error;
    } finally {
      if (leaseHeartbeat) clearInterval(leaseHeartbeat);
      nativeCommandLock?.release(lockToken);
    }
  };

  const result = commandQueue.then(execute, execute);
  commandQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
