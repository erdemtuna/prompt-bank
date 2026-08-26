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

for (const transition of [
  { panelWidth: 707, columns: 1 },
  { panelWidth: 708, columns: 2 }
]) {
  test(`Composer uses ${transition.columns} column${transition.columns === 1 ? '' : 's'} at ${transition.panelWidth}px with a 380px rail`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(composerFixture);
    await expect(page.getByRole('heading', { name: 'Wave 1A Composer Fixture' })).toBeVisible();
    await page.locator('#root').evaluate((root, panelWidth) => {
      root.style.width = `${panelWidth + 48}px`;
      root.style.maxWidth = `${panelWidth + 48}px`;
    }, transition.panelWidth);

    const geometry = await page.locator('aside[aria-label="Prompt inputs"]').evaluate((rail) => {
      const workspace = rail.parentElement;
      const previewColumn = workspace?.firstElementChild;
      if (!workspace || !previewColumn) throw new Error('Composer columns were not found');

      const workspaceBox = workspace.getBoundingClientRect();
      const previewBox = previewColumn.getBoundingClientRect();
      const railBox = rail.getBoundingClientRect();
      return {
        workspaceWidth: workspaceBox.width,
        previewWidth: previewBox.width,
        previewTop: previewBox.top,
        previewBottom: previewBox.bottom,
        railWidth: railBox.width,
        railLeft: railBox.left,
        railTop: railBox.top,
        gap: railBox.left - previewBox.right
      };
    });

    expect(geometry.workspaceWidth).toBeCloseTo(transition.panelWidth, 0);
    if (transition.columns === 1) {
      expect(geometry.previewWidth).toBeCloseTo(707, 0);
      expect(geometry.railWidth).toBeCloseTo(707, 0);
      expect(geometry.railTop - geometry.previewBottom).toBeCloseTo(28, 0);
    } else {
      expect(geometry.previewWidth).toBeCloseTo(300, 0);
      expect(geometry.railWidth).toBeCloseTo(380, 0);
      expect(geometry.railTop).toBeCloseTo(geometry.previewTop, 0);
      expect(geometry.gap).toBeCloseTo(28, 0);
    }
  });
}

