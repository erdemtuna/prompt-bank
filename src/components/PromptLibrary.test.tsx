// @vitest-environment jsdom
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { type ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Prompt } from '../data/schemas';
import { PromptLibrary } from './PromptLibrary';

afterEach(cleanup);

function makePrompt(overrides: Partial<Prompt>): Prompt {
  return {
    id: 'p',
    title: 'Prompt',
    description: 'A prompt',
    category: 'review',
    kind: 'prompt',
    tags: [],
    variables: [],
    options: [],
    template: 'Body.',
    path: 'p.md',
    source: 'builtin',
    sourceLabel: 'Built in',
    key: 'p.md',
    ...overrides
  };
}

const noop = () => {};

function renderLibrary(props: Partial<ComponentProps<typeof PromptLibrary>> = {}) {
  const prompts = props.prompts ?? [
    makePrompt({ id: 'a', title: 'Built in A', path: '../../prompts/a.md', key: '../../prompts/a.md', source: 'builtin', sourceLabel: 'Built in' }),
    makePrompt({ id: 'b', title: 'Global B', path: 'b.md', key: 'global:b.md', source: 'global', sourceLabel: 'Global' })
  ];
  const defaults: ComponentProps<typeof PromptLibrary> = {
    prompts,
    categories: ['review'],
    selectedPromptKey: prompts[0]?.key,
    search: '',
    category: 'all',
    sourceFilter: 'all',
    sourceOptions: [
      { value: 'all', label: 'All' },
      { value: 'builtin', label: 'Built in' },
      { value: 'global', label: 'Global' }
    ],
    showSourceFilter: true,
    totalPromptCount: prompts.length,
    selectedPromptHidden: false,
    favoritesOnly: false,
    favoritesLoading: false,
    favoriteState: () => ({ favorite: false, unsaved: false, pending: false }),
    onFavoritesChange: noop,
    onToggleFavorite: noop,
    onRetryFavorite: noop,
    onSearchChange: noop,
    onCategoryChange: noop,
    onSourceChange: noop,
    onSelectPrompt: noop,
    onClearFilters: noop,
    onShowSelectedPrompt: noop
  };
  return render(
    <FluentProvider theme={webLightTheme}>
      <PromptLibrary {...defaults} {...props} />
    </FluentProvider>
  );
}

