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
  await expect(preview).toContainText('Approved execution — native subagents:');
  await expect(preview).toContainText('One worker is allowed.');
  await expect(preview).not.toContainText("Keep each session's brief");

  await execution.selectOption('independentSessions');
  await expect(preview).toContainText('do not launch them while planning');
  await expect(preview).toContainText("Keep each session's brief, scope, Done when, branch/worktree");
  await expect(preview).not.toContainText('One worker is allowed.');
  const executionMarker = preview.locator(
    '[data-marker-hit-target][aria-label*="Changed by Approved plan execution:"]'
  ).first();
  await executionMarker.focus();
  await expect(page.getByRole('tooltip')).toContainText('Changed by Approved plan execution:');
});

test('pull request delivery is off by default and composes only when checked', async ({ page }) => {
  await page.getByRole('button', { name: 'Implementation Plan', exact: true }).click();
  const preview = page.getByRole('region', { name: 'Composed prompt' });
  const pullRequestDelivery = page.getByRole('checkbox', { name: 'Pull request delivery' });

  await expect(pullRequestDelivery).not.toBeChecked();
  await expect(preview).not.toContainText('create the required pull requests');
  await expect(preview).not.toContainText('regression-preventing test evidence');

  await pullRequestDelivery.check({ force: true });
  await expect(preview).toContainText('create the required pull requests');
  await expect(preview).toContainText('put regression-preventing test evidence in each description and a comment');

  await pullRequestDelivery.uncheck({ force: true });
  await expect(preview).not.toContainText('create the required pull requests');
  await expect(preview).not.toContainText('regression-preventing test evidence');
});

test('slider controls select one ordered investigation-depth branch', async ({ page }) => {
  await page.getByRole('button', { name: 'Investigate a Topic', exact: true }).click();
  const preview = page.getByRole('region', { name: 'Composed prompt' });
  const depth = page.getByRole('slider', { name: 'Analysis depth' });

  await expect(page.getByRole('checkbox', { name: 'Data flow and trust boundaries' })).toBeVisible();
  await expect(depth).toHaveAttribute('aria-valuetext', 'Focused');
  await expect(preview).toContainText('follow the relevant implementation and decision paths');

  await depth.press('Home');
  await expect(depth).toHaveAttribute('aria-valuetext', 'Brief');
  await expect(preview).toContainText('limit evidence collection to the minimum needed');
  await expect(preview).not.toContainText('follow the relevant implementation and decision paths');
  const depthMarker = preview.locator(
    '[data-marker-hit-target][aria-label*="Changed by Analysis depth: Brief"]'
  ).first();
  await depthMarker.focus();
  await expect(page.getByRole('tooltip')).toContainText('Changed by Analysis depth: Brief');

  await depth.press('End');
  await expect(depth).toHaveAttribute('aria-valuetext', 'Deep');
  await expect(preview).toContainText('expand across subsystem boundaries, history, edge cases, and competing explanations');
});

test('both model selectors insert the chosen preset labels', async ({ page }) => {
  await page.getByRole('button', { name: /^Review a Pull Request(?:, selected)?$/ }).click();
  const preview = page.getByRole('region', { name: 'Composed prompt' });
  const generalGroup = page.getByRole('group', { name: 'General model', exact: true });
  const alternativeGroup = page.getByRole('group', { name: 'Alternative model', exact: true });

  await generalGroup.getByRole('combobox', { name: 'General model', exact: true }).selectOption('opus-5');
  await expect(preview.locator(
    '[data-marker-hit-target][aria-label*="Changed by General model: Opus 5"]'
  ).first()).toBeVisible();
  await expect(alternativeGroup.getByRole('combobox', { name: 'Alternative model', exact: true })).toHaveValue('');
  await alternativeGroup.getByRole('combobox', { name: 'Alternative model', exact: true }).selectOption('gpt-5-6-sol');
  const alternativeMarker = preview.locator(
    '[data-marker-hit-target][aria-label*="Changed by Alternative model: GPT-5.6 Sol"]'
  ).first();
  await alternativeMarker.focus();
  await expect(page.getByRole('tooltip')).toContainText('Changed by Alternative model: GPT-5.6 Sol');
  await expect(generalGroup.getByRole('combobox', { name: 'General model', exact: true })).toHaveValue('opus-5');
  await expect(preview).toContainText(
    'Perform the primary review using Opus 5 1M context medium reasoning, and use a set of reviewers using GPT-5.6 Sol 1M context medium reasoning as independent second opinions.'
  );
});

