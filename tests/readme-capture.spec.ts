import { test, expect, type Page } from '@playwright/test';

async function prepareReadmeDemo(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/');
  await page.getByRole('button', {
    name: 'Add Investigate a Topic to favorites (Built in)', exact: true
  }).click();
  await page.getByRole('button', {
    name: 'Add Find the Root Cause to favorites (Built in)', exact: true
  }).click();
  await page.getByRole('button', { name: 'Favorites', exact: true }).click();
  await page.getByRole('button', { name: 'Investigate a Topic', exact: true }).click();
  await page.getByLabel('Technical scope', { exact: true }).selectOption('fullStack');
  await page.getByRole('slider', { name: 'Analysis depth', exact: true }).focus();
  await page.getByRole('slider', { name: 'Analysis depth', exact: true }).press('End');
  for (const name of ['Parallel agents', 'System architecture', 'Data flow and trust boundaries']) {
    const checkbox = page.getByRole('checkbox', { name, exact: true });
    if (!await checkbox.isChecked()) {
      await checkbox.focus();
      await checkbox.press('Space');
    }
    await expect(checkbox).toBeChecked();
  }
  await page.getByRole('combobox', { name: 'Investigation model', exact: true })
    .selectOption('gpt-6-1-sol');
  await page.getByLabel('intent', { exact: true })
    .fill('Investigate the delivery pipeline and identify the smallest reliable improvements.');
  await expect(page.getByRole('button', {
    name: 'Remove Investigate a Topic from favorites (Built in)', exact: true
  })).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('[data-preview-text]')).toContainText('Design scope');
  await expect(page.locator('[data-marker-hit-target]').first()).toBeVisible();
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.mouse.move(1400, 10);
  await page.getByRole('heading', { name: 'Investigate a Topic', exact: true }).click();
}

test('captures a bundled-only public README demo in an isolated context', async ({ page, baseURL }, testInfo) => {
  if (!baseURL) throw new Error('README capture requires the configured local Playwright server.');
  const origin = new URL(baseURL).origin;
  const external: string[] = [];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) {
      external.push(url.origin);
      await route.abort();
    } else {
      await route.continue();
    }
  });
  await prepareReadmeDemo(page);
  const stored = await page.evaluate(() => localStorage.getItem('prompt-bank.favorites.v1'));
  expect(JSON.parse(stored ?? 'null')).toEqual({
    version: 1,
    favorites: [
      { source: 'builtin', workspaceId: null, promptId: 'find-the-root-cause' },
      { source: 'builtin', workspaceId: null, promptId: 'investigate-a-topic' }
    ]
  });
  await expect(page.getByRole('region', { name: 'Prompt library' }).locator('[data-prompt-select]'))
    .toHaveCount(2);
  await expect(page.getByRole('combobox', { name: 'Investigation model', exact: true }))
    .toHaveValue('gpt-6-1-sol');
  expect(external).toEqual([]);
  await page.screenshot({
    path: process.env.PROMPT_BANK_README_CAPTURE ?? testInfo.outputPath('readme-demo.png'),
    type: 'png', animations: 'disabled', fullPage: true
  });
});