for (const panelWidth of [707, 708]) {
  test(`gutter markers preserve Composer geometry and text position at ${panelWidth}px`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(composerFixture);
    await page.locator('#root').evaluate((root, width) => {
      root.style.width = `${width + 48}px`;
      root.style.maxWidth = `${width + 48}px`;
    }, panelWidth);
    const measure = () => page.getByRole('region', { name: 'Composed prompt' }).evaluate((region) => {
      const header = region.querySelector<HTMLElement>('[data-preview-header]');
      const surface = region.querySelector<HTMLElement>('[data-preview-surface]');
      const text = region.querySelector<HTMLElement>('[data-preview-text]');
      const previewColumn = region.parentElement;
      const workspace = previewColumn?.parentElement;
      const rail = workspace?.querySelector<HTMLElement>('aside[aria-label="Prompt inputs"]');
      const firstControl = rail?.querySelector<HTMLElement>('select');
      if (!header || !surface || !text || !previewColumn || !workspace || !rail || !firstControl) {
        throw new Error('Composer geometry elements were not found');
      }
      const box = (element: Element) => {
        const value = element.getBoundingClientRect();
        return { x: value.x, y: value.y + window.scrollY, width: value.width, height: value.height };
      };
      return {
        region: box(region),
        header: box(header),
        surface: box(surface),
        text: box(text),
        previewColumn: box(previewColumn),
        workspace: box(workspace),
        rail: box(rail),
        firstControl: box(firstControl)
      };
    });

    const baselineGeometry = await measure();
    await page.getByRole('slider', { name: 'Analysis depth' }).press('End');
    await expect(page.locator('[data-composition-marker]').first()).toBeVisible();
    const markerGeometry = await measure();

    expect(markerGeometry.region).toEqual(baselineGeometry.region);
    expect(markerGeometry.header).toEqual(baselineGeometry.header);
    expect(markerGeometry.surface).toEqual(baselineGeometry.surface);
    expect(markerGeometry.previewColumn).toEqual(baselineGeometry.previewColumn);
    expect(markerGeometry.workspace).toEqual(baselineGeometry.workspace);
    expect(markerGeometry.rail).toEqual(baselineGeometry.rail);
    expect(markerGeometry.firstControl).toEqual(baselineGeometry.firstControl);
    expect(markerGeometry.text.x).toBeCloseTo(baselineGeometry.text.x, 1);
    expect(markerGeometry.text.width).toBeCloseTo(baselineGeometry.text.width, 1);

    await page.locator('[data-preview-surface]').evaluate((surface) => {
      const height = `${surface.getBoundingClientRect().height}px`;
      surface.style.height = height;
      surface.style.minHeight = height;
      surface.style.maxHeight = height;
    });
    const longIntent = 'A deliberately long recovery-flow intent that wraps across several preview lines while retaining exactly the same content column and external panel geometry. '.repeat(4);
    await page.getByLabel('Intent', { exact: true }).fill(longIntent);
    const addition = page.locator('[data-composition-marker][data-marker-kind="addition"]').last();
    await expect(addition).toBeVisible();
    const gutter = await page.locator('[data-composition-marker][data-marker-kind="addition"]').evaluateAll((markers) => {
      const groups = new Map<string, Element[]>();
      for (const marker of markers) {
        const order = marker.getAttribute('data-marker-order') ?? '';
        groups.set(order, [...(groups.get(order) ?? []), marker]);
      }
      const wrapped = [...groups.values()].reduce((largest, candidates) => {
        const boxes = candidates.map((candidate) => candidate.getBoundingClientRect());
        const extent = Math.max(...boxes.map((box) => box.bottom)) - Math.min(...boxes.map((box) => box.top));
        const largestBoxes = largest.map((candidate) => candidate.getBoundingClientRect());
        const largestExtent = Math.max(...largestBoxes.map((box) => box.bottom)) - Math.min(...largestBoxes.map((box) => box.top));
        return extent > largestExtent ? candidates : largest;
      });
      const marker = wrapped[0];
      const markerBox = marker.getBoundingClientRect();
      const surface = marker.closest<HTMLElement>('[data-preview-surface]');
      const text = surface?.querySelector<HTMLElement>('[data-preview-text]');
      const markerCenter = markerBox.top + markerBox.height / 2;
      const target = [...(surface?.querySelectorAll<HTMLElement>('[data-marker-hit-target]') ?? [])]
        .find((candidate) => {
          const box = candidate.getBoundingClientRect();
          return markerCenter >= box.top && markerCenter <= box.bottom;
        });
      if (!surface || !text || !target) throw new Error('Preview marker geometry was not found');
      const surfaceBox = surface.getBoundingClientRect();
      const textBox = text.getBoundingClientRect();
      const targetBox = target.getBoundingClientRect();
      return {
        markerLeft: markerBox.left,
        markerRight: markerBox.right,
        markerHeight: Math.max(...wrapped.map((candidate) => candidate.getBoundingClientRect().bottom))
          - Math.min(...wrapped.map((candidate) => candidate.getBoundingClientRect().top)),
        surfaceLeft: surfaceBox.left,
        textLeft: textBox.left,
        targetLeft: targetBox.left,
        targetRight: targetBox.right,
        targetWidth: targetBox.width,
        targetHeight: targetBox.height,
        lineHeight: Number.parseFloat(getComputedStyle(text).lineHeight)
      };
    });
    expect(gutter.markerLeft).toBeGreaterThanOrEqual(gutter.surfaceLeft + 6);
    expect(gutter.markerRight).toBeLessThan(gutter.textLeft);
    expect(gutter.targetLeft).toBeGreaterThanOrEqual(gutter.surfaceLeft);
    expect(gutter.targetRight).toBeLessThanOrEqual(gutter.textLeft);
    expect(gutter.targetWidth).toBe(20);
    expect(gutter.targetHeight).toBeGreaterThanOrEqual(20);
    expect(gutter.targetHeight).toBeGreaterThanOrEqual(gutter.markerHeight);
    expect(gutter.markerHeight).toBeGreaterThan(gutter.lineHeight * 1.5);
  });
}

