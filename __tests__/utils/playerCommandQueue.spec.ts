import { NativeModules } from 'react-native';
import { enqueuePlayerCommand } from '@/utils/playerCommandQueue';

describe('playerCommandQueue · 串行化与容错', () => {
  const nativeLock = NativeModules.PlayerCommandLock as {
    acquire: jest.Mock;
    renew: jest.Mock;
    release: jest.Mock;
  };

  beforeEach(() => {
    nativeLock.acquire.mockResolvedValue(undefined);
  });

  it('后入队的 TrackPlayer 操作必须等待前一个操作结束', async () => {
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>(resolve => {
      releaseFirst = resolve;
    });

    const first = enqueuePlayerCommand('first', async () => {
      order.push('first:start');
      await firstGate;
      order.push('first:end');
      return 1;
    });
    const second = enqueuePlayerCommand('second', async () => {
      order.push('second:start');
      return 2;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(['first:start']);

    releaseFirst();
    await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
    expect(order).toEqual(['first:start', 'first:end', 'second:start']);
    expect(nativeLock.acquire).toHaveBeenCalledTimes(2);
    expect(nativeLock.release).toHaveBeenCalledTimes(2);
  });

  it('一个命令失败不会毒化队列，后续命令仍可执行', async () => {
    await expect(
      enqueuePlayerCommand('failure', async () => {
        throw new Error('expected failure');
      }),
    ).rejects.toThrow('expected failure');

    await expect(enqueuePlayerCommand('after-failure', async () => 'ok')).resolves.toBe('ok');
  });

  it('原生锁缺失时明确失败，且不会执行播放器操作', async () => {
    const acquire = nativeLock.acquire;
    const operation = jest.fn(async () => 'unexpected');
    (nativeLock as any).acquire = undefined;
    try {
      await expect(enqueuePlayerCommand('missing-lock', operation)).rejects.toThrow(
        'PlayerCommandLock native module is unavailable',
      );
      expect(operation).not.toHaveBeenCalled();
    } finally {
      (nativeLock as any).acquire = acquire;
    }
  });

  it('长命令定期续租，结束后立即停止心跳并释放锁', async () => {
    jest.useFakeTimers();
    let finish!: () => void;
    const gate = new Promise<void>(resolve => {
      finish = resolve;
    });
    try {
      const command = enqueuePlayerCommand('long-running', async () => {
        await gate;
        return 42;
      });
      await Promise.resolve();
      await Promise.resolve();

      jest.advanceTimersByTime(10_000);
      expect(nativeLock.renew).toHaveBeenCalledTimes(1);

      finish();
      await expect(command).resolves.toBe(42);
      expect(nativeLock.release).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(30_000);
      expect(nativeLock.renew).toHaveBeenCalledTimes(1);
    } finally {
      finish();
      jest.useRealTimers();
    }
  });

  it('不支持 renew 的旧原生模块仍可执行并释放', async () => {
    const renew = nativeLock.renew;
    (nativeLock as any).renew = undefined;
    try {
      await expect(enqueuePlayerCommand('legacy-lock', async () => 'ok')).resolves.toBe('ok');
      expect(nativeLock.release).toHaveBeenCalledTimes(1);
    } finally {
      (nativeLock as any).renew = renew;
    }
  });
});
