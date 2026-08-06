import { test } from '@playwright/test';

const fontsReady = () => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready;

test('captures the desktop screenshot for the README', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Review a Pull Request' }).click();
  await page.getByLabel('pullRequest', { exact: true }).fill('https://github.com/acme/checkout/pull/482');
  await page.getByLabel('intent', { exact: true }).fill('Adds idempotency keys to the payment capture endpoint.');
  await page.getByLabel('Alternative model').selectOption('opus-5');
  await page.evaluate(fontsReady);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/screenshot.png' });
});

test('captures the mobile screenshot for the README', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(fontsReady);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/screenshot-mobile.png', fullPage: true });
});
