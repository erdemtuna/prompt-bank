import { test, expect } from '@playwright/test';

const fontsReady = () => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready;
const composerFixture = '/tests/fixtures/composer.html';

test('captures the Wave 1A desktop Composer fixture with two model roles', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(composerFixture);
  await page.evaluate(fontsReady);
  await expect(page).toHaveScreenshot('composer-wave1a-desktop-two-model-roles.png', { animations: 'disabled', fullPage: true });
});

test('captures the Wave 1A narrow Composer fixture', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(composerFixture);
  await page.evaluate(fontsReady);
  await expect(page).toHaveScreenshot('composer-wave1a-narrow.png', { animations: 'disabled', fullPage: true });
});

test('captures a wrapped option label in the constrained desktop rail', async ({ page }) => {
  await page.setViewportSize({ width: 1101, height: 900 });
  await page.goto(composerFixture);
  await page.locator('#root').evaluate((root) => {
    root.style.width = '720px';
    root.style.maxWidth = '720px';
  });
  await page.evaluate(fontsReady);
  await expect(page).toHaveScreenshot('composer-wave1a-constrained-wrapped-option.png', { animations: 'disabled', fullPage: true });
});

test('captures the top-left workflow tooltip through the Fluent portal', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(composerFixture);
  await page.evaluate(fontsReady);
  await page.getByRole('button', { name: 'About Purpose' }).hover();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await expect(page).toHaveScreenshot('composer-wave1a-tooltip-top-left.png', { animations: 'disabled', fullPage: true });
});

test('captures the top-right workflow tooltip through the Fluent portal', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(composerFixture);
  await page.evaluate(fontsReady);
  await page.getByRole('button', { name: 'About Delivery workflow' }).hover();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await expect(page).toHaveScreenshot('composer-wave1a-tooltip-top-right.png', { animations: 'disabled', fullPage: true });
});

test('captures flat model guidance with one active role', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(composerFixture);
  await page.getByLabel('Technical scope', { exact: true }).selectOption('backend');
  await expect(page.getByRole('group', { name: 'Planning and review model' })).toHaveCount(0);
  await page.evaluate(fontsReady);
  await expect(page).toHaveScreenshot('composer-wave1a-desktop-one-model-role.png', { animations: 'disabled', fullPage: true });
});
