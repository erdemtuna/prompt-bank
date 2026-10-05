import { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  effectiveFavoriteKeys, favoriteFailures, FavoritesController
} from '../data/favoritesController';
import type { FavoritesStorage } from '../data/favoritesStorage';

export function useFavorites(storage: FavoritesStorage) {
  const controller = useMemo(() => new FavoritesController(storage), [storage]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  useEffect(controller.start, [controller]);
  const keys = useMemo(() => effectiveFavoriteKeys(state), [state]);
  const failures = useMemo(() => favoriteFailures(state), [state]);
  return {
    keys, failures, changes: state.changes, loadState: state.loadState,
    set: controller.set, retry: controller.retry, reload: controller.reload, dismiss: controller.dismiss
  };
}

export type FavoritesView = ReturnType<typeof useFavorites>;
