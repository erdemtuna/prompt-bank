import { z } from 'zod';
import { isKebabCaseId, type Prompt } from './schemas';

export const FAVORITES_VERSION = 1;
export const MAX_FAVORITES_BYTES = 1024 * 1024;
export const MAX_FAVORITES_COUNT = 5000;

const promptId = z.string().refine(isKebabCaseId);
const workspaceId = z.string().regex(/^[A-Za-z0-9_-]+$/);
const referenceSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('builtin'), workspaceId: z.null(), promptId }).strict(),
  z.object({ source: z.literal('global'), workspaceId: z.null(), promptId }).strict(),
  z.object({ source: z.literal('folder'), workspaceId, promptId }).strict()
]);
const snapshotSchema = z.object({
  version: z.literal(FAVORITES_VERSION),
  favorites: z.array(referenceSchema).max(MAX_FAVORITES_COUNT)
}).strict();

export type PromptReference = z.infer<typeof referenceSchema>;
export type FavoriteSnapshot = z.infer<typeof snapshotSchema>;
export type SetFavoriteInput = { reference: PromptReference; favorite: boolean };
export type FavoriteOperation = 'load' | 'save';

export class FavoritesError extends Error {
  constructor(public readonly kind: string, message: string) {
    super(message);
    this.name = 'FavoritesError';
  }
}

export function favoriteError(error: unknown, operation: FavoriteOperation): FavoritesError {
  if (error instanceof FavoritesError) return error;
  if (error && typeof error === 'object' && 'kind' in error && 'message' in error
    && typeof error.kind === 'string' && typeof error.message === 'string') {
    return new FavoritesError(error.kind, error.message);
  }
  return new FavoritesError('unknown', operation === 'load'
    ? 'Favorites could not be loaded.'
    : 'Favorites could not be saved.');
}

export function favoriteKey(reference: PromptReference): string {
  return JSON.stringify([reference.source, reference.workspaceId, reference.promptId]);
}

export function promptReference(prompt: Prompt, workspaceId: string | null): PromptReference {
  return parsePromptReference({
    source: prompt.source,
    workspaceId: prompt.source === 'folder' ? workspaceId : null,
    promptId: prompt.id
  });
}

export function parsePromptReference(value: unknown): PromptReference {
  const result = referenceSchema.safeParse(value);
  if (!result.success) throw new FavoritesError('invalid_favorite', 'The favorite reference is invalid.');
  return result.data;
}

const sourceRank = { builtin: 0, global: 1, folder: 2 };
const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

export function compareFavoriteReferences(a: PromptReference, b: PromptReference): number {
  return sourceRank[a.source] - sourceRank[b.source]
    || compareText(a.workspaceId ?? '', b.workspaceId ?? '')
    || compareText(a.promptId, b.promptId);
}

export function emptyFavoriteSnapshot(): FavoriteSnapshot {
  return { version: FAVORITES_VERSION, favorites: [] };
}

export function parseFavoriteSnapshot(value: unknown): FavoriteSnapshot {
  if (value && typeof value === 'object' && 'version' in value
    && typeof value.version === 'number' && Number.isInteger(value.version)
    && value.version !== FAVORITES_VERSION) {
    throw new FavoritesError('unknown_favorites_version', 'Favorites have an unsupported version.');
  }
  if (value && typeof value === 'object' && 'favorites' in value
    && Array.isArray(value.favorites) && value.favorites.length > MAX_FAVORITES_COUNT) {
    throw new FavoritesError('favorites_too_large', 'There are too many favorites.');
  }
  const result = snapshotSchema.safeParse(value);
  if (!result.success) throw new FavoritesError('invalid_favorite', 'Favorites data is invalid.');
  const keys = result.data.favorites.map(favoriteKey);
  if (new Set(keys).size !== keys.length) {
    throw new FavoritesError('invalid_favorite', 'Favorites contain duplicate references.');
  }
  const snapshot: FavoriteSnapshot = {
    version: FAVORITES_VERSION,
    favorites: [...result.data.favorites].sort(compareFavoriteReferences)
  };
  ensureFavoriteSize(JSON.stringify(snapshot));
  return snapshot;
}

export function ensureFavoriteSize(raw: string): void {
  if (new TextEncoder().encode(raw).byteLength > MAX_FAVORITES_BYTES) {
    throw new FavoritesError('favorites_too_large', 'Favorites exceed the storage limit.');
  }
}

export function decodeFavoriteSnapshot(raw: string): FavoriteSnapshot {
  ensureFavoriteSize(raw);
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new FavoritesError('json', 'Favorites data is not valid JSON.');
  }
  return parseFavoriteSnapshot(value);
}

export function applyFavorite(snapshot: FavoriteSnapshot, input: SetFavoriteInput): FavoriteSnapshot {
  if (typeof input.favorite !== 'boolean') {
    throw new FavoritesError('invalid_favorite', 'The favorite state is invalid.');
  }
  const reference = parsePromptReference(input.reference);
  const key = favoriteKey(reference);
  const favorites = snapshot.favorites.filter((item) => favoriteKey(item) !== key);
  if (input.favorite) favorites.push(reference);
  if (favorites.length > MAX_FAVORITES_COUNT) {
    throw new FavoritesError('favorites_too_large', 'There are too many favorites.');
  }
  return parseFavoriteSnapshot({ version: FAVORITES_VERSION, favorites });
}
