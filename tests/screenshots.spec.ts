import { test, expect } from '@playwright/test';

const fontsReady = () => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready;
const composerFixture = '/tests/fixtures/composer.html';

test('captures the Wave 2A desktop Composer fixture', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(composerFixture);
  await page.evaluate(fontsReady);
  await expect(page).toHaveScreenshot('composer-wave2a-desktop.png', { animations: 'disabled', fullPage: true });
});

test('captures the Wave 2A narrow Composer fixture', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(composerFixture);
  await page.evaluate(fontsReady);
  await expect(page).toHaveScreenshot('composer-wave2a-narrow.png', { animations: 'disabled', fullPage: true });
});