for (const width of [320, 390]) {
  test(`gutter markers stay contained without page overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(composerFixture);
    await page.getByLabel('Intent', { exact: true }).fill('A long narrow-screen prompt preview value that creates wrapped addition markers. '.repeat(5));
    const marker = page.locator('[data-composition-marker][data-marker-kind="addition"]').first();
    await expect(marker).toBeVisible();

    const geometry = await page.evaluate(() => {
      const marker = document.querySelector<HTMLElement>('[data-composition-marker][data-marker-kind="addition"]');
      const surface = document.querySelector<HTMLElement>('[data-preview-surface]');
      const text = document.querySelector<HTMLElement>('[data-preview-text]');
      const markerBox = marker?.getBoundingClientRect();
      const surfaceBox = surface?.getBoundingClientRect();
      const textBox = text?.getBoundingClientRect();
      return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        surface: surfaceBox?.width ?? 0,
        viewport: document.documentElement.clientWidth,
        markerLeft: markerBox?.left ?? 0,
        markerRight: markerBox?.right ?? 0,
        surfaceLeft: surfaceBox?.left ?? 0,
        textLeft: textBox?.left ?? 0
      };
    });
    expect(geometry.overflow, `horizontal overflow of ${geometry.overflow}px at ${width}px`).toBeLessThanOrEqual(1);
    expect(geometry.surface).toBeLessThanOrEqual(geometry.viewport);
    expect(geometry.markerLeft).toBeGreaterThanOrEqual(geometry.surfaceLeft + 6);
    expect(geometry.markerRight).toBeLessThan(geometry.textLeft);
  });
}

for (const viewport of [
  { width: 1200, height: 820 },
  { width: 1360, height: 900 },
  { width: 1440, height: 900 }
]) {
  test(`balances the real app Composer columns at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByRole('button', { name: /^Review a Pull Request(?:, selected)?$/ })).toBeVisible();

    const geometry = await page.locator('aside[aria-label="Prompt inputs"]').evaluate((rail) => {
      const workspace = rail.parentElement;
      const previewColumn = workspace?.firstElementChild;
      if (!workspace || !previewColumn) throw new Error('Composer columns were not found');

      const workspaceBox = workspace.getBoundingClientRect();
      const previewBox = previewColumn.getBoundingClientRect();
      const railBox = rail.getBoundingClientRect();
      return {
        workspaceWidth: workspaceBox.width,
        previewWidth: previewBox.width,
        railWidth: railBox.width,
        gap: railBox.left - previewBox.right
      };
    });

    expect(geometry.railWidth).toBeGreaterThanOrEqual(339.5);
    expect(geometry.railWidth).toBeLessThanOrEqual(380.5);
    expect(geometry.previewWidth).toBeGreaterThanOrEqual(geometry.railWidth - 0.5);
    expect(geometry.previewWidth).toBeGreaterThanOrEqual(340);
    expect(geometry.previewWidth / geometry.workspaceWidth).toBeGreaterThanOrEqual(0.47);
    expect(geometry.gap).toBeGreaterThan(0);
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

test('common model role labels stay on one line without starving aligned variant selects', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(composerFixture);
  await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready);
  const rail = page.locator('aside[aria-label="Prompt inputs"]');
  for (const roleLabel of ['Approved execution model', 'Planning and review model']) {
    await page.getByRole('group', { name: roleLabel, exact: true })
      .getByRole('combobox', { name: roleLabel, exact: true })
      .selectOption('gpt-5-6-sol');
  }
  for (const railWidth of [340, 360, 380]) {
    await rail.locator('..').evaluate((workspace, width) => {
      workspace.style.gridTemplateColumns = `minmax(0, 1fr) ${width}px`;
    }, railWidth);

    for (const roleLabel of ['Approved execution model', 'Planning and review model']) {
      const card = page.getByRole('group', { name: roleLabel, exact: true });
      await expect(card.locator('strong')).toHaveCount(0);
      const desktopGeometry = await card.locator('[data-model-field]').evaluateAll((fields) =>
        fields.map((field) => {
          const label = field.firstElementChild;
          const control = field.querySelector('.fui-Select');
          if (!label || !control) throw new Error('Model field label or Select wrapper was not found');
          const fieldBox = field.getBoundingClientRect();
          const labelBox = label.getBoundingClientRect();
          const controlBox = control.getBoundingClientRect();
          const select = control.querySelector('select');
          if (!select) throw new Error('Model Select element was not found');
          const selectStyle = getComputedStyle(select);
          const canvas = document.createElement('canvas').getContext('2d');
          if (!canvas) throw new Error('Canvas context was not available');
          canvas.font = `${selectStyle.fontWeight} ${selectStyle.fontSize} ${selectStyle.fontFamily}`;
          return {
            fieldLeft: fieldBox.left,
            fieldWidth: fieldBox.width,
            labelText: label.textContent?.trim(),
            labelTop: labelBox.top,
            labelHeight: labelBox.height,
            controlTop: controlBox.top,
            controlBottom: controlBox.bottom,
            controlWidth: controlBox.width,
            selectedTextWidth: canvas.measureText(select.selectedOptions[0]?.text ?? '').width,
            selectedTextSpace: select.clientWidth
              - Number.parseFloat(selectStyle.paddingLeft)
              - Number.parseFloat(selectStyle.paddingRight)
          };
        })
      );
      expect(desktopGeometry).toHaveLength(3);
      expect(desktopGeometry[0].labelText).toBe(roleLabel);
      expect(desktopGeometry[0].labelHeight).toBeLessThanOrEqual(20.5);
      expect(new Set(desktopGeometry.map(({ fieldLeft }) => Math.round(fieldLeft))).size).toBe(3);
      expect(desktopGeometry[1].fieldWidth).toBeGreaterThanOrEqual(72.5);
      expect(desktopGeometry[2].fieldWidth).toBeGreaterThanOrEqual(72.5);
      expect(Math.abs(desktopGeometry[1].fieldWidth - desktopGeometry[2].fieldWidth)).toBeLessThanOrEqual(0.5);
      expect(Math.max(...desktopGeometry.map(({ labelTop }) => labelTop)) - Math.min(...desktopGeometry.map(({ labelTop }) => labelTop))).toBeLessThanOrEqual(1);
      expect(Math.max(...desktopGeometry.map(({ controlTop }) => controlTop)) - Math.min(...desktopGeometry.map(({ controlTop }) => controlTop))).toBeLessThanOrEqual(1);
      expect(Math.max(...desktopGeometry.map(({ controlBottom }) => controlBottom)) - Math.min(...desktopGeometry.map(({ controlBottom }) => controlBottom))).toBeLessThanOrEqual(1);
      expect(Math.max(...desktopGeometry.map(({ fieldWidth, controlWidth }) => Math.abs(fieldWidth - controlWidth)))).toBeLessThanOrEqual(0.5);
      expect(Math.min(...desktopGeometry.map(({ selectedTextSpace, selectedTextWidth }) => selectedTextSpace - selectedTextWidth))).toBeGreaterThanOrEqual(0);
    }
  }
});

