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
    expect(screen.getByRole('button', { name: /Only Built in/ })).toBeTruthy();
  });

  it('reports a filtered summary when filtering only by source', () => {
    renderLibrary({
      prompts: [makePrompt({ id: 'b', title: 'Global B', path: 'b.md', key: 'global:b.md', source: 'global', sourceLabel: 'Global' })],
      sourceFilter: 'global',
      totalPromptCount: 2
    });

    expect(screen.getByRole('status').textContent).toMatch(/01 \/ 02 match/);
  });
});
