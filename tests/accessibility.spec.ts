import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const composerFixture = '/tests/fixtures/composer.html';

// The Windows clipboard normalizes line endings to CRLF on read, so both sides
// are normalized before comparing. The composed text itself is always LF.
const normalizeText = (value: string) => value.replace(/\r\n/g, '\n').trim();

test('the default view has no serious or critical accessibility violations', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Rewrite for Clarity', exact: true })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const summary = blocking.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
  expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
});

test('a selected prompt with inputs and options has no serious or critical violations', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Review a Pull Request(?:, selected)?$/ }).click();
  await page.getByLabel('pullRequest', { exact: true }).fill('example change');
  await expect(page.getByRole('region', { name: 'Composed prompt' })).toContainText('example change');
  await page.waitForLoadState('networkidle');

  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const summary = blocking.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
  expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
});

test('select and slider prompt controls have no serious or critical violations', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Investigate a Topic', exact: true }).click();
  await expect(page.getByLabel('Purpose', { exact: true })).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Analysis depth' })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const summary = blocking.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
  expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
});

test('the copy action is reachable and activatable by keyboard', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Rewrite for Clarity', exact: true }).click();
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
  await page.getByRole('button', { name: 'Rewrite for Clarity', exact: true }).click();

  const info = page.getByRole('button', { name: 'About draft' });
  await info.focus();
  await expect(page.getByRole('tooltip')).toContainText('The text to rewrite');
  await expect(page.locator('aside[aria-label="Prompt inputs"]').getByRole('tooltip')).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);

  const promptHelp = page.getByRole('button', { name: 'About this prompt' });
  await promptHelp.hover();
  await expect(page.getByRole('tooltip')).toContainText("Make a piece of writing clearer without turning it into someone else's voice.");
});

test('conditional Composer controls are accessible by keyboard and screen reader', async ({ page }) => {
  await page.goto(composerFixture);
  const purpose = page.getByLabel('Purpose', { exact: true });
  await purpose.focus();
  await expect(purpose).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'About Delivery workflow' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Delivery workflow', { exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'About Technical scope' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Technical scope', { exact: true })).toBeFocused();

  const depth = page.getByRole('slider', { name: 'Analysis depth' });
  await depth.focus();
  await page.keyboard.press('End');
  await expect(depth).toHaveAttribute('aria-valuetext', 'Deep');

  await page.getByLabel('Technical scope', { exact: true }).selectOption('backend');
  const unavailable = page.getByRole('checkbox', { name: 'UI mockups and recovery-state interactions' });
  await expect(unavailable).toBeDisabled();
  await expect(unavailable).toHaveAttribute('aria-describedby');
  await expect(unavailable).toHaveAccessibleDescription('Available when Technical scope is Frontend or Full-stack.');
  await expect(page.locator('[data-option-control="uiMockups"]').getByText('Available when Technical scope is Frontend or Full-stack.')).toHaveCSS('clip', 'rect(0px, 0px, 0px, 0px)');

  await page.getByLabel('Technical scope', { exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'About Topology' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Topology', { exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'About Execution' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Execution', { exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(depth).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'About UI mockups and recovery-state interactions' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('checkbox', { name: 'API / data-flow diagram' })).toBeFocused();

  await purpose.selectOption('general');
  await expect(page.getByLabel('Technical scope', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'UI mockups and recovery-state interactions' })).toHaveCount(0);
});

test('Composer sections and model role groups expose programmatic names and descriptions', async ({ page }) => {
  await page.goto(composerFixture);

  for (const name of ['Workflow', 'Focus areas', 'Model guidance', 'Context']) {
    await expect(page.getByRole('region', { name, exact: true })).toBeVisible();
  }

  const executionGroup = page.getByRole('group', { name: 'Approved execution model', exact: true });
  await expect(executionGroup).toBeVisible();
  await expect(executionGroup).toHaveAccessibleDescription('Used by approved implementation workers.');
  await expect(executionGroup.getByText('Used by approved implementation workers.')).toHaveCSS('clip', 'rect(0px, 0px, 0px, 0px)');

  const reviewGroup = page.getByRole('group', { name: 'Planning and review model', exact: true });
  await expect(reviewGroup).toBeVisible();
  await expect(reviewGroup).toHaveAccessibleDescription('Used by reviewers that critique execution waves.');
  await expect(reviewGroup.getByText('Used by reviewers that critique execution waves.')).toHaveCSS('clip', 'rect(0px, 0px, 0px, 0px)');

  const roleHelp = page.getByRole('button', { name: 'About Approved execution model' });
  await roleHelp.focus();
  await expect(page.getByRole('tooltip')).toHaveText('Used by approved implementation workers.');
});

test('unavailable option help merges author guidance and availability in one tooltip', async ({ page }) => {
  await page.goto(composerFixture);
  await page.getByLabel('Technical scope', { exact: true }).selectOption('backend');

  const option = page.locator('[data-option-control="uiMockups"]');
  const help = option.getByRole('button', { name: 'About UI mockups and recovery-state interactions' });
  await expect(option.locator('[data-help-trigger]')).toHaveCount(1);
  await help.focus();
  await expect(page.getByRole('tooltip')).toHaveText(
    'Include visual interaction states. Available when Technical scope is Frontend or Full-stack.'
  );
});

test('conditional and disabled Composer states have no serious or critical violations', async ({ page }) => {
  await page.goto(composerFixture);
  await page.getByLabel('Technical scope', { exact: true }).selectOption('backend');

  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const summary = blocking.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
  expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
});
