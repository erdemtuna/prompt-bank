import {
  emptyFavoriteSnapshot, favoriteError, favoriteKey, type FavoriteSnapshot,
  type FavoritesError, type SetFavoriteInput
} from './favorites';
import type { FavoritesStorage } from './favoritesStorage';

export type FavoriteAction = SetFavoriteInput & {
  title: string;
  sourceLabel: string;
  restoreFocus?: () => void;
};
export type FavoriteChange = FavoriteAction & {
  sequence: number;
  status: 'queued' | 'saving' | 'failed';
  error?: FavoritesError;
  dismissed: boolean;
};
export type FavoritesState = {
  snapshot: FavoriteSnapshot;
  changes: ReadonlyMap<string, FavoriteChange>;
  loadState: 'loading' | 'ready' | 'error';
  loadError: FavoritesError | null;
  loadNotice: number;
  loadDismissed: boolean;
};
export type FavoriteFailure = {
  id: string;
  key: string | null;
  title: string;
  message: string;
  restoreFocus?: () => void;
};

export function effectiveFavoriteKeys(state: FavoritesState): ReadonlySet<string> {
  const keys = new Set(state.snapshot.favorites.map(favoriteKey));
  for (const [key, change] of state.changes) {
    if (change.favorite) keys.add(key);
    else keys.delete(key);
  }
  return keys;
}

export function favoriteFailures(state: FavoritesState): FavoriteFailure[] {
  const failures: FavoriteFailure[] = [];
  if (state.loadError && !state.loadDismissed) {
    failures.push({
      id: `load:${state.loadNotice}`, key: null, title: 'Favorites unavailable',
      message: `${state.loadError.message} Changes will be temporary until favorites can be loaded.`
    });
  }
  for (const [key, change] of state.changes) {
    if (change.status !== 'failed' || change.dismissed || !change.error) continue;
    failures.push({
      id: `save:${change.sequence}`, key,
      title: 'Favorite change not saved',
      message: `${change.title} (${change.sourceLabel}) is ${change.favorite ? 'starred' : 'unstarred'} only in this session. ${change.error.message}`,
      restoreFocus: change.restoreFocus
    });
  }
  return failures;
}

export class FavoritesController {
  private state: FavoritesState = {
    snapshot: emptyFavoriteSnapshot(), changes: new Map(), loadState: 'loading',
    loadError: null, loadNotice: 0, loadDismissed: false
  };
  private listeners = new Set<() => void>();
  private active = false;
  private generation = 0;
  private readEpoch = 0;
  private writeRevision = 0;
  private sequence = 0;
  private processing: { generation: number } | null = null;

  constructor(private readonly storage: FavoritesStorage) {}

  getSnapshot = (): FavoritesState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start = (): (() => void) => {
    this.active = true;
    const generation = ++this.generation;
    const changes = new Map(this.state.changes);
    for (const [key, change] of changes) {
      if (change.status === 'saving') changes.set(key, { ...change, status: 'queued' });
    }
    this.publish({ ...this.state, changes });
    void this.reload();
    const unsubscribe = this.storage.subscribe?.(() => { void this.reload(); });
    return () => {
      unsubscribe?.();
      if (this.generation === generation) {
        this.active = false;
        this.generation += 1;
      }
    };
  };

  private publish(next: FavoritesState): void {
    this.state = next;
    for (const listener of this.listeners) listener();
  }

  private current(generation: number): boolean {
    return this.active && this.generation === generation;
  }

  reload = async (): Promise<boolean> => {
    const generation = this.generation;
    const epoch = ++this.readEpoch;
    const revision = this.writeRevision;
    this.publish({
      ...this.state,
      loadState: this.state.loadState === 'ready' ? 'ready' : 'loading'
    });
    try {
      const snapshot = await this.storage.read();
      if (!this.current(generation) || epoch !== this.readEpoch) return false;
      this.publish({
        ...this.state,
        snapshot: revision === this.writeRevision ? snapshot : this.state.snapshot,
        loadState: 'ready', loadError: null, loadDismissed: false
      });
      void this.pump();
      return true;
    } catch (error) {
      if (!this.current(generation) || epoch !== this.readEpoch) return false;
      if (revision !== this.writeRevision) return this.state.loadState === 'ready';
      const failure = favoriteError(error, 'load');
      const changes = new Map(this.state.changes);
      for (const [key, change] of changes) {
        if (change.status === 'queued') changes.set(key, { ...change, status: 'failed', error: failure });
      }
      this.publish({
        ...this.state, changes, loadState: 'error', loadError: failure,
        loadNotice: this.state.loadNotice + 1, loadDismissed: false
      });
      return false;
    }
  };

  set = (action: FavoriteAction): void => {
    const changes = new Map(this.state.changes);
    const error = this.state.loadState === 'error' ? this.state.loadError ?? undefined : undefined;
    changes.set(favoriteKey(action.reference), {
      ...action, sequence: ++this.sequence, status: error ? 'failed' : 'queued',
      error, dismissed: false
    });
    this.publish({ ...this.state, changes });
    void this.pump();
  };

  retry = async (key: string | null): Promise<void> => {
    if (key === null) {
      await this.reload();
      return;
    }
    const change = this.state.changes.get(key);
    if (!change || change.status !== 'failed') return;
    if (this.state.loadState !== 'ready' && !await this.reload()) return;
    if (this.state.changes.get(key)?.sequence !== change.sequence) return;
    this.set(change);
  };

  dismiss = (failure: FavoriteFailure): void => {
    if (failure.key === null) {
      if (failure.id !== `load:${this.state.loadNotice}`) return;
      this.publish({ ...this.state, loadDismissed: true });
      return;
    }
    const change = this.state.changes.get(failure.key);
    if (!change || `save:${change.sequence}` !== failure.id) return;
    const changes = new Map(this.state.changes);
    changes.set(failure.key, { ...change, dismissed: true });
    this.publish({ ...this.state, changes });
  };

  private async pump(): Promise<void> {
    const generation = this.generation;
    if (!this.current(generation) || this.state.loadState !== 'ready'
      || this.processing?.generation === generation) return;
    const processing = { generation };
    this.processing = processing;
    try {
      while (this.current(generation) && this.state.loadState === 'ready') {
        const entry = [...this.state.changes].find(([, change]) => change.status === 'queued');
        if (!entry) break;
        const [key, change] = entry;
        const changes = new Map(this.state.changes);
        changes.set(key, { ...change, status: 'saving' });
        this.publish({ ...this.state, changes });
        try {
          const snapshot = await this.storage.set({
            reference: change.reference, favorite: change.favorite
          });
          if (!this.current(generation)) return;
          this.writeRevision += 1;
          const next = new Map(this.state.changes);
          if (next.get(key)?.sequence === change.sequence) next.delete(key);
          this.publish({
            ...this.state, snapshot, changes: next,
            loadState: 'ready', loadError: null, loadDismissed: false
          });
        } catch (error) {
          if (!this.current(generation)) return;
          const next = new Map(this.state.changes);
          if (next.get(key)?.sequence === change.sequence) {
            next.set(key, { ...change, status: 'failed', error: favoriteError(error, 'save'), dismissed: false });
            this.publish({ ...this.state, changes: next });
          }
        }
      }
    } finally {
      if (this.processing === processing) this.processing = null;
    }
  }
}
