import { describe, expect, it } from 'vitest';
import {
  applyFavorite, decodeFavoriteSnapshot, emptyFavoriteSnapshot, favoriteError, favoriteKey,
  MAX_FAVORITES_BYTES, MAX_FAVORITES_COUNT, parseFavoriteSnapshot, parsePromptReference,
  promptReference, type PromptReference
} from './favorites';
import { loadAppData } from './loaders';

const builtin: PromptReference = { source: 'builtin', workspaceId: null, promptId: 'same-id' };

describe('favorite references', () => {
  it('keeps identical declared IDs in separate sources and workspaces distinct', () => {
    const refs: PromptReference[] = [
      builtin,
      { source: 'global', workspaceId: null, promptId: 'same-id' },
      { source: 'folder', workspaceId: 'ws1', promptId: 'same-id' },
      { source: 'folder', workspaceId: 'ws2', promptId: 'same-id' }
    ];
    expect(new Set(refs.map(favoriteKey)).size).toBe(4);
  });

  it('uses the author ID and workspace context rather than a filename', () => {
    const prompt = loadAppData().prompts[0];
    expect(promptReference(prompt, null)).toEqual({
      source: 'builtin', workspaceId: null, promptId: prompt.id
    });
    expect(promptReference({ ...prompt, path: 'renamed.md', key: 'renamed.md' }, null))
      .toEqual(promptReference(prompt, null));
    expect(promptReference({ ...prompt, source: 'folder' }, 'ws1').workspaceId).toBe('ws1');
    expect(() => promptReference({ ...prompt, source: 'folder' }, null)).toThrow(/reference/);
  });

  it.each([
    { source: 'builtin', promptId: 'test' },
    { source: 'builtin', workspaceId: 'ws1', promptId: 'test' },
    { source: 'global', workspaceId: null, promptId: 'Bad ID' },
    { source: 'folder', workspaceId: null, promptId: 'test' },
    { source: 'folder', workspaceId: 'C:\\private', promptId: 'test' },
    { ...builtin, contents: 'private text' },
    { ...builtin, promptId: '../private' }
  ])('rejects malformed, path-bearing or extra fields: %j', (value) => {
    expect(() => parsePromptReference(value)).toThrow(/reference/);
  });
});

describe('favorite snapshots', () => {
  it('serializes the same camelCase shape as Rust', () => {
    expect(JSON.stringify(parseFavoriteSnapshot({ version: 1, favorites: [builtin] })))
      .toBe('{"version":1,"favorites":[{"source":"builtin","workspaceId":null,"promptId":"same-id"}]}');
  });

  it('adds and removes idempotently and sorts deterministically', () => {
    const global: PromptReference = { source: 'global', workspaceId: null, promptId: 'a' };
    let snapshot = applyFavorite(emptyFavoriteSnapshot(), { reference: global, favorite: true });
    snapshot = applyFavorite(snapshot, { reference: builtin, favorite: true });
    expect(snapshot.favorites).toEqual([builtin, global]);
    expect(applyFavorite(snapshot, { reference: builtin, favorite: true })).toEqual(snapshot);
    const removed = applyFavorite(snapshot, { reference: builtin, favorite: false });
    expect(removed.favorites).toEqual([global]);
    expect(applyFavorite(removed, { reference: builtin, favorite: false })).toEqual(removed);
  });

  it.each([
    null, {}, { version: 1 }, { version: 1, favorites: [builtin, builtin] },
    { version: 1, favorites: [], controls: { model: 'private' } }
  ])('does not turn invalid data into empty success: %j', (value) => {
    expect(() => parseFavoriteSnapshot(value)).toThrow();
  });

  it('distinguishes unsupported versions and malformed JSON', () => {
    expect(() => decodeFavoriteSnapshot('{"version":2,"futureData":true}'))
      .toThrow(/unsupported version/);
    expect(() => decodeFavoriteSnapshot('')).toThrow(/not valid JSON/);
  });

  it('enforces exact byte and count limits without truncation', () => {
    expect(() => decodeFavoriteSnapshot(' '.repeat(MAX_FAVORITES_BYTES + 1)))
      .toThrow(/storage limit/);
    const favorites = Array.from({ length: MAX_FAVORITES_COUNT }, (_, index) => ({
      ...builtin, promptId: `prompt-${index}`
    }));
    expect(parseFavoriteSnapshot({ version: 1, favorites }).favorites).toHaveLength(MAX_FAVORITES_COUNT);
    expect(() => parseFavoriteSnapshot({ version: 1, favorites: [...favorites, { ...builtin, promptId: 'extra' }] }))
      .toThrow(/too many/);
    expect(() => parseFavoriteSnapshot({ version: 1, favorites: [{ ...builtin, promptId: 'x'.repeat(MAX_FAVORITES_BYTES) }] }))
      .toThrow(/storage limit/);
  });

  it('never echoes unexpected exception contents in user-facing errors', () => {
    expect(favoriteError(new Error('C:\\private\\favorites.json'), 'save').message)
      .toBe('Favorites could not be saved.');
  });
});
