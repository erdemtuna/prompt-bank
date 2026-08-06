import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// The Windows clipboard normalizes line endings to CRLF on read, so both sides
// are normalized before comparing. The composed text itself is always LF.
const normalizeText = (value: string) => value.replace(/\r\n/g, '\n').trim();

test('the default view has no serious or critical accessibility violations', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Rewrite for Clarity' })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const summary = blocking.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
  expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
});

test('a selected prompt with inputs and options has no serious or critical violations', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Review a Pull Request' }).click();
  await page.getByLabel('pullRequest', { exact: true }).fill('example change');
  await expect(page.getByRole('region', { name: 'Composed prompt' })).toContainText('example change');
  await page.waitForLoadState('networkidle');

  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const summary = blocking.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
  expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
});

test('the copy action is reachable and activatable by keyboard', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Rewrite for Clarity' }).click();
  await page.getByLabel('draft', { exact: true }).fill('Keyboard reachable content.');

  const copy = page.getByRole('button', { name: 'Copy composed prompt' });
  await copy.focus();
  await expect(copy).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.getByText('Prompt copied.')).toBeVisible();
  const preview = page.getByRole('region', { name: 'Composed prompt' });
  const previewText = (await preview.locator('pre').innerText()).trim();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(normalizeText(clipboard)).toBe(normalizeText(previewText));
  expect(clipboard).toContain('Keyboard reachable content.');
});

test('the info tooltip is a button that opens on focus and closes on Escape', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Rewrite for Clarity' }).click();

  const info = page.getByRole('button', { name: 'The text to rewrite' });
  await info.focus();
  await expect(page.getByRole('tooltip')).toContainText('The text to rewrite');

  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
});
