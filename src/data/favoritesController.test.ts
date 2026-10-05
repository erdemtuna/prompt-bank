import { describe, expect, it, vi } from 'vitest';
import { applyFavorite, emptyFavoriteSnapshot, favoriteKey, type FavoriteSnapshot, type PromptReference } from './favorites';
import { effectiveFavoriteKeys, favoriteFailures, FavoritesController, type FavoriteAction } from './favoritesController';
import type { FavoritesStorage } from './favoritesStorage';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const ref: PromptReference = { source: 'builtin', workspaceId: null, promptId: 'test' };
const action = (favorite: boolean): FavoriteAction => ({ reference: ref, favorite, title: 'Test', sourceLabel: 'Built in' });
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

function memoryStorage() {
  let snapshot = emptyFavoriteSnapshot();
  const storage: FavoritesStorage = {
    read: vi.fn(async () => snapshot),
    set: vi.fn(async (input) => { snapshot = applyFavorite(snapshot, input); return snapshot; })
  };
  return storage;
}

describe('favorite async state', () => {
  it('does not write startup defaults or erase pending intent with a delayed load', async () => {
    const read = deferred<FavoriteSnapshot>();
    const storage = memoryStorage();
    storage.read = vi.fn(() => read.promise);
    const controller = new FavoritesController(storage);
    const stop = controller.start();
    controller.set(action(true));
    expect(storage.set).not.toHaveBeenCalled();
    expect(effectiveFavoriteKeys(controller.getSnapshot()).has(favoriteKey(ref))).toBe(true);
    read.resolve(emptyFavoriteSnapshot());
    await settle();
    expect(storage.set).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().changes.size).toBe(0);
    stop();
  });

  it('coalesces queued toggles and never acknowledges a newer intent with an old result', async () => {
    const storage = memoryStorage();
    const first = deferred<FavoriteSnapshot>();
    const save = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementation(async (input) => applyFavorite(emptyFavoriteSnapshot(), input));
    storage.set = save;
    const controller = new FavoritesController(storage);
    const stop = controller.start();
    await settle();
    controller.set(action(true));
    controller.set(action(false));
    controller.set(action(true));
    first.resolve(applyFavorite(emptyFavoriteSnapshot(), action(true)));
    await settle();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0].favorite).toBe(true);
    expect(effectiveFavoriteKeys(controller.getSnapshot()).has(favoriteKey(ref))).toBe(true);
    expect(controller.getSnapshot().changes.size).toBe(0);
    stop();
  });

  it('keeps failures temporary after dismissal and retries the current action', async () => {
    const storage = memoryStorage();
    const save = vi.fn()
      .mockRejectedValueOnce({ kind: 'io', message: 'Storage unavailable.' })
      .mockImplementation(async (input) => applyFavorite(emptyFavoriteSnapshot(), input));
    storage.set = save;
    const controller = new FavoritesController(storage);
    const stop = controller.start();
    await settle();
    controller.set(action(true));
    await settle();
    const failure = favoriteFailures(controller.getSnapshot())[0];
    controller.dismiss(failure);
    expect(favoriteFailures(controller.getSnapshot())).toEqual([]);
    expect(controller.getSnapshot().changes.get(favoriteKey(ref))?.status).toBe('failed');
    expect(effectiveFavoriteKeys(controller.getSnapshot()).has(favoriteKey(ref))).toBe(true);
    await controller.retry(favoriteKey(ref));
    await settle();
    expect(controller.getSnapshot().changes.size).toBe(0);
    expect(save).toHaveBeenCalledTimes(2);
    stop();
  });

  it('ignores a stale refresh that finishes after a successful mutation', async () => {
    const storage = memoryStorage();
    const controller = new FavoritesController(storage);
    const stop = controller.start();
    await settle();
    const stale = deferred<FavoriteSnapshot>();
    storage.read = () => stale.promise;
    const refresh = controller.reload();
    controller.set(action(true));
    await settle();
    stale.resolve(emptyFavoriteSnapshot());
    await refresh;
    expect(effectiveFavoriteKeys(controller.getSnapshot()).has(favoriteKey(ref))).toBe(true);
    stop();
  });

  it('preserves newer storage events and ignores canceled StrictMode reads', async () => {
    const first = deferred<FavoriteSnapshot>();
    const second = deferred<FavoriteSnapshot>();
    const storage = memoryStorage();
    storage.read = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const controller = new FavoritesController(storage);
    controller.start()();
    const stop = controller.start();
    second.resolve(applyFavorite(emptyFavoriteSnapshot(), action(true)));
    await settle();
    first.resolve(emptyFavoriteSnapshot());
    await settle();
    expect(effectiveFavoriteKeys(controller.getSnapshot()).has(favoriteKey(ref))).toBe(true);
    expect(storage.set).not.toHaveBeenCalled();
    stop();
  });

  it('does not attempt a write after a corrupt initial read until retry loads healthy data', async () => {
    const storage = memoryStorage();
    storage.read = vi.fn().mockRejectedValueOnce({ kind: 'json', message: 'Bad favorites.' })
      .mockResolvedValue(emptyFavoriteSnapshot());
    const controller = new FavoritesController(storage);
    const stop = controller.start();
    await settle();
    controller.set(action(true));
    expect(storage.set).not.toHaveBeenCalled();
    await controller.retry(favoriteKey(ref));
    await settle();
    expect(storage.set).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().loadState).toBe('ready');
    stop();
  });

  it('can resume an accepted in-flight intention after effect cleanup without sticking in saving state', async () => {
    const storage = memoryStorage();
    const old = deferred<FavoriteSnapshot>();
    storage.set = vi.fn().mockReturnValueOnce(old.promise)
      .mockImplementation(async (input) => applyFavorite(emptyFavoriteSnapshot(), input));
    const controller = new FavoritesController(storage);
    const firstStop = controller.start();
    await settle();
    controller.set(action(true));
    firstStop();
    const stop = controller.start();
    await settle();
    expect(controller.getSnapshot().changes.size).toBe(0);
    old.resolve(emptyFavoriteSnapshot());
    await settle();
    expect(effectiveFavoriteKeys(controller.getSnapshot()).has(favoriteKey(ref))).toBe(true);
    stop();
  });

  it('does not dismiss a newer load failure when an old toast finishes closing', async () => {
    const storage = memoryStorage();
    storage.read = vi.fn().mockRejectedValue({ kind: 'json', message: 'Invalid favorites.' });
    const controller = new FavoritesController(storage);
    const stop = controller.start();
    await settle();
    const old = favoriteFailures(controller.getSnapshot())[0];
    await controller.reload();
    controller.dismiss(old);
    expect(favoriteFailures(controller.getSnapshot())).toHaveLength(1);
    expect(favoriteFailures(controller.getSnapshot())[0].id).not.toBe(old.id);
    stop();
  });
});
