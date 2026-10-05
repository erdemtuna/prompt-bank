// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { applyFavorite, emptyFavoriteSnapshot, type FavoriteSnapshot } from '../data/favorites';
import type { FavoritesStorage } from '../data/favoritesStorage';
import { useFavorites } from './useFavorites';

describe('useFavorites lifecycle', () => {
  it('works under StrictMode without writing initial/default state', async () => {
    let snapshot: FavoriteSnapshot = emptyFavoriteSnapshot();
    const storage: FavoritesStorage = {
      read: vi.fn(async () => snapshot),
      set: vi.fn(async (input) => { snapshot = applyFavorite(snapshot, input); return snapshot; })
    };
    const hook = renderHook(() => useFavorites(storage), {
      wrapper: ({ children }) => <StrictMode>{children}</StrictMode>
    });
    await waitFor(() => expect(hook.result.current.loadState).toBe('ready'));
    expect(storage.set).not.toHaveBeenCalled();
    act(() => hook.result.current.set({
      reference: { source: 'builtin', workspaceId: null, promptId: 'test' },
      favorite: true, title: 'Test', sourceLabel: 'Built in'
    }));
    await waitFor(() => expect(hook.result.current.changes.size).toBe(0));
    expect(storage.set).toHaveBeenCalledOnce();
    hook.unmount();
  });
});