describe('PromptLibrary source filter', () => {
  it('renders the source filter group and per-prompt source labels for multiple sources', () => {
    renderLibrary();

    const group = screen.getByRole('group', { name: 'Filter by source' });
    expect(within(group).getByRole('button', { name: 'All' })).toBeTruthy();
    expect(within(group).getByRole('button', { name: 'Built in' })).toBeTruthy();
    expect(within(group).getByRole('button', { name: 'Global' })).toBeTruthy();

    expect(screen.getByRole('button', { name: /Built in A, Built in/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Global B, Global/ })).toBeTruthy();
  });

  it('calls onSourceChange when a source button is clicked', () => {
    const onSourceChange = vi.fn();
    renderLibrary({ onSourceChange });

    fireEvent.click(screen.getByRole('button', { name: 'Global' }));
    expect(onSourceChange).toHaveBeenCalledWith('global');
  });

  it('hides the source filter and labels when only built in prompts are present', () => {
    renderLibrary({
      prompts: [makePrompt({ id: 'a', title: 'Only Built in', path: '../../prompts/a.md', key: '../../prompts/a.md' })],
      showSourceFilter: false,
      sourceOptions: [{ value: 'all', label: 'All' }]
    });

    expect(screen.queryByRole('group', { name: 'Filter by source' })).toBeNull();
    expect(screen.getByRole('button', { name: /^Only Built in/ })).toBeTruthy();
  });

  describe('PromptLibrary favorites controls', () => {
    it('renders sibling controls and never selects a prompt when its star is clicked', () => {
      const selected = vi.fn();
      const toggled = vi.fn();
      renderLibrary({ onSelectPrompt: selected, onToggleFavorite: toggled });
      const star = screen.getByRole('button', { name: 'Add Built in A to favorites (Built in)' });
      fireEvent.click(star);
      expect(toggled).toHaveBeenCalledOnce();
      expect(selected).not.toHaveBeenCalled();
      expect(star.parentElement?.closest('button')).toBeNull();
      expect(star.getAttribute('aria-pressed')).toBe('false');
    });

    it('keeps filter and star state programmatically named and exposes retry after dismissal', () => {
      const filters = vi.fn();
      const retry = vi.fn();
      renderLibrary({
        favoritesOnly: true,
        favoriteState: () => ({ favorite: true, unsaved: true, pending: false }),
        onFavoritesChange: filters,
        onRetryFavorite: retry
      });
      const filter = screen.getByRole('button', { name: 'Favorites' });
      expect(filter.getAttribute('aria-pressed')).toBe('true');
      fireEvent.click(filter);
      expect(filters).toHaveBeenCalledWith(true);
      expect(screen.getAllByText('Not saved')).toHaveLength(2);
      fireEvent.click(screen.getAllByRole('button', { name: 'Retry' })[0]);
      expect(retry).toHaveBeenCalledOnce();
    });

    it('moves focus to a remaining row before unfavoriting hides the focused one', () => {
      renderLibrary({
        favoritesOnly: true,
        favoriteState: () => ({ favorite: true, unsaved: false, pending: false })
      });
      const star = screen.getByRole('button', { name: 'Remove Built in A from favorites (Built in)' });
      star.focus();
      fireEvent.click(star);
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Global B, Global' }));
    });

    it('leaves selection usable while initial favorite storage is loading', () => {
      renderLibrary({ favoritesLoading: true });
      expect(screen.getByRole('button', { name: 'Favorites' }).hasAttribute('disabled')).toBe(true);
      expect(screen.getByRole('button', { name: 'Add Built in A to favorites (Built in)' }).hasAttribute('disabled')).toBe(true);
      expect(screen.getByRole('button', { name: 'Built in A, Built in, selected' }).hasAttribute('disabled')).toBe(false);
    });
  });

  it('reports a filtered summary when filtering only by source', () => {
    renderLibrary({
      prompts: [makePrompt({ id: 'b', title: 'Global B', path: 'b.md', key: 'global:b.md', source: 'global', sourceLabel: 'Global' })],
      sourceFilter: 'global',
      totalPromptCount: 2
    });

    expect(screen.getByRole('status').textContent).toMatch(/01 \/ 02 match/);
  });

  it('places Favorites directly after All in the ordinary navigation group', () => {
    const categories = vi.fn();
    renderLibrary({ categories: ['review', 'writing'], onCategoryChange: categories });
    const navigation = within(screen.getByRole('group', { name: 'Filter prompts' }));
    const buttons = navigation.getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual(['All', 'Favorites', 'review', 'writing']);
    expect(buttons.filter((button) => button.getAttribute('aria-pressed') === 'true')).toEqual([buttons[0]]);
    expect(navigation.getByRole('button', { name: 'Favorites' }).querySelector('svg')).toBeNull();
    fireEvent.click(navigation.getByRole('button', { name: 'writing' }));
    expect(categories).toHaveBeenCalledWith('writing');
  });

  it('does not mark All or a category active while Favorites is active', () => {
    renderLibrary({ favoritesOnly: true, category: 'review' });
    const navigation = within(screen.getByRole('group', { name: 'Filter prompts' }));
    expect(navigation.getAllByRole('button')
      .filter((button) => button.getAttribute('aria-pressed') === 'true')
      .map((button) => button.textContent)).toEqual(['Favorites']);
  });

  it('keeps the result announcement visually hidden without an Index heading', () => {
    renderLibrary({ selectedPromptHidden: true });
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('02 prompts · selection hidden');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('aria-atomic')).toBe('true');
    expect(getComputedStyle(status).position).toBe('absolute');
    expect(getComputedStyle(status).width).toBe('1px');
    expect(getComputedStyle(status).height).toBe('1px');
    expect(getComputedStyle(status).overflow).toBe('hidden');
    expect(screen.queryByText(/Index/)).toBeNull();
  });

  it('keeps source, category, and command metadata but omits row input counts', () => {
    renderLibrary({
      prompts: [makePrompt({
        title: 'Command with inputs',
        category: 'cli',
        kind: 'command',
        variables: [{ name: 'topic', label: 'Topic', required: true }]
      })]
    });
    const row = screen.getByRole('button', { name: 'Command with inputs, Built in, selected' });
    expect(within(row).getByText('Built in — cli — command')).toBeTruthy();
    expect(within(row).queryByText(/\d+ inputs?/)).toBeNull();
  });
});
