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
const markdown = (id: string, title: string, category = 'writing') => `---
id: ${id}
title: ${title}
category: ${category}
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
const navigationData = loadAppDataFromSources([
  {
    source: 'builtin', sourceLabel: 'Built in',
    files: { 'alpha.md': markdown('alpha', 'Alpha', 'review'), 'beta.md': markdown('beta', 'Beta') }
  },
  {
    source: 'global', sourceLabel: 'Global',
    files: { 'gamma.md': markdown('gamma', 'Gamma') }
  }
], 'presets:\n  - id: model\n    label: Model');

function Fixture({
  appData = data,
  initialCategory = 'all',
  initialFavorites = false,
  initialSnapshot = emptyFavoriteSnapshot()
} = {}) {
  const [selected, setSelected] = useState(appData.prompts[0].key);
  const [only, setOnly] = useState(initialFavorites);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(initialCategory);
  const [source, setSource] = useState('all');
  const [storage] = useState(() => {
    let snapshot: FavoriteSnapshot = initialSnapshot;
    return {
      read: async () => snapshot,
      set: async (input) => { snapshot = applyFavorite(snapshot, input); return snapshot; }
    } satisfies FavoritesStorage;
  });
  const favorites = useFavorites(storage);
  return <FluentProvider theme={webLightTheme}>
    <WorkspaceView data={appData} workspaceId={null} workspaceLabel="Library" favorites={favorites}
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

  it('switches exclusively between Favorites, categories, and All without toggling the active choice off', async () => {
    render(<Fixture appData={navigationData} />);
    const library = within(screen.getByRole('region', { name: 'Prompt library' }));
    const navigation = within(library.getByRole('group', { name: 'Filter prompts' }));
    const star = library.getByRole('button', { name: 'Add Beta to favorites (Built in)' });
    await waitFor(() => expect(star.hasAttribute('disabled')).toBe(false));
    fireEvent.click(star);
    const input = screen.getByLabelText('topic', { exact: true });
    fireEvent.change(input, { target: { value: 'Keep this composition' } });
    fireEvent.click(navigation.getByRole('button', { name: 'review' }));
    expect(library.queryByRole('button', { name: 'Beta, Built in' })).toBeNull();
    fireEvent.click(navigation.getByRole('button', { name: 'Favorites' }));
    expect(library.getByRole('button', { name: 'Beta, Built in' })).toBeTruthy();
    expect(library.queryByRole('button', { name: /^Alpha/ })).toBeNull();
    fireEvent.click(navigation.getByRole('button', { name: 'Favorites' }));
    expect(library.getByRole('button', { name: 'Beta, Built in' })).toBeTruthy();
    expect(navigation.getAllByRole('button').filter((button) => button.getAttribute('aria-pressed') === 'true')
      .map((button) => button.textContent)).toEqual(['Favorites']);
    fireEvent.click(navigation.getByRole('button', { name: 'writing' }));
    expect(navigation.getByRole('button', { name: 'Favorites' }).getAttribute('aria-pressed')).toBe('false');
    expect(library.getByRole('button', { name: 'Gamma, Global' })).toBeTruthy();
    fireEvent.click(navigation.getByRole('button', { name: 'Favorites' }));
    fireEvent.click(navigation.getByRole('button', { name: 'All' }));
    expect(library.getByRole('button', { name: /^Alpha/ })).toBeTruthy();
    expect(library.getByRole('button', { name: 'Gamma, Global' })).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe('Keep this composition');
  });

  it('preserves search and source filters when switching navigation choices', async () => {
    render(<Fixture appData={navigationData} />);
    const library = within(screen.getByRole('region', { name: 'Prompt library' }));
    const navigation = within(library.getByRole('group', { name: 'Filter prompts' }));
    const source = within(library.getByRole('group', { name: 'Filter by source' }));
    const star = library.getByRole('button', { name: 'Add Beta to favorites (Built in)' });
    await waitFor(() => expect(star.hasAttribute('disabled')).toBe(false));
    fireEvent.click(star);
    fireEvent.click(source.getByRole('button', { name: 'Built in' }));
    fireEvent.change(library.getByRole('textbox', { name: 'Search prompts' }), { target: { value: 'Beta' } });
    for (const name of ['Favorites', 'writing', 'All']) {
      fireEvent.click(navigation.getByRole('button', { name }));
      expect(library.getByRole('button', { name: 'Beta, Built in' })).toBeTruthy();
      expect(source.getByRole('button', { name: 'Built in' }).getAttribute('aria-pressed')).toBe('true');
      expect((library.getByRole('textbox', { name: 'Search prompts' }) as HTMLInputElement).value).toBe('Beta');
    }
  });

  it('ignores a stale category restriction when Favorites is active', async () => {
    const snapshot = applyFavorite(emptyFavoriteSnapshot(), {
      reference: { source: 'builtin', workspaceId: null, promptId: 'beta' },
      favorite: true
    });
    render(<Fixture appData={navigationData} initialCategory="review" initialFavorites initialSnapshot={snapshot} />);
    const library = within(screen.getByRole('region', { name: 'Prompt library' }));
    await waitFor(() => expect(library.getByRole('button', { name: 'Favorites' }).hasAttribute('disabled')).toBe(false));
    expect(library.getByRole('button', { name: 'Beta, Built in' })).toBeTruthy();
    expect(library.queryByRole('button', { name: /^Alpha/ })).toBeNull();
    expect(library.getByRole('button', { name: 'review' }).getAttribute('aria-pressed')).toBe('false');
  });
});
