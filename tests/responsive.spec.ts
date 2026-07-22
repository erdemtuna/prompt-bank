import { test, expect } from '@playwright/test';

for (const width of [320, 390, 768, 1440]) {
  test(`has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Summarize Text' })).toBeVisible();
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
  await expect(page.getByRole('button', { name: 'Summarize Text' })).toBeVisible();
  await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready);
  await page.waitForTimeout(500);

  expect(external, external.join(', ')).toEqual([]);
});
