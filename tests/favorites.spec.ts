import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const key = 'prompt-bank.favorites.v1';
const investigate = 'Investigate a Topic';
const add = `Add ${investigate} to favorites (Built in)`;
const remove = `Remove ${investigate} from favorites (Built in)`;

async function addFavorite(page: Page, title = investigate) {
  const action = page.getByRole('button', { name: `Add ${title} to favorites (Built in)`, exact: true });
  await action.locator('..').hover();
  await action.click();
}

test('favorites persist after reload without remembering composition inputs', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: add, exact: true })).toBeEnabled();
  await page.getByRole('button', { name: investigate, exact: true }).click();
  const initialIntent = await page.getByLabel('intent', { exact: true }).inputValue();
  await page.getByLabel('intent', { exact: true }).fill('Session-only input.');
  await addFavorite(page);
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
  await addFavorite(page, 'Find the Root Cause');
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
  await addFavorite(page);
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
  await addFavorite(page);
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
  await addFavorite(page);
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
  await addFavorite(page);
  await expect(page.getByText('Not saved', { exact: true })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe('{"version":2,"futureData":true}');
});

test('All, Favorites, and categories form exclusive navigation without resetting search', async ({ page }) => {
  await page.goto('/');
  await addFavorite(page);
  await addFavorite(page, 'Find the Root Cause');
  const library = page.getByRole('region', { name: 'Prompt library' });
  const navigation = library.getByRole('group', { name: 'Filter prompts' });
  expect((await navigation.getByRole('button').allTextContents()).slice(0, 3)).toEqual(['All', 'Favorites', 'review']);
  await navigation.getByRole('button', { name: 'code', exact: true }).click();
  await expect(library.locator('[data-prompt-select]')).toHaveCount(2);
  await navigation.getByRole('button', { name: 'Favorites', exact: true }).click();
  await expect(library.locator('[data-prompt-select]')).toHaveCount(2);
  await expect(library.getByRole('button', { name: investigate, exact: true })).toBeVisible();
  await expect(library.getByRole('button', { name: 'Find the Root Cause', exact: true })).toBeVisible();
  await navigation.getByRole('button', { name: 'Favorites', exact: true }).click();
  await expect(navigation.locator('button[aria-pressed="true"]')).toHaveText('Favorites');
  await expect(library.locator('[data-prompt-select]')).toHaveCount(2);
  await library.getByRole('textbox', { name: 'Search prompts' }).fill('root cause');
  for (const name of ['debugging', 'Favorites', 'All']) {
    await navigation.getByRole('button', { name, exact: true }).click();
    await expect(navigation.locator('button[aria-pressed="true"]')).toHaveText(name);
    await expect(library.getByRole('textbox', { name: 'Search prompts' })).toHaveValue('root cause');
    await expect(library.locator('[data-prompt-select]')).toHaveCount(1);
  }
});

test('outline stars reveal on row hover and keyboard focus without shifting titles', async ({ page }) => {
  await page.goto('/');
  expect(await page.evaluate(() => matchMedia('(hover: hover)').matches)).toBe(true);
  const library = page.getByRole('region', { name: 'Prompt library' });
  const selectedStar = library.getByRole('button', { name: 'Add Review a Pull Request to favorites (Built in)', exact: true });
  const star = library.getByRole('button', { name: add, exact: true });
  const select = library.locator('[data-prompt-select]').filter({ hasText: investigate });
  const row = select.locator('..');
  const search = library.getByRole('textbox', { name: 'Search prompts' });
  await search.click();
  await expect(selectedStar).toHaveCSS('opacity', '0');
  await expect(star).toHaveCSS('opacity', '0');
  await expect(star).toHaveCSS('pointer-events', 'none');
  const before = await select.boundingBox();
  await row.hover();
  await expect(star).toHaveCSS('opacity', '1');
  expect(await select.boundingBox()).toEqual(before);
  await page.mouse.move(1400, 10);
  await expect(star).toHaveCSS('opacity', '0');
  await select.click();
  await search.click();
  await expect(select).toHaveAttribute('aria-pressed', 'true');
  await expect(star).toHaveCSS('opacity', '0');
  await select.focus();
  await expect(star).toHaveCSS('opacity', '1');
  await page.keyboard.press('Tab');
  await expect(star).toBeFocused();
  await page.keyboard.press('Space');
  const filled = library.getByRole('button', { name: remove, exact: true });
  await expect(filled).toHaveAttribute('aria-busy', 'false');
  await search.click();
  await expect(filled).toHaveCSS('opacity', '1');
  expect(await select.boundingBox()).toEqual(before);
  await expect(selectedStar).toHaveCSS('opacity', '0');
});

test('library metadata omits visible counts while preserving result announcements and command labels', async ({ page }) => {
  await page.goto('/');
  const library = page.getByRole('region', { name: 'Prompt library' });
  const status = library.getByRole('status');
  await expect(status).toHaveText('12 prompts');
  await expect(status).toHaveCSS('clip', 'rect(0px, 0px, 0px, 0px)');
  await expect(status).toHaveCSS('position', 'absolute');
  await expect(library.getByText(/Index/)).toHaveCount(0);
  await expect(library.locator('[data-prompt-select]').filter({ hasText: /\d+ inputs?/i })).toHaveCount(0);
  await expect(library.getByRole('button', { name: 'New Worktree', exact: true })).toContainText('cli — command');
  await expect(page.locator('header')).toContainText('12 Prompts');
  await expect(page.getByRole('region', { name: 'Prompt workspace' })).toContainText('2 inputs');
  await library.getByRole('textbox', { name: 'Search prompts' }).fill('codebase area');
  await expect(status).toHaveText('01 / 12 match · selection hidden');
  await expect(page.getByText('Hidden by filters', { exact: true })).toBeVisible();
});

test.describe('touch favorite actions', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('tapping a row reveals only its outline star while filled stars remain visible', async ({ page }) => {
    await page.goto('/');
    expect(await page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(true);
    const library = page.getByRole('region', { name: 'Prompt library' });
    const star = library.getByRole('button', { name: add, exact: true });
    const otherStar = library.getByRole('button', { name: 'Add Find the Root Cause to favorites (Built in)', exact: true });
    await expect(star).toHaveCSS('opacity', '0');
    await expect(otherStar).toHaveCSS('opacity', '0');
    await library.getByRole('button', { name: investigate, exact: true }).tap();
    await expect(star).toHaveCSS('opacity', '1');
    await expect(otherStar).toHaveCSS('opacity', '0');
    await library.getByRole('button', { name: 'Find the Root Cause', exact: true }).tap();
    await expect(star).toHaveCSS('opacity', '0');
    await expect(otherStar).toHaveCSS('opacity', '1');
    await library.getByRole('button', { name: investigate, exact: true }).tap();
    await star.tap();
    const filled = library.getByRole('button', { name: remove, exact: true });
    await expect(filled).toHaveAttribute('aria-busy', 'false');
    await library.getByRole('button', { name: 'Find the Root Cause', exact: true }).tap();
    await expect(otherStar).toHaveCSS('opacity', '1');
    await expect(filled).toHaveCSS('opacity', '1');
    await otherStar.tap();
    await expect(library.getByRole('button', { name: 'Remove Find the Root Cause from favorites (Built in)', exact: true }))
      .toHaveAttribute('aria-busy', 'false');
    await filled.tap();
    await expect(star).toHaveCSS('opacity', '1');
    await library.getByRole('textbox', { name: 'Search prompts' }).tap();
    await expect(star).toHaveCSS('opacity', '0');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});
