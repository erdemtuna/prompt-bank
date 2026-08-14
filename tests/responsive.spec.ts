import { test, expect } from '@playwright/test';

const composerFixture = '/tests/fixtures/composer.html';

for (const width of [320, 390, 768, 1440]) {
  test(`has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Review a Pull Request' })).toBeVisible();
    await page.getByRole('button', { name: 'Investigate a Topic' }).click();
    await expect(page.getByRole('slider', { name: 'Analysis depth' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow of ${overflow}px at ${width}px`).toBeLessThanOrEqual(1);
  });
}

test('the app makes no external network requests', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    let local = false;
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'data:' || parsed.protocol === 'blob:') {
        local = true;
      } else {
        local = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
      }
    } catch {
      local = false;
    }
    if (!local) external.push(url);
  });

  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Review a Pull Request' })).toBeVisible();
  await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready);
  await page.waitForTimeout(500);

  expect(external, external.join(', ')).toEqual([]);
});

for (const width of [320, 390, 768, 1440]) {
  test(`Wave 2A Composer fixture has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(composerFixture);
    await expect(page.getByRole('heading', { name: 'Wave 2A Composer Fixture' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow of ${overflow}px at ${width}px`).toBeLessThanOrEqual(1);
  });
}

test('model, context, and reasoning share one responsive row', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(composerFixture);
  const card = page.locator('[data-model-card]').filter({ hasText: 'Approved execution model' });
  const desktopBoxes = await card.locator('[data-model-field]').evaluateAll((fields) =>
    fields.map((field) => {
      const box = field.getBoundingClientRect();
      return { left: box.left, top: box.top, bottom: box.bottom };
    })
  );
  expect(desktopBoxes).toHaveLength(3);
  expect(new Set(desktopBoxes.map((box) => Math.round(box.left))).size).toBe(3);
  expect(Math.max(...desktopBoxes.map((box) => box.bottom)) - Math.min(...desktopBoxes.map((box) => box.bottom))).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 390, height: 900 });
  const narrowBoxes = await card.locator('[data-model-field]').evaluateAll((fields) =>
    fields.map((field) => {
      const box = field.getBoundingClientRect();
      return { left: box.left, top: box.top };
    })
  );
  expect(new Set(narrowBoxes.map((box) => Math.round(box.left))).size).toBe(1);
  expect(narrowBoxes[0].top).toBeLessThan(narrowBoxes[1].top);
  expect(narrowBoxes[1].top).toBeLessThan(narrowBoxes[2].top);
});
