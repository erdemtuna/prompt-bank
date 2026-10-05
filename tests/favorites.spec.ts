import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const key = 'prompt-bank.favorites.v1';
const investigate = 'Investigate a Topic';
const add = `Add ${investigate} to favorites (Built in)`;
const remove = `Remove ${investigate} from favorites (Built in)`;

test('favorites persist after reload without remembering composition inputs', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: add, exact: true })).toBeEnabled();
  await page.getByRole('button', { name: investigate, exact: true }).click();
  const initialIntent = await page.getByLabel('intent', { exact: true }).inputValue();
  await page.getByLabel('intent', { exact: true }).fill('Session-only input.');
  await page.getByRole('button', { name: add, exact: true }).click();
  await expect(page.getByRole('button', { name: remove, exact: true })).toHaveAttribute('aria-busy', 'false');
  const stored = await page.evaluate((key) => localStorage.getItem(key), key);
  expect(stored).toBe('{"version":1,"favorites":[{"source":"builtin","workspaceId":null,"promptId":"investigate-a-topic"}]}');
  expect(stored).not.toContain('Session-only');
  await page.reload();
  await expect(page.getByRole('button', { name: remove, exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Favorites', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Prompt library' }).locator('[data-prompt-select]')).toHaveCount(1);
  await page.getByRole('button', { name: investigate, exact: true }).click();
  await expect(page.getByLabel('intent', { exact: true })).toHaveValue(initialIntent);
});

test('starring another prompt and filtering do not change the selected composer or text', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: investigate, exact: true }).click();
  await page.getByLabel('intent', { exact: true }).fill('Keep this exact topic.');
  const preview = page.locator('[data-preview-text]');
  const text = await preview.textContent();
  await page.getByRole('button', { name: 'Add Find the Root Cause to favorites (Built in)', exact: true }).click();
  await page.getByRole('button', { name: 'Favorites', exact: true }).click();
  await expect(page.getByRole('heading', { name: investigate, exact: true })).toBeVisible();
  await expect(page.getByText('Hidden by filters', { exact: true })).toBeVisible();
  await expect(preview).toHaveText(text ?? '');
  await page.getByRole('button', { name: 'Show selected', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Favorites', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByLabel('intent', { exact: true })).toHaveValue('Keep this exact topic.');
});

test('a failed favorite shows a persistent bottom-left overlay without shifting the composer', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('Storage full.', 'QuotaExceededError');
      return original.call(this, name, value);
    };
  }, key);
  await page.goto('/');
  await page.getByRole('button', { name: investigate, exact: true }).click();
  await page.getByLabel('intent', { exact: true }).fill('Keep this prompt.');
  const preview = page.locator('[data-preview-text]');
  const text = await preview.textContent();
  const mainBefore = await page.locator('main').boundingBox();
  const previewBefore = await page.getByRole('region', { name: 'Composed prompt' }).boundingBox();
  await page.getByRole('button', { name: add, exact: true }).click();
  await expect(page.getByText('Favorite change not saved', { exact: true })).toBeVisible();
  const toast = page.locator('.fui-Toast').filter({ hasText: 'Favorite change not saved' });
  const box = await toast.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect(box?.x).toBeLessThan(40);
  expect(box?.width).toBeLessThanOrEqual(361);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThan(800);
  expect(await page.locator('main').boundingBox()).toEqual(mainBefore);
  expect(await page.getByRole('region', { name: 'Composed prompt' }).boundingBox()).toEqual(previewBefore);
  await expect(preview).toHaveText(text ?? '');
  await page.waitForTimeout(3500);
  await expect(page.getByText('Favorite change not saved', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss favorite notification', exact: true }).click();
  await expect(page.getByText('Favorite change not saved', { exact: true })).toBeHidden();
  await expect(page.getByText('Not saved', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBeNull();
});

test('keyboard unfavorite keeps focus usable when the last matching row disappears', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: add, exact: true }).click();
  await expect(page.getByRole('button', { name: remove, exact: true })).toHaveAttribute('aria-busy', 'false');
  const filter = page.getByRole('button', { name: 'Favorites', exact: true });
  await filter.click();
  await page.getByRole('button', { name: remove, exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(filter).toBeFocused();
  await expect(page.getByText('No prompts match the current filters.', { exact: true })).toBeVisible();
  const violations = (await new AxeBuilder({ page }).analyze()).violations;
  expect(violations).toEqual([]);
});

test('new model choices expose only their advertised reasoning levels', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: investigate, exact: true }).click();
  const model = page.getByRole('combobox', { name: 'Investigation model', exact: true });
  await model.selectOption('gpt-6-astra');
  const effort = page.getByRole('combobox', { name: 'Investigation model reasoning', exact: true });
  expect(await effort.locator('option').evaluateAll((options) => options.map((option) => option.getAttribute('value'))))
    .toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
  await model.selectOption('gpt-6-1-sol');
  expect(await effort.locator('option').evaluateAll((options) => options.map((option) => option.getAttribute('value'))))
    .toEqual(['none', 'low', 'medium', 'high', 'xhigh', 'max']);
});

test('dismissed temporary favorites can be retried after storage recovers', async ({ page }) => {
  await page.addInitScript((key) => {
    const original = Storage.prototype.setItem;
    let denied = true;
    window.addEventListener('favorites-storage-restored', () => { denied = false; });
    Storage.prototype.setItem = function (name, value) {
      if (name === key && denied) throw new DOMException('Denied.', 'SecurityError');
      return original.call(this, name, value);
    };
  }, key);
  await page.goto('/');
  await page.getByRole('button', { name: add, exact: true }).click();
  await expect(page.getByText('Favorite change not saved', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss favorite notification' }).click();
  await expect(page.getByText('Favorite change not saved', { exact: true })).toBeHidden();
  await page.evaluate(() => window.dispatchEvent(new Event('favorites-storage-restored')));
  await page.getByRole('region', { name: 'Prompt library' }).getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText('Not saved', { exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: remove, exact: true })).toHaveAttribute('aria-busy', 'false');
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), key))
    .toEqual({ version: 1, favorites: [{ source: 'builtin', workspaceId: null, promptId: 'investigate-a-topic' }] });
});

test('a corrupt store is preserved and never replaced by a temporary star', async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, '{"version":2,"futureData":true}'), key);
  await page.goto('/');
  await expect(page.getByText('Favorites unavailable', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: add, exact: true }).click();
  await expect(page.getByText('Not saved', { exact: true })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe('{"version":2,"futureData":true}');
});