test('context and reasoning selectors refine the composed model label', async ({ page }) => {
  await page.getByRole('button', { name: /^Review a Pull Request(?:, selected)?$/ }).click();
  const preview = page.getByRole('region', { name: 'Composed prompt' });
  const generalGroup = page.getByRole('group', { name: 'General model', exact: true });

  await expect(generalGroup.getByRole('combobox', { name: 'General model', exact: true })).toHaveValue('');
  await expect(preview).toContainText('Perform the primary review, and use a set of reviewers as independent second opinions.');
  await generalGroup.getByRole('combobox', { name: 'General model', exact: true }).selectOption('gpt-5-6-terra');
  const surface = preview.locator('[data-preview-surface]');
  await surface.evaluate((element) => {
    element.style.height = '100px';
    element.style.minHeight = '100px';
    element.style.maxHeight = '100px';
    element.scrollTop = 0;
  });
  const context = generalGroup.getByRole('combobox', { name: 'General model context', exact: true });
  await context.selectOption('standard');
  await expect(preview.locator(
    '[data-marker-hit-target][aria-label*="Changed by General model: GPT-5.6 Terra medium reasoning"]'
  ).first()).toBeVisible();
  await expect.poll(() => surface.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await context.selectOption('1m');
  const reasoning = generalGroup.getByRole('combobox', { name: 'General model reasoning', exact: true });
  await expect(reasoning.locator('option')).toHaveText(['no', 'minimal', 'low', 'medium', 'high', 'extra high', 'max']);
  await reasoning.selectOption('max');
  await expect(preview).toContainText('Perform the primary review using GPT-5.6 Terra 1M context max reasoning');
  await expect(preview.locator(
    '[data-marker-hit-target][aria-label*="Changed by General model: GPT-5.6 Terra 1M context max reasoning"]'
  ).first()).toBeVisible();

  await context.selectOption('standard');
  await expect(preview).toContainText('Perform the primary review using GPT-5.6 Terra max reasoning');

  await reasoning.selectOption('none');
  await expect(preview).toContainText('Perform the primary review using GPT-5.6 Terra no reasoning');

  await generalGroup.getByRole('combobox', { name: 'General model', exact: true }).selectOption('');
  await expect(generalGroup.getByRole('combobox', { name: 'General model context', exact: true })).toHaveCount(0);
  await expect(generalGroup.getByRole('combobox', { name: 'General model reasoning', exact: true })).toHaveCount(0);
  await expect(preview).toContainText('Perform the primary review, and use a set of reviewers as independent second opinions.');
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
    await expect(page.getByLabel('Intent', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Technical notes', { exact: true })).toBeVisible();
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
    await expect(page.getByLabel('Technical notes', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Intent', { exact: true })).toBeVisible();
  });

  test('shows active prompt-specific model roles and preserves independent selections', async ({ page }) => {
    const preview = page.getByRole('region', { name: 'Composed prompt' });
    const executionCard = page.getByRole('group', { name: 'Approved execution model', exact: true });
    const reviewCard = page.getByRole('group', { name: 'Planning and review model', exact: true });
    const executionModel = executionCard.getByRole('combobox', { name: 'Approved execution model', exact: true });
    const reviewModel = reviewCard.getByRole('combobox', { name: 'Planning and review model', exact: true });

    const executionDescription = 'Used by approved implementation workers. Select No explicit model to leave model choice to Copilot CLI and emit no model descriptor.';
    const reviewDescription = 'Used by reviewers that critique execution waves. Select No explicit model to leave model choice to Copilot CLI and emit no model descriptor.';
    await expect(executionCard.getByText(executionDescription)).toHaveCSS('clip', 'rect(0px, 0px, 0px, 0px)');
    await expect(reviewCard.getByText(reviewDescription)).toHaveCSS('clip', 'rect(0px, 0px, 0px, 0px)');
    await expect(executionCard).toHaveAccessibleDescription(executionDescription);
    await expect(reviewCard).toHaveAccessibleDescription(reviewDescription);

    await expect(executionModel).toHaveValue('');
    await expect(reviewModel).toHaveValue('');
    await expect(executionModel.locator('option').first()).toHaveText('No explicit model');
    await expect(reviewModel.locator('option').first()).toHaveText('No explicit model');
    await expect(preview).toContainText('Handle approved implementation work.');
    await expect(preview).toContainText('Review full-stack integration.');
    await expect(executionCard.getByRole('combobox', { name: 'Approved execution model context', exact: true })).toHaveCount(0);
    await expect(reviewCard.getByRole('combobox', { name: 'Planning and review model reasoning', exact: true })).toHaveCount(0);

    await executionModel.selectOption('opus-5');
    await reviewModel.selectOption('gpt-5-6-sol');
    await executionCard.getByRole('combobox', { name: 'Approved execution model context', exact: true }).selectOption('standard');
    const reviewReasoning = reviewCard.getByRole('combobox', { name: 'Planning and review model reasoning', exact: true });
    await expect(reviewReasoning.locator('option')).toHaveText(['low', 'medium', 'high']);
    await reviewReasoning.selectOption('high');
    await expect(preview).toContainText('Handle approved implementation work using Opus 5 medium reasoning.');
    await expect(preview).toContainText('Review full-stack integration using GPT-5.6 Sol 1M context high reasoning.');

    await page.getByLabel('Technical scope', { exact: true }).selectOption('backend');
    await expect(executionCard.getByRole('combobox', { name: 'Approved execution model', exact: true })).toHaveValue('opus-5');
    await expect(page.getByRole('group', { name: 'Planning and review model', exact: true })).toHaveCount(0);

    await page.getByLabel('Technical scope', { exact: true }).selectOption('fullStack');
    await expect(executionCard.getByRole('combobox', { name: 'Approved execution model', exact: true })).toHaveValue('opus-5');
    await expect(page.getByRole('group', { name: 'Planning and review model', exact: true })
      .getByRole('combobox', { name: 'Planning and review model', exact: true })).toHaveValue('gpt-5-6-sol');

    await executionModel.selectOption('');
    await expect(preview).toContainText('Handle approved implementation work.');
    await expect(preview).not.toContainText('Opus 5 medium reasoning');

    await page.getByLabel('Purpose', { exact: true }).selectOption('general');
    await expect(page.getByText('Model guidance', { exact: true })).toHaveCount(0);
  });

  test('injects a default only while an optional role becomes required', async ({ page }) => {
    const preview = page.getByRole('region', { name: 'Composed prompt' });
    const model = page.getByRole('group', { name: 'Approved execution model', exact: true })
      .getByRole('combobox', { name: 'Approved execution model', exact: true });

    await expect(model).toHaveValue('');
    await page.getByLabel('Technical scope', { exact: true }).selectOption('backend');
    await expect(model).toHaveValue('gpt-5-6-sol');
    await expect(model.locator('option').first()).not.toHaveText('No explicit model');
    await expect(preview).toContainText('Required backend model: GPT-5.6 Sol 1M context medium reasoning.');
    await expect(preview.locator(
      '[data-marker-hit-target][aria-label*="Changed by Technical scope: Backend"]'
    ).first()).toBeVisible();
    await expect(preview.locator(
      '[data-marker-hit-target][aria-label*="Changed by Approved execution model:"]'
    )).toHaveCount(0);

    await page.getByLabel('Technical scope', { exact: true }).selectOption('fullStack');
    await expect(model).toHaveValue('');
    await expect(model.locator('option').first()).toHaveText('No explicit model');
    await expect(preview).not.toContainText('GPT-5.6 Sol 1M context medium reasoning');
    await expect(preview.locator(
      '[data-marker-hit-target][aria-label^="Changed by Approved execution model:"]'
    )).toHaveCount(0);
  });

  test('keeps one exact preview with semantic gutter shapes and hover/focus backtraces', async ({ page }) => {
    const region = page.getByRole('region', { name: 'Composed prompt' });
    const preview = region.locator('pre');
    const markers = region.locator('[data-composition-marker]');
    const initialText = await preview.innerText();
    await expect(page.getByRole('button', { name: /^(Preview|Changes)/ })).toHaveCount(0);
    await expect(page.getByText(/All changes|Show all|Affected text|previous action/i)).toHaveCount(0);
    await expect(markers).toHaveCount(0);
    await expect(preview.locator('ins, del')).toHaveCount(0);

    const intent = page.getByLabel('Intent', { exact: true });
    const initialIntent = await intent.inputValue();
    await intent.fill(`${initialIntent} Add one sentence.`);
    await expect(region.locator('[data-composition-marker][data-marker-kind="addition"]')).not.toHaveCount(0);
    await expect(region.locator('[data-composition-marker][data-marker-kind="deletion"]')).toHaveCount(0);
    const insertionTarget = region.locator('[data-marker-hit-target][data-marker-kind="addition"]').first();
    await insertionTarget.hover();
    await expect(page.getByRole('tooltip')).toContainText(`Changed by Intent: ${initialIntent} Add one sentence.`);
    await page.mouse.move(0, 0);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await insertionTarget.focus();
    await expect(insertionTarget).toBeFocused();
    await expect(page.getByRole('tooltip')).toContainText(`Changed by Intent: ${initialIntent} Add one sentence.`);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await intent.focus();
    await insertionTarget.focus();
    await expect(page.getByRole('tooltip')).toBeVisible();
    await intent.focus();
    await expect(page.getByRole('tooltip')).toHaveCount(0);

    await intent.fill(initialIntent.replace('safer ', ''));
    await expect(region.locator('[data-composition-marker][data-marker-kind="addition"]')).toHaveCount(0);
    await expect(region.locator('[data-composition-marker][data-marker-kind="deletion"]')).not.toHaveCount(0);

    await intent.fill(initialIntent.replace('safer', 'resilient'));
    const textAddition = region.locator('[data-composition-marker][data-marker-kind="addition"]').first();
    const textDeletion = region.locator('[data-composition-marker][data-marker-kind="deletion"]').first();
    await expect(textAddition).toBeVisible();
    await expect(textDeletion).toBeVisible();
    const replacementTarget = region.locator('[data-marker-hit-target][data-marker-kind="change"]').first();
    await replacementTarget.hover();
    await expect(page.getByRole('tooltip')).toContainText('Changed by Intent:');
    const markerColors = await page.evaluate(() => {
      const addition = document.querySelector<HTMLElement>('[data-composition-marker][data-marker-kind="addition"]');
      const deletion = document.querySelector<HTMLElement>('[data-composition-marker][data-marker-kind="deletion"]');
      const probe = document.createElement('span');
      probe.style.backgroundColor = 'var(--sw-accent)';
      document.body.append(probe);
      const colors = {
        addition: addition ? getComputedStyle(addition).backgroundColor : '',
        deletion: deletion ? getComputedStyle(deletion).backgroundColor : '',
        accent: getComputedStyle(probe).backgroundColor
      };
      probe.remove();
      return colors;
    });
    expect(markerColors.addition).toBe(markerColors.accent);
    expect(markerColors.deletion).toBe(markerColors.accent);
    await intent.fill(initialIntent);
    await expect(markers).toHaveCount(0);

    const depth = page.getByRole('slider', { name: 'Analysis depth' });
    const stateDiagram = page.getByRole('checkbox', { name: 'State diagram' });
    await depth.press('End');
    await expect(stateDiagram).toBeEnabled();
    await stateDiagram.check({ force: true });
    await expect(region.locator('[data-marker-kind="addition"]')).not.toHaveCount(0);
    await stateDiagram.uncheck({ force: true });
    await depth.press('ArrowLeft');
    await expect(markers).toHaveCount(0);

    const apiFlow = page.getByRole('checkbox', { name: 'API / data-flow diagram' });
    await apiFlow.uncheck({ force: true });
    await expect(region.locator('[data-marker-kind="deletion"]')).not.toHaveCount(0);
    const deletionTarget = region.locator('[data-marker-hit-target][data-marker-kind="deletion"]').first();
    await deletionTarget.hover();
    await expect(page.getByRole('tooltip')).toContainText('Removed by API / data-flow diagram: disabled');
    await page.mouse.move(0, 0);
    await page.locator('[data-option-control="apiFlow"] label').hover();
    await expect(page.getByRole('tooltip')).toHaveCount(0);

    const scope = page.getByLabel('Technical scope', { exact: true });
    const mockups = page.getByRole('checkbox', { name: 'UI mockups and recovery-state interactions' });
    const surface = region.locator('[data-preview-surface]');
    await surface.evaluate((element) => {
      element.style.height = '150px';
      element.style.minHeight = '150px';
      element.style.maxHeight = '150px';
      element.scrollTop = 0;
    });
    await scope.selectOption('backend');
    await expect(mockups).toBeDisabled();
    await expect(mockups).not.toBeChecked();
    await expect(region.locator('[data-marker-kind="deletion"]')).not.toHaveCount(0);
    const relatedTarget = region.locator(
      '[data-marker-hit-target][aria-label*="Changed by Technical scope: Backend"][aria-label*="UI mockups and recovery-state interactions: disabled"]'
    ).first();
    await relatedTarget.focus();
    await expect(page.getByRole('tooltip')).toContainText('Changed by Technical scope: Backend');
    await expect(page.getByRole('tooltip')).toContainText('Also affected by');
    await expect(page.getByRole('tooltip')).toContainText('UI mockups and recovery-state interactions: disabled');
    await expect(preview).not.toHaveText(initialText ?? '');

    await page.getByRole('button', { name: 'Copy composed prompt' }).click();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(normalizeText(clipboard)).toBe(normalizeText(await preview.innerText()));

    await preview.evaluate((element) => {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
    await page.keyboard.press('Control+C');
    const selectedClipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(normalizeText(selectedClipboard)).toBe(normalizeText(await preview.innerText()));
  });

  test('debounces textarea auto-scroll until typing pauses', async ({ page }) => {
    const region = page.getByRole('region', { name: 'Composed prompt' });
    const surface = region.locator('[data-preview-surface]');
    const notes = page.getByLabel('Technical notes', { exact: true });
    await surface.evaluate((element) => {
      element.style.height = '100px';
      element.style.minHeight = '100px';
      element.style.maxHeight = '100px';
      element.scrollTop = 0;
    });

    await notes.focus();
    const originalNotes = await notes.inputValue();
    await notes.fill(`${originalNotes} More evidence.`);
    await page.waitForTimeout(100);
    expect(await surface.evaluate((element) => element.scrollTop)).toBe(0);
    await expect(region.locator(
      '[data-marker-hit-target][aria-label*="Changed by Technical notes:"]'
    ).first()).toBeVisible();

    await expect.poll(() => surface.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await page.waitForTimeout(350);
    const settled = await surface.evaluate((element) => element.scrollTop);
    await page.waitForTimeout(350);
    expect(await surface.evaluate((element) => element.scrollTop)).toBeCloseTo(settled, 1);
    await expect(notes).toBeFocused();
  });
});

test('an initially-off checkbox round trip removes every gutter marker', async ({ page }) => {
  await page.getByRole('button', { name: 'Implementation Plan', exact: true }).click();
  const delivery = page.getByRole('checkbox', { name: 'Pull request delivery' });
  const markers = page.getByRole('region', { name: 'Composed prompt' }).locator('[data-composition-marker]');
  await expect(markers).toHaveCount(0);

  await delivery.check({ force: true });
  await expect(page.locator('[data-marker-kind="addition"]')).not.toHaveCount(0);
  await delivery.uncheck({ force: true });
  await expect(markers).toHaveCount(0);
});
