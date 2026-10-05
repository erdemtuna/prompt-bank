import { isDesktop, readFavorites, setFavorite } from './desktopClient';
import {
  applyFavorite, decodeFavoriteSnapshot, emptyFavoriteSnapshot, favoriteError, FavoritesError,
  type FavoriteSnapshot, type SetFavoriteInput
} from './favorites';

export const FAVORITES_STORAGE_KEY = 'prompt-bank.favorites.v1';

export type FavoritesStorage = {
  read: () => Promise<FavoriteSnapshot>;
  set: (input: SetFavoriteInput) => Promise<FavoriteSnapshot>;
  subscribe?: (onChange: () => void) => () => void;
};

type BrowserEnvironment = {
  storage: () => Storage;
  locks: () => Pick<LockManager, 'request'> | undefined;
  target: Pick<Window, 'addEventListener' | 'removeEventListener'>;
};

export function browserFavoritesStorage(environment: BrowserEnvironment): FavoritesStorage {
  const read = (): FavoriteSnapshot => {
    const raw = environment.storage().getItem(FAVORITES_STORAGE_KEY);
    const snapshot = raw === null ? emptyFavoriteSnapshot() : decodeFavoriteSnapshot(raw);
    if (snapshot.favorites.some((reference) => reference.source !== 'builtin')) {
      throw new FavoritesError('invalid_favorite', 'Browser favorites must reference built-in prompts.');
    }
    return snapshot;
  };
  return {
    async read() {
      try {
        return read();
      } catch (error) {
        throw favoriteError(error, 'load');
      }
    },
    async set(input) {
      if (input.reference.source !== 'builtin') {
        throw new FavoritesError('invalid_favorite', 'Browser favorites must reference built-in prompts.');
      }
      try {
        const locks = environment.locks();
        if (!locks) {
          throw new FavoritesError('favorites_unavailable', 'This browser cannot safely save favorites.');
        }
        return await locks.request(FAVORITES_STORAGE_KEY, { ifAvailable: true }, (lock) => {
          if (!lock) throw new FavoritesError('favorites_busy', 'Favorites storage is busy. Try again.');
          const before = read();
          const after = applyFavorite(before, input);
          const encoded = JSON.stringify(after);
          if (JSON.stringify(before) !== encoded) environment.storage().setItem(FAVORITES_STORAGE_KEY, encoded);
          return after;
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'QuotaExceededError') {
          throw new FavoritesError('favorites_too_large', 'Browser storage is full. The favorite was not saved.');
        }
        throw favoriteError(error, 'save');
      }
    },
    subscribe(onChange) {
      const onStorage = (event: Event) => {
        if (event instanceof StorageEvent && (event.key === FAVORITES_STORAGE_KEY || event.key === null)) {
          onChange();
        }
      };
      environment.target.addEventListener('storage', onStorage);
      return () => environment.target.removeEventListener('storage', onStorage);
    }
  };
}

export function createFavoritesStorage(): FavoritesStorage {
  if (isDesktop()) {
    return {
      read: readFavorites,
      set: setFavorite,
      subscribe(onChange) {
        window.addEventListener('focus', onChange);
        return () => window.removeEventListener('focus', onChange);
      }
    };
  }
  return browserFavoritesStorage({
    storage: () => window.localStorage,
    locks: () => navigator.locks,
    target: window
  });
}