test('wrapped model role help stays beside the first label line', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(composerFixture);

  const card = page.getByRole('group', { name: 'Approved execution model', exact: true });
  await card.locator('.fui-Select').first().evaluate((select) => {
    const grid = select.closest('[data-model-card]')?.querySelector('[data-model-field]')?.parentElement;
    if (!grid) throw new Error('Model grid was not found');
    grid.style.gridTemplateColumns = '120px 100px 100px';
  });

  const geometry = await card.locator('[data-model-field="model"]').evaluate((field) => {
    const labelWrap = field.firstElementChild;
    const label = labelWrap?.firstElementChild;
    const trigger = labelWrap?.querySelector<HTMLElement>('[data-help-trigger]');
    if (!labelWrap || !label || !trigger) throw new Error('Model role label help was not found');
    const wrapBox = labelWrap.getBoundingClientRect();
    const labelBox = label.getBoundingClientRect();
    const triggerBox = trigger.getBoundingClientRect();
    return {
      wrapHeight: wrapBox.height,
      labelTop: labelBox.top,
      labelRight: labelBox.right,
      triggerTop: triggerBox.top,
      triggerLeft: triggerBox.left
    };
  });

  expect(geometry.wrapHeight).toBeGreaterThan(20.5);
  expect(geometry.triggerTop - geometry.labelTop).toBeGreaterThanOrEqual(0);
  expect(geometry.triggerTop - geometry.labelTop).toBeLessThanOrEqual(2);
  expect(geometry.triggerLeft - geometry.labelRight).toBeGreaterThanOrEqual(3.5);
  expect(geometry.triggerLeft - geometry.labelRight).toBeLessThanOrEqual(4.5);
});

test('model, context, and reasoning stack in order at narrow viewport width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(composerFixture);
  const card = page.getByRole('group', { name: 'Approved execution model', exact: true });
  await card.getByRole('combobox', { name: 'Approved execution model', exact: true }).selectOption('gpt-5-6-sol');
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

test('model grid stacks when its rail container is constrained to 280px', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(composerFixture);

  const rail = page.locator('aside[aria-label="Prompt inputs"]');
  await rail.locator('..').evaluate((workspace) => {
    workspace.style.gridTemplateColumns = 'minmax(0, 1fr) 280px';
  });

  const card = page.getByRole('group', { name: 'Approved execution model', exact: true });
  await card.getByRole('combobox', { name: 'Approved execution model', exact: true }).selectOption('gpt-5-6-sol');
  const geometry = await card.locator('[data-model-field]').evaluateAll((fields) =>
    fields.map((field) => {
      const box = field.getBoundingClientRect();
      return { left: box.left, top: box.top };
    })
  );
  const railGeometry = await rail.evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth
  }));

  expect(railGeometry.width).toBeCloseTo(280, 0);
  expect(railGeometry.scrollWidth).toBeLessThanOrEqual(railGeometry.clientWidth);
  expect(new Set(geometry.map(({ left }) => Math.round(left))).size).toBe(1);
  expect(geometry[0].top).toBeLessThan(geometry[1].top);
  expect(geometry[1].top).toBeLessThan(geometry[2].top);
});
