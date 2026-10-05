// @vitest-environment jsdom
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { applyFavorite, emptyFavoriteSnapshot, type FavoriteSnapshot } from '../data/favorites';
import type { FavoritesStorage } from '../data/favoritesStorage';
import { loadAppDataFromSources } from '../data/loaders';
import { useFavorites } from '../hooks/useFavorites';
import { WorkspaceView } from './WorkspaceView';

afterEach(cleanup);
const markdown = (id: string, title: string) => `---
id: ${id}
title: ${title}
category: writing
description: A sample prompt
variables:
  - name: topic
    description: The topic
    required: true
---
Write about {{topic}}.`;
const data = loadAppDataFromSources({
  'alpha.md': markdown('alpha', 'Alpha'),
  'beta.md': markdown('beta', 'Beta')
}, 'presets:\n  - id: model\n    label: Model');

function Fixture() {
  const [selected, setSelected] = useState(data.prompts[0].key);
  const [only, setOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [source, setSource] = useState('all');
  const [storage] = useState(() => {
    let snapshot: FavoriteSnapshot = emptyFavoriteSnapshot();
    return {
      read: async () => snapshot,
      set: async (input) => { snapshot = applyFavorite(snapshot, input); return snapshot; }
    } satisfies FavoritesStorage;
  });
  const favorites = useFavorites(storage);
  return <FluentProvider theme={webLightTheme}>
    <WorkspaceView data={data} workspaceId={null} workspaceLabel="Library" favorites={favorites}
      favoritesOnly={only} onFavoritesChange={setOnly} search={search} category={category}
      sourceFilter={source} selectedPromptKey={selected} onSelectPrompt={setSelected}
      onSearchChange={setSearch} onCategoryChange={setCategory} onSourceChange={setSource} />
  </FluentProvider>;
}

describe('favorite filtering and composition', () => {
  it('keeps the selected prompt and typed input when another prompt is starred and filters hide it', async () => {
    render(<Fixture />);
    const library = within(screen.getByRole('region', { name: 'Prompt library' }));
    const star = library.getByRole('button', { name: 'Add Beta to favorites (Built in)' });
    await waitFor(() => expect(star.hasAttribute('disabled')).toBe(false));
    const input = screen.getByLabelText('topic', { exact: true });
    fireEvent.change(input, { target: { value: 'keep this input' } });
    fireEvent.click(star);
    await waitFor(() => expect(library.getByRole('button', { name: 'Remove Beta from favorites (Built in)' })).toBeTruthy());
    expect((input as HTMLInputElement).value).toBe('keep this input');
    fireEvent.click(library.getByRole('button', { name: 'Favorites' }));
    expect(library.queryByRole('button', { name: /^Alpha/ })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Alpha' })).toBeTruthy();
    expect((screen.getByLabelText('topic', { exact: true }) as HTMLInputElement).value).toBe('keep this input');
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(library.getByRole('button', { name: /^Alpha/ })).toBeTruthy();
  });
});
