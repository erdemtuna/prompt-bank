import { test, expect } from '@playwright/test';

const composerFixture = '/tests/fixtures/composer.html';

for (const width of [320, 390, 768, 1101, 1440]) {
  test(`has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: /^Review a Pull Request(?:, selected)?$/ })).toBeVisible();
    await page.getByRole('button', { name: 'Investigate a Topic', exact: true }).click();
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
  await expect(page.getByRole('button', { name: /^Review a Pull Request(?:, selected)?$/ })).toBeVisible();
  await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready);
  await page.waitForTimeout(500);

  expect(external, external.join(', ')).toEqual([]);
});

for (const width of [320, 390, 768, 1101, 1440]) {
  test(`Wave 1A Composer fixture has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(composerFixture);
    await expect(page.getByRole('heading', { name: 'Wave 1A Composer Fixture' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow of ${overflow}px at ${width}px`).toBeLessThanOrEqual(1);
  });
}

test('workflow select indicators stay inside their wrappers and the constrained desktop rail', async ({ page }) => {
  await page.setViewportSize({ width: 1101, height: 900 });
  await page.goto(composerFixture);
  await page.locator('#root').evaluate((root) => {
    root.style.width = '430px';
    root.style.maxWidth = '430px';
  });

  const rail = page.locator('aside[aria-label="Prompt inputs"]');
  const railGeometry = await rail.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      left: box.left + Number.parseFloat(style.paddingLeft),
      right: box.right - Number.parseFloat(style.paddingRight)
    };
  });

  const wrappers: Array<{ label: string; left: number; right: number }> = [];
  for (const label of ['Purpose', 'Delivery workflow', 'Technical scope', 'Topology', 'Execution']) {
    const select = page.getByRole('combobox', { name: label, exact: true });
    const wrapper = select.locator('..');
    const icon = wrapper.locator('.fui-Select__icon');
    await expect(icon, `${label} indicator`).toBeVisible();

    const [wrapperBox, iconBox] = await Promise.all([wrapper.boundingBox(), icon.boundingBox()]);
    expect(wrapperBox, `${label} wrapper geometry`).not.toBeNull();
    expect(iconBox, `${label} icon geometry`).not.toBeNull();
    if (!wrapperBox || !iconBox) continue;

    expect(iconBox.x, `${label} icon starts inside its wrapper`).toBeGreaterThanOrEqual(wrapperBox.x - 0.5);
    expect(iconBox.x + iconBox.width, `${label} icon ends inside its wrapper`).toBeLessThanOrEqual(wrapperBox.x + wrapperBox.width + 0.5);
    expect(wrapperBox.x, `${label} wrapper starts inside the rail`).toBeGreaterThanOrEqual(railGeometry.left - 0.5);
    expect(wrapperBox.x + wrapperBox.width, `${label} wrapper ends inside the visible rail`).toBeLessThanOrEqual(railGeometry.right + 0.5);
    expect(iconBox.x + iconBox.width, `${label} indicator ends inside the visible rail`).toBeLessThanOrEqual(railGeometry.right + 0.5);
    wrappers.push({ label, left: wrapperBox.x, right: wrapperBox.x + wrapperBox.width });
  }

  expect(new Set(wrappers.map(({ left }) => Math.round(left))).size, 'workflow fields collapse before indicators clip').toBe(1);
});

test('workflow selects use two columns when the desktop rail has room', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(composerFixture);

  const boxes = await page.locator('section[aria-label="Workflow"] .fui-Select').evaluateAll((wrappers) =>
    wrappers.map((wrapper) => wrapper.getBoundingClientRect().left)
  );
  expect(new Set(boxes.map((left) => Math.round(left))).size).toBe(2);
});

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
