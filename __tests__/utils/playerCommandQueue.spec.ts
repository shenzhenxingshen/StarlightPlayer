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
});
