import { test, expect } from '@playwright/test';

const fontsReady = () => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready;
const composerFixture = '/tests/fixtures/composer.html';

for (const width of [1440, 390]) {
  test(`captures the favorites library at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Add Investigate a Topic to favorites (Built in)' }).click();
    await expect(page.getByRole('button', { name: 'Remove Investigate a Topic from favorites (Built in)' })).toHaveAttribute('aria-busy', 'false');
    await page.getByRole('button', { name: 'Favorites', exact: true }).click();
    await page.getByRole('button', { name: 'Investigate a Topic', exact: true }).click();
    await page.evaluate(fontsReady);
    await expect(page).toHaveScreenshot(`favorites-library-${width}.png`, { animations: 'disabled', fullPage: true });
  });

  test(`captures the bottom-left favorite error toast at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'prompt-bank.favorites.v1') throw new DOMException('Storage full.', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Investigate a Topic', exact: true }).click();
    await page.getByRole('button', { name: 'Add Investigate a Topic to favorites (Built in)' }).click();
    await expect(page.getByText('Favorite change not saved', { exact: true })).toBeVisible();
    await page.mouse.move(1400, 10);
    await page.evaluate(fontsReady);
    await expect(page).toHaveScreenshot(`favorites-error-toast-${width}.png`, { animations: 'disabled', fullPage: true });
  });
}

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
    root.style.width = '756px';
    root.style.maxWidth = '756px';
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
