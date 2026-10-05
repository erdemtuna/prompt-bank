// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyFavorite, emptyFavoriteSnapshot, type PromptReference } from './favorites';
import { browserFavoritesStorage, FAVORITES_STORAGE_KEY } from './favoritesStorage';

const reference: PromptReference = { source: 'builtin', workspaceId: null, promptId: 'test' };
const lockRequests = vi.fn();
const locks: Pick<LockManager, 'request'> = {
  async request<T>(
    name: string,
    options: LockOptions | LockGrantedCallback<T>,
    callback?: LockGrantedCallback<T>
  ): Promise<Awaited<T>> {
    lockRequests(name, options, callback);
    const granted = typeof options === 'function' ? options : callback;
    if (!granted) throw new Error('Missing lock callback');
    return await granted({ name, mode: 'exclusive' });
  }
};

function adapter(lockManager: Pick<LockManager, 'request'> | undefined = locks) {
  return browserFavoritesStorage({ storage: () => localStorage, locks: () => lockManager, target: window });
}

beforeEach(() => { localStorage.clear(); lockRequests.mockClear(); });

describe('browser favorites storage', () => {
  it('roundtrips builtin-only references through a coordinated transaction', async () => {
    const storage = adapter();
    expect(await storage.read()).toEqual(emptyFavoriteSnapshot());
    const snapshot = await storage.set({ reference, favorite: true });
    expect(snapshot.favorites).toEqual([reference]);
    expect(lockRequests).toHaveBeenCalledWith(FAVORITES_STORAGE_KEY, { ifAvailable: true }, expect.any(Function));
    expect(await adapter().read()).toEqual(snapshot);
    expect(await storage.set({ reference, favorite: true })).toEqual(snapshot);
    expect((await storage.set({ reference, favorite: false })).favorites).toEqual([]);
  });

  it('does not overwrite corrupt or unsupported existing data', async () => {
    for (const raw of ['', '{bad', '{"version":2,"future":true}', '{"version":1,"favorites":[],"inputs":"private"}']) {
      localStorage.setItem(FAVORITES_STORAGE_KEY, raw);
      await expect(adapter().set({ reference, favorite: true })).rejects.toBeDefined();
      expect(localStorage.getItem(FAVORITES_STORAGE_KEY)).toBe(raw);
    }
  });

  it('rejects private references even if the storage payload is otherwise valid', async () => {
    const global: PromptReference = { ...reference, source: 'global' };
    await expect(adapter().set({ reference: global, favorite: true })).rejects.toMatchObject({ kind: 'invalid_favorite' });
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(applyFavorite(emptyFavoriteSnapshot(), { reference: global, favorite: true })));
    await expect(adapter().read()).rejects.toMatchObject({ kind: 'invalid_favorite' });
  });

  it('reports unavailable locks without pretending a durable write succeeded', async () => {
    const storage = browserFavoritesStorage({ storage: () => localStorage, locks: () => undefined, target: window });
    await expect(storage.set({ reference, favorite: true })).rejects.toMatchObject({ kind: 'favorites_unavailable' });
    expect(localStorage.getItem(FAVORITES_STORAGE_KEY)).toBeNull();
  });

  it('surfaces storage-access and quota errors with safe messages', async () => {
    const denied = browserFavoritesStorage({
      storage: () => { throw new DOMException('private location', 'SecurityError'); },
      locks: () => locks, target: window
    });
    await expect(denied.read()).rejects.toMatchObject({ message: 'Favorites could not be loaded.' });
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    await expect(adapter().set({ reference, favorite: true })).rejects.toMatchObject({ kind: 'favorites_too_large' });
    spy.mockRestore();
  });

  it('listens only for relevant external storage changes and unsubscribes', () => {
    const changed = vi.fn();
    const unsubscribe = adapter().subscribe?.(changed);
    window.dispatchEvent(new StorageEvent('storage', { key: 'other' }));
    expect(changed).not.toHaveBeenCalled();
    window.dispatchEvent(new StorageEvent('storage', { key: FAVORITES_STORAGE_KEY }));
    expect(changed).toHaveBeenCalledOnce();
    unsubscribe?.();
    window.dispatchEvent(new StorageEvent('storage', { key: FAVORITES_STORAGE_KEY }));
    expect(changed).toHaveBeenCalledOnce();
  });
});
