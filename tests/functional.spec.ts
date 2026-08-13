import { test, expect } from '@playwright/test';

// The Windows clipboard normalizes line endings to CRLF on read, so both sides
// are normalized before comparing. The composed text itself is always LF.
const normalizeText = (value: string) => value.replace(/\r\n/g, '\n').trim();

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Review a Pull Request' })).toBeVisible();
});

test('loads the twelve neutral prompts', async ({ page }) => {
  const titles = [
    'Review a Pull Request',
    'Review Working Tree Changes',
    'Implementation Plan',
    'Investigate a Topic',
    'Find the Root Cause',
    'Explain a Codebase Area',
    'Refactor Code',
    'Compare Approaches',
    'Rewrite for Clarity',
    'Summarize a Source',
    'New Worktree',
    'Summarize Branch Diff'
  ];
  for (const title of titles) {
    await expect(page.getByRole('button', { name: title })).toBeVisible();
  }
});

test('search filters the prompt index', async ({ page }) => {
  await page.getByLabel('Search prompts').fill('codebase area');
  await expect(page.getByRole('button', { name: 'Explain a Codebase Area' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review a Pull Request' })).toHaveCount(0);
});

test('category filter narrows the index', async ({ page }) => {
  await page.getByRole('button', { name: 'code', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Explain a Codebase Area' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refactor Code' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Compare Approaches' })).toHaveCount(0);
});

test('copy is gated on required fields, then interpolates and copies', async ({ page }) => {
  await page.getByRole('button', { name: 'Refactor Code' }).click();
  const copy = page.getByRole('button', { name: 'Copy composed prompt' });
  await expect(copy).toBeDisabled();
  await expect(page.getByText('Copy disabled')).toBeVisible();

  const sentinel = 'A distinctive sentinel sentence.';
  await page.getByLabel('target', { exact: true }).fill(sentinel);
  await page.getByLabel('outcome', { exact: true }).fill('Make it easier to follow.');

  const preview = page.getByRole('region', { name: 'Composed prompt' });
  await expect(preview).toContainText(sentinel);
  await expect(preview).toContainText('Preserve all observable behavior and every public interface.');
  await expect(copy).toBeEnabled();

  await copy.click();
  await expect(page.getByText('Prompt copied.')).toBeVisible();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  const previewText = (await preview.locator('pre').innerText()).trim();
  expect(normalizeText(clipboard)).toBe(normalizeText(previewText));
  expect(clipboard).toContain(sentinel);
});

test('optional focus blocks include, exclude, and fall back', async ({ page }) => {
  await page.getByRole('button', { name: 'Review a Pull Request' }).click();
  const preview = page.getByRole('region', { name: 'Composed prompt' });
  const fallback = 'General readiness: correctness, clarity, tests, and anything that would block a merge.';

  await expect(preview).toContainText('Correctness: logic errors');
  await expect(preview).toContainText('Security: input validation');
  await expect(preview).not.toContainText('Frontend: UI behavior');
  await expect(preview).not.toContainText(fallback);

  await page.getByRole('checkbox', { name: 'Frontend' }).check({ force: true });
  await expect(preview).toContainText('Frontend: UI behavior');

  await page.getByRole('checkbox', { name: 'Frontend' }).uncheck({ force: true });
  await page.getByRole('checkbox', { name: 'Correctness' }).uncheck({ force: true });
  await expect(preview).not.toContainText('Correctness: logic errors');
  await expect(preview).toContainText('Security: input validation');
  await expect(preview).not.toContainText(fallback);

  await page.getByRole('checkbox', { name: 'Security' }).uncheck({ force: true });
  await expect(preview).not.toContainText('Correctness: logic errors');
  await expect(preview).not.toContainText('Security: input validation');
  await expect(preview).toContainText(fallback);
});

test('select controls switch exclusive implementation-plan branches', async ({ page }) => {
  await page.getByRole('button', { name: 'Implementation Plan' }).click();
  const preview = page.getByRole('region', { name: 'Composed prompt' });
  const execution = page.getByLabel('Approved plan execution');

  await expect(execution).toHaveValue('nativeSubagents');
  await expect(preview).toContainText('design implementation waves for native');
  await expect(preview).not.toContainText('design implementation waves for independent Copilot CLI sessions');

  await execution.selectOption('independentSessions');
  await expect(preview).toContainText('Do not launch them while creating this plan.');
  await expect(preview).toContainText('worktree, branch, standalone brief');
  await expect(preview).not.toContainText('design implementation waves for native');
});

test('slider controls select one ordered investigation-depth branch', async ({ page }) => {
  await page.getByRole('button', { name: 'Investigate a Topic' }).click();
  const preview = page.getByRole('region', { name: 'Composed prompt' });
  const depth = page.getByRole('slider', { name: 'Analysis depth' });

  await expect(depth).toHaveAttribute('aria-valuetext', 'Focused');
  await expect(preview).toContainText('trace the relevant implementation paths');

  await depth.press('Home');
  await expect(depth).toHaveAttribute('aria-valuetext', 'Brief');
  await expect(preview).toContainText('inspect the minimum evidence needed');
  await expect(preview).not.toContainText('trace the relevant implementation paths');

  await depth.press('End');
  await expect(depth).toHaveAttribute('aria-valuetext', 'Deep');
  await expect(preview).toContainText('follow the topic across subsystem boundaries');
});

test('both model selectors insert the chosen preset labels', async ({ page }) => {
  await page.getByRole('button', { name: 'Review a Pull Request' }).click();
  const preview = page.getByRole('region', { name: 'Composed prompt' });

  await page.getByLabel('General model').selectOption('opus-5');
  await page.getByLabel('Alternative model').selectOption('gpt-5-6-sol');
  await expect(preview).toContainText(
    'Use Opus 5 1M context medium reasoning as the primary reviewer, and a set of GPT-5.6 Sol 1M context medium reasoning reviewers as independent second opinions.'
  );
});

test('context and reasoning selectors refine the composed model label', async ({ page }) => {
  await page.getByRole('button', { name: 'Review a Pull Request' }).click();
  const preview = page.getByRole('region', { name: 'Composed prompt' });

  await page.getByLabel('General model').selectOption('gpt-5-6-terra');
  await page.getByLabel('General context').selectOption('1m');
  const reasoning = page.getByRole('slider', { name: 'General reasoning' });
  await reasoning.press('End');
  await expect(preview).toContainText('Use GPT-5.6 Terra 1M context max reasoning as the primary reviewer');

  await page.getByLabel('General context').selectOption('standard');
  await expect(preview).toContainText('Use GPT-5.6 Terra max reasoning as the primary reviewer');

  await reasoning.press('Home');
  await expect(preview).toContainText('Use GPT-5.6 Terra no reasoning as the primary reviewer');
});

test('command prompts copy a shell ready command', async ({ page }) => {
  await page.getByRole('button', { name: 'Summarize Branch Diff' }).click();
  const preview = page.getByRole('region', { name: 'Composed command' });
  await expect(preview).toContainText('git --no-pager log --oneline --no-merges origin/main..HEAD');
  await expect(page.getByRole('button', { name: 'Copy command' })).toBeEnabled();
});
