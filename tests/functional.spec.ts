import { test, expect } from '@playwright/test';

// The Windows clipboard normalizes line endings to CRLF on read, so both sides
// are normalized before comparing. The composed text itself is always LF.
const normalizeText = (value: string) => value.replace(/\r\n/g, '\n').trim();
const composerFixture = '/tests/fixtures/composer.html';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /^Review a Pull Request(?:, selected)?$/ })).toBeVisible();
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
    await expect(page.getByRole('button', { name: new RegExp(`^${title}(?:, selected)?$`) })).toBeVisible();
  }
});

test('search filters the prompt index', async ({ page }) => {
  await page.getByLabel('Search prompts').fill('codebase area');
  await expect(page.getByRole('button', { name: 'Explain a Codebase Area', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Review a Pull Request(?:, selected)?$/ })).toHaveCount(0);
});

test('category filter narrows the index', async ({ page }) => {
  await page.getByRole('button', { name: 'code', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Explain a Codebase Area', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refactor Code', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Compare Approaches', exact: true })).toHaveCount(0);
});

test('copy is gated on required fields, then interpolates and copies', async ({ page }) => {
  await page.getByRole('button', { name: 'Refactor Code', exact: true }).click();
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
  await page.getByRole('button', { name: /^Review a Pull Request(?:, selected)?$/ }).click();
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
  await page.getByRole('button', { name: 'Implementation Plan', exact: true }).click();
  const preview = page.getByRole('region', { name: 'Composed prompt' });
  const execution = page.getByLabel('Approved plan execution', { exact: true });

  await expect(execution).toHaveValue('nativeSubagents');
  await expect(preview).toContainText('design implementation waves for native');
  await expect(preview).not.toContainText('design implementation waves for independent Copilot CLI sessions');

  await execution.selectOption('independentSessions');
  await expect(preview).toContainText('Do not launch them while creating this plan.');
  await expect(preview).toContainText('worktree, branch, standalone brief');
  await expect(preview).not.toContainText('design implementation waves for native');
});

test('slider controls select one ordered investigation-depth branch', async ({ page }) => {
  await page.getByRole('button', { name: 'Investigate a Topic', exact: true }).click();
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
  await page.getByRole('button', { name: /^Review a Pull Request(?:, selected)?$/ }).click();
  const preview = page.getByRole('region', { name: 'Composed prompt' });

  await page.getByRole('combobox', { name: 'General model', exact: true }).selectOption('opus-5');
  await page.getByRole('combobox', { name: 'Alternative model', exact: true }).selectOption('gpt-5-6-sol');
  await expect(preview).toContainText(
    'Use Opus 5 1M context medium reasoning as the primary reviewer, and a set of GPT-5.6 Sol 1M context medium reasoning reviewers as independent second opinions.'
  );
});

test('context and reasoning selectors refine the composed model label', async ({ page }) => {
  await page.getByRole('button', { name: /^Review a Pull Request(?:, selected)?$/ }).click();
  const preview = page.getByRole('region', { name: 'Composed prompt' });

  await page.getByRole('combobox', { name: 'General model', exact: true }).selectOption('gpt-5-6-terra');
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
  await page.getByRole('button', { name: 'Summarize Branch Diff', exact: true }).click();
  const preview = page.getByRole('region', { name: 'Composed command' });
  await expect(preview).toContainText('git --no-pager log --oneline --no-merges origin/main..HEAD');
  await expect(page.getByRole('button', { name: 'Copy command' })).toBeEnabled();
});

test.describe('Wave 1A composer fixture', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(composerFixture);
    await expect(page.getByRole('heading', { name: 'Wave 1A Composer Fixture' })).toBeVisible();
  });

  test('renders workflow, focus, model guidance, and context in order', async ({ page }) => {
    const sections = page.locator('aside[aria-label="Prompt inputs"] > section > span:first-child');
    await expect(sections).toHaveText(['Workflow', 'Focus areas', 'Model guidance', 'Context']);

    await expect(page.getByLabel('Purpose', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Delivery workflow', { exact: true })).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Analysis depth' })).toBeVisible();
    await expect(page.getByLabel('Technical scope', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Topology', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Execution', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Intent')).toBeVisible();
    await expect(page.getByLabel('Technical notes')).toBeVisible();
    await expect(page.getByText('Copied as', { exact: false })).toHaveCount(0);
    await expect(page.getByText(/routing/i)).toHaveCount(0);
  });

  test('hides inapplicable controls and clears unavailable checked options', async ({ page }) => {
    const preview = page.getByRole('region', { name: 'Composed prompt' });
    const scope = page.getByLabel('Technical scope', { exact: true });
    const mockups = page.getByRole('checkbox', { name: 'UI mockups and recovery-state interactions' });
    const stateDiagram = page.getByRole('checkbox', { name: 'State diagram' });

    await expect(mockups).toBeChecked();
    await expect(stateDiagram).toBeDisabled();
    await expect(stateDiagram).not.toBeChecked();
    await expect(stateDiagram).toHaveAccessibleDescription('Available when Analysis depth is Deep.');
    await expect(page.locator('[data-option-control="stateDiagram"]').getByText('Available when Analysis depth is Deep.')).toHaveCSS('clip', 'rect(0px, 0px, 0px, 0px)');
    await expect(page.locator('[data-option-control="stateDiagram"]').getByRole('button', { name: 'About State diagram' })).toHaveCount(1);

    await scope.selectOption('backend');
    await expect(mockups).toBeDisabled();
    await expect(mockups).not.toBeChecked();
    await expect(mockups).toHaveAccessibleDescription('Available when Technical scope is Frontend or Full-stack.');
    const mockupOption = page.locator('[data-option-control="uiMockups"]');
    await expect(mockupOption.getByText('Available when Technical scope is Frontend or Full-stack.')).toHaveCSS('clip', 'rect(0px, 0px, 0px, 0px)');
    await expect(mockupOption.getByRole('button', { name: 'About UI mockups and recovery-state interactions' })).toHaveCount(1);
    await expect(preview).not.toContainText('Include UI mockups.');

    await scope.selectOption('fullStack');
    await expect(mockups).toBeEnabled();
    await expect(mockups).not.toBeChecked();
    await mockups.check({ force: true });
    await expect(preview).toContainText('Include UI mockups.');

    await page.getByLabel('Purpose', { exact: true }).selectOption('general');
    await expect(page.getByLabel('Technical scope', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Delivery workflow', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Topology', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Execution', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: 'UI mockups and recovery-state interactions' })).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: 'General summary' })).toBeVisible();
    await expect(page.getByLabel('Technical notes')).toHaveCount(0);
    await expect(page.getByLabel('Intent')).toBeVisible();
  });

  test('shows active prompt-specific model roles and preserves independent selections', async ({ page }) => {
    const preview = page.getByRole('region', { name: 'Composed prompt' });
    const general = page.getByRole('combobox', { name: 'General model', exact: true });
    const alternative = page.getByRole('combobox', { name: 'Alternative model', exact: true });
    const executionCard = page.locator('[data-model-card]').filter({ hasText: 'Approved execution model' });
    const reviewCard = page.locator('[data-model-card]').filter({ hasText: 'Planning and review model' });

    await expect(executionCard.getByText('Used by approved implementation workers.')).toHaveCSS('clip', 'rect(0px, 0px, 0px, 0px)');
    await expect(reviewCard.getByText('Used by reviewers that critique execution waves.')).toHaveCSS('clip', 'rect(0px, 0px, 0px, 0px)');
    await expect(executionCard).toHaveAccessibleDescription('Used by approved implementation workers.');
    await expect(reviewCard).toHaveAccessibleDescription('Used by reviewers that critique execution waves.');

    await general.selectOption('opus-5');
    await alternative.selectOption('gpt-5-6-sol');
    await page.getByLabel('General context').selectOption('standard');
    await page.getByRole('slider', { name: 'Alternative reasoning' }).press('End');
    await expect(preview).toContainText('Use Opus 5 medium reasoning for approved implementation work.');
    await expect(preview).toContainText('Use GPT-5.6 Sol 1M context high reasoning to review full-stack integration.');

    await page.getByLabel('Technical scope', { exact: true }).selectOption('backend');
    await expect(page.getByRole('combobox', { name: 'General model', exact: true })).toHaveValue('opus-5');
    await expect(page.getByRole('combobox', { name: 'Alternative model', exact: true })).toHaveCount(0);

    await page.getByLabel('Technical scope', { exact: true }).selectOption('fullStack');
    await expect(page.getByRole('combobox', { name: 'General model', exact: true })).toHaveValue('opus-5');
    await expect(page.getByRole('combobox', { name: 'Alternative model', exact: true })).toHaveValue('gpt-5-6-sol');

    await page.getByLabel('Purpose', { exact: true }).selectOption('general');
    await expect(page.getByText('Model guidance', { exact: true })).toHaveCount(0);
  });
});
