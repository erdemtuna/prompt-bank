import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Summarize Text' })).toBeVisible();
});

test('loads the seven neutral prompts', async ({ page }) => {
  const titles = ['Summarize Text', 'Explain Code', 'Refactor Code', 'Review Code Changes', 'Plan a Task', 'Compare Approaches', 'Inspect Git Status'];
  for (const title of titles) {
    await expect(page.getByRole('button', { name: title })).toBeVisible();
  }
});

test('search filters the prompt index', async ({ page }) => {
  await page.getByLabel('Search prompts').fill('explain');
  await expect(page.getByRole('button', { name: 'Explain Code' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Summarize Text' })).toHaveCount(0);
});

test('category filter narrows the index', async ({ page }) => {
  await page.getByRole('button', { name: 'code', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Explain Code' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refactor Code' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Compare Approaches' })).toHaveCount(0);
});

test('copy is gated on required fields, then interpolates and copies', async ({ page }) => {
  await page.getByRole('button', { name: 'Summarize Text' }).click();
  const copy = page.getByRole('button', { name: 'Copy composed prompt' });
  await expect(copy).toBeDisabled();
  await expect(page.getByText('Copy disabled')).toBeVisible();

  const sentinel = 'A distinctive sentinel sentence.';
  await page.getByLabel('sourceText', { exact: true }).fill(sentinel);

  const preview = page.getByRole('region', { name: 'Composed prompt' });
  await expect(preview).toContainText(sentinel);
  await expect(preview).toContainText('a general reader');
  await expect(copy).toBeEnabled();

  await copy.click();
  await expect(page.getByText('Prompt copied.')).toBeVisible();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  const previewText = (await preview.locator('pre').innerText()).trim();
  expect(clipboard.trim()).toBe(previewText);
  expect(clipboard).toContain(sentinel);
});

test('optional focus blocks include, exclude, and fall back', async ({ page }) => {
  await page.getByRole('button', { name: 'Review Code Changes' }).click();
  const preview = page.getByRole('region', { name: 'Composed prompt' });
  const fallback = 'Do a general review across correctness, security, and readability.';

  await expect(preview).toContainText('Check correctness');
  await expect(preview).toContainText('Check security');
  await expect(preview).toContainText('Check accessibility');
  await expect(preview).not.toContainText(fallback);

  await page.getByRole('checkbox', { name: 'Correctness' }).uncheck({ force: true });
  await expect(preview).not.toContainText('Check correctness');
  await expect(preview).toContainText('Check security');
  await expect(preview).not.toContainText(fallback);

  await page.getByRole('checkbox', { name: 'Security' }).uncheck({ force: true });
  await page.getByRole('checkbox', { name: 'Accessibility' }).uncheck({ force: true });
  await expect(preview).not.toContainText('Check correctness');
  await expect(preview).not.toContainText('Check security');
  await expect(preview).not.toContainText('Check accessibility');
  await expect(preview).toContainText(fallback);
});

test('both model selectors insert the chosen preset labels', async ({ page }) => {
  await page.getByRole('button', { name: 'Review Code Changes' }).click();
  const preview = page.getByRole('region', { name: 'Composed prompt' });

  await page.getByLabel('General model').selectOption('opus-4-8');
  await page.getByLabel('Alternative model').selectOption('gpt-5-6-sol');
  await expect(preview).toContainText('Use Opus 4.8 extra high reasoning as the primary reviewer and GPT-5.6 Sol extra high reasoning as an independent second reviewer.');
});

test('command prompts copy a shell ready command', async ({ page }) => {
  await page.getByRole('button', { name: 'Inspect Git Status' }).click();
  const preview = page.getByRole('region', { name: 'Composed command' });
  await expect(preview).toContainText('git status --short --branch');
  await expect(page.getByRole('button', { name: 'Copy command' })).toBeEnabled();
});
