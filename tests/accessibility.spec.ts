import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('the default view has no serious or critical accessibility violations', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Summarize Text' })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const summary = blocking.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
  expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
});

test('a selected prompt with inputs and options has no serious or critical violations', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Review Code Changes' }).click();
  await page.getByLabel('changes', { exact: true }).fill('example change');
  await expect(page.getByRole('region', { name: 'Composed prompt' })).toContainText('example change');
  await page.waitForLoadState('networkidle');

  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const summary = blocking.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
  expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
});

test('the copy action is reachable and activatable by keyboard', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Summarize Text' }).click();
  await page.getByLabel('sourceText', { exact: true }).fill('Keyboard reachable content.');

  const copy = page.getByRole('button', { name: 'Copy composed prompt' });
  await copy.focus();
  await expect(copy).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.getByText('Prompt copied.')).toBeVisible();
  const preview = page.getByRole('region', { name: 'Composed prompt' });
  const previewText = (await preview.locator('pre').innerText()).trim();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard.trim()).toBe(previewText);
  expect(clipboard).toContain('Keyboard reachable content.');
});

test('the info tooltip is a button that opens on focus and closes on Escape', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Summarize Text' }).click();

  const info = page.getByRole('button', { name: 'The text to summarize' });
  await info.focus();
  await expect(page.getByRole('tooltip')).toContainText('The text to summarize');

  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
});
