// @vitest-environment jsdom
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FavoriteFailure } from '../data/favoritesController';
import { FavoritesFeedback } from './FavoritesFeedback';

afterEach(cleanup);
const failure: FavoriteFailure = {
  id: 'save:1', key: 'test', title: 'Favorite change not saved',
  message: 'Test is starred only in this session.'
};

describe('favorite overlay feedback', () => {
  it('renders through the portal without taking focus and leaves retry/dismiss explicit', async () => {
    const retry = vi.fn(async () => {});
    const dismiss = vi.fn();
    const { container } = render(
      <FluentProvider theme={webLightTheme}>
        <input aria-label="Keep focus" />
        <FavoritesFeedback failures={[]} onRetry={retry} onDismiss={dismiss} />
      </FluentProvider>
    );
    const input = screen.getByLabelText('Keep focus');
    input.focus();
    const view = render(
      <FluentProvider theme={webLightTheme}>
        <FavoritesFeedback failures={[failure]} onRetry={retry} onDismiss={dismiss} />
      </FluentProvider>
    );
    await waitFor(() => expect(screen.getByText('Favorite change not saved')).toBeTruthy());
    expect(document.activeElement).toBe(input);
    expect(view.container.querySelector('.fui-Toast')).toBeNull();
    expect(container.querySelector('.fui-Toast')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledWith('test');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss favorite notification' }));
    expect(dismiss).toHaveBeenCalledWith(failure);
  });
});
