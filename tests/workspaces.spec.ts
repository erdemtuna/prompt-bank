import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const validPrompt = (id: string, title: string, category = 'review') =>
  `---\nid: ${id}\ntitle: ${title}\ndescription: ${title} prompt\ncategory: ${category}\n---\nBody for ${id}.`;

type Internals = { invoke: (cmd: string, args: { id?: string }) => Promise<unknown> };
type VersionMode = 'reject' | 'null' | 'empty' | 'invalid';

const mockData = {
  version: '9.8.7',
  global: { files: [{ relativePath: 'globaltip.md', contents: validPrompt('global-tip', 'Global Tip') }] },
  recents: [
    { id: 'ws1', label: 'alpha', displayPath: '/home/u/alpha', lastOpened: null },
    { id: 'ws2', label: 'beta', displayPath: '/home/u/beta', lastOpened: null }
  ],
  workspaces: {
    ws1: { workspaceId: 'ws1', label: 'alpha', files: [{ relativePath: 'a.md', contents: validPrompt('alpha-prompt', 'Alpha Prompt') }] },
    ws2: { workspaceId: 'ws2', label: 'beta', files: [{ relativePath: 'b.md', contents: validPrompt('beta-prompt', 'Beta Prompt') }] }
  } as Record<string, unknown>,
  picked: { workspaceId: 'ws3', label: 'picked', files: [{ relativePath: 'p.md', contents: validPrompt('picked-prompt', 'Picked Prompt') }] },
  afterRemove: [{ id: 'ws2', label: 'beta', displayPath: '/home/u/beta', lastOpened: null }]
};

async function mockDesktop(page: Page) {
  await page.addInitScript((data) => {
    // Minimal stand-in for the Tauri IPC bridge the desktop shell provides.
    const win = window as unknown as {
      __TAURI_INTERNALS__: unknown;
      __pbVersionMode?: VersionMode;
      __pbVersionRequests?: number;
    };
    win.__pbVersionRequests = 0;
    win.__TAURI_INTERNALS__ = {
      invoke: (cmd: string, args: { id?: string }) => {
        switch (cmd) {
          case 'plugin:app|version':
            win.__pbVersionRequests = (win.__pbVersionRequests ?? 0) + 1;
            switch (win.__pbVersionMode) {
              case 'reject':
                return Promise.reject(new Error('version unavailable'));
              case 'null':
                return Promise.resolve(null);
              case 'empty':
                return Promise.resolve('   ');
              case 'invalid':
                return Promise.resolve({ version: data.version });
              default:
                return Promise.resolve(data.version);
            }
          case 'read_global_prompts':
            return Promise.resolve(data.global);
          case 'list_workspaces':
            return Promise.resolve(data.recents);
          case 'open_workspace':
            return Promise.resolve(data.workspaces[args.id as string]);
          case 'pick_workspace':
            return Promise.resolve(data.picked);
          case 'remove_workspace':
            return Promise.resolve(data.afterRemove);
          case 'set_window_title':
            return Promise.resolve();
          default:
            return Promise.resolve(null);
        }
      }
    };
  }, mockData);
}

test.beforeEach(async ({ page }) => {
  await mockDesktop(page);
});

// Scope prompt-row assertions to the library region because the selected
// prompt's title can also appear in the composer.
const libraryButton = (page: Page, name: RegExp) =>
  page.getByRole('region', { name: 'Prompt library' }).getByRole('button', { name });

test('the Library tab shows built in and global prompts with source labels', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('tab', { name: 'Library' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Filter by source' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Global Tip, Global/ })).toBeVisible();
  // a built in prompt is still present and labelled
  await expect(page.getByRole('button', { name: /, Built in/ }).first()).toBeVisible();
  await expect(page.getByText('v9.8.7', { exact: true })).toBeVisible();
});

test('the tightest desktop masthead keeps Refresh and the version in bounds', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');

  const version = page.getByLabel('Version 9.8.7');
  const refresh = page.getByRole('button', { name: 'Refresh' });
  await expect(version).toBeVisible();
  await expect(refresh).toBeVisible();
  await expect(page.getByText('Compose reusable prompts from Markdown')).toBeHidden();

  const geometry = await page.locator('header').evaluate((header) => {
    const headerRect = header.getBoundingClientRect();
    const versionRect = header.querySelector('[aria-label="Version 9.8.7"]')?.getBoundingClientRect();
    const refreshRect = header.querySelector('button[title="Re-read prompt files from disk"]')?.getBoundingClientRect();
    return {
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      headerOverflow: header.scrollWidth - header.clientWidth,
      headerLeft: headerRect.left,
      headerRight: headerRect.right,
      versionLeft: versionRect?.left,
      refreshRight: refreshRect?.right
    };
  });

  expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
  expect(geometry.headerOverflow).toBeLessThanOrEqual(1);
  expect(geometry.versionLeft).toBeGreaterThanOrEqual(geometry.headerLeft - 1);
  expect(geometry.refreshRight).toBeLessThanOrEqual(geometry.headerRight + 1);
});

for (const versionMode of ['reject', 'null', 'empty', 'invalid'] as const) {
  test(`an unavailable ${versionMode} desktop version is omitted without an error`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.addInitScript((mode) => {
      (window as unknown as { __pbVersionMode: VersionMode }).__pbVersionMode = mode;
    }, versionMode);

    await page.goto('/');
    await expect(page.getByRole('button', { name: /Global Tip, Global/ })).toBeVisible();
    await expect.poll(() =>
      page.evaluate(() => (window as unknown as { __pbVersionRequests?: number }).__pbVersionRequests ?? 0)
    ).toBeGreaterThanOrEqual(1);

    await expect(page.locator('[aria-label^="Version "]')).toHaveCount(0);
    await expect(page.getByText('vnull', { exact: true })).toHaveCount(0);
    await expect(page.locator('header [role="status"], header [role="alert"]')).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });
}

test('opening a recent adds a workspace tab showing its folder prompts', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Recent folders' }).click();
  await page.getByRole('menuitem', { name: 'Open alpha' }).click();

  await expect(page.getByRole('tab', { name: 'alpha' })).toBeVisible();
  await expect(libraryButton(page, /Alpha Prompt/)).toBeVisible();
  // A folder tab holds a single source, so it shows no source sub-tabs.
  await expect(page.getByRole('group', { name: 'Filter by source' })).toHaveCount(0);
});

test('opening the Recent folders menu does not paint over the app', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Global Tip, Global/ })).toBeVisible();

  await page.getByRole('button', { name: 'Recent folders' }).click();
  await expect(page.getByRole('menuitem', { name: 'Open alpha' })).toBeVisible();

  // Regression: Fluent's applyStylesToPortals used to copy the app-shell
  // className onto the menu's portal FluentProvider, making it a full-viewport
  // opaque sheet (z-index 1000000) that hid the whole app behind the menu.
  // The masthead and content must stay hit-testable while the menu is open.
  const covered = await page.evaluate(() => {
    const h1 = document.querySelector('h1');
    if (!h1) return true;
    const r = h1.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + 5, r.top + r.height / 2);
    return !(hit === h1 || h1.contains(hit as Node));
  });
  expect(covered).toBe(false);
});

test('switching tabs shows each workspace independently', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Recent folders' }).click();
  await page.getByRole('menuitem', { name: 'Open alpha' }).click();
  await expect(libraryButton(page, /Alpha Prompt/)).toBeVisible();

  // Back to the Library tab: the folder prompt is gone, global remains.
  await page.getByRole('tab', { name: 'Library' }).click();
  await expect(libraryButton(page, /Alpha Prompt/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Global Tip, Global/ })).toBeVisible();

  // Open a second recent and switch to it.
  await page.getByRole('button', { name: 'Recent folders' }).click();
  await page.getByRole('menuitem', { name: 'Open beta' }).click();
  await expect(libraryButton(page, /Beta Prompt/)).toBeVisible();
  await expect(libraryButton(page, /Alpha Prompt/)).toHaveCount(0);
});

test('a folder tab can be closed, returning to the Library', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Recent folders' }).click();
  await page.getByRole('menuitem', { name: 'Open alpha' }).click();
  await expect(page.getByRole('tab', { name: 'alpha' })).toBeVisible();

  await page.getByRole('button', { name: 'Close alpha' }).click();
  await expect(page.getByRole('tab', { name: 'alpha' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Library' })).toBeVisible();
});

test('the folder picker opens a new workspace tab', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Open folder' }).click();
  await expect(page.getByRole('tab', { name: 'picked' })).toBeVisible();
  await expect(libraryButton(page, /Picked Prompt/)).toBeVisible();
});

test('forgetting a recent removes it from the menu', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Recent folders' }).click();
  await page.getByRole('menuitem', { name: 'Forget alpha' }).click();

  await page.getByRole('button', { name: 'Recent folders' }).click();
  await expect(page.getByRole('menuitem', { name: 'Open beta' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Open alpha' })).toHaveCount(0);
});

test('the desktop Library view has no serious or critical accessibility violations', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Global Tip, Global/ })).toBeVisible();

  const results = await new AxeBuilder({ page })
    // Fluent's TabList inserts aria-hidden `data-tabster-dummy` focus sentinels
    // that it manages via tabster; they are framework internals, not content.
    .exclude('[data-tabster-dummy]')
    .analyze();
  const serious = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(serious).toEqual([]);
});

for (const width of [320, 390, 768]) {
  test(`the desktop workspace view has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');

    // Open a folder tab so the strip holds more than one tab plus the actions.
    await page.getByRole('button', { name: 'Recent folders' }).click();
    await page.getByRole('menuitem', { name: 'Open alpha' }).click();
    await expect(page.getByRole('tab', { name: 'alpha' })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow of ${overflow}px at ${width}px`).toBeLessThanOrEqual(1);
  });
}

test('a folder tab has no source filter and the Library source filter cannot empty it', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Recent folders' }).click();
  await page.getByRole('menuitem', { name: 'Open alpha' }).click();
  await expect(libraryButton(page, /Alpha Prompt/)).toBeVisible();
  // The folder tab is single source, so there are no source sub-tabs to switch between.
  await expect(page.getByRole('group', { name: 'Filter by source' })).toHaveCount(0);

  // Narrow the Library tab down to its Global source only.
  await page.getByRole('tab', { name: 'Library' }).click();
  await page.getByRole('group', { name: 'Filter by source' }).getByRole('button', { name: 'Global' }).click();
  await expect(page.getByRole('button', { name: /Global Tip, Global/ })).toBeVisible();

  // Back on the folder tab, the inherited Global filter must not empty it.
  await page.getByRole('tab', { name: 'alpha' }).click();
  await expect(libraryButton(page, /Alpha Prompt/)).toBeVisible();
});

test('a delayed global load preserves in-progress composer input', async ({ page }) => {
  await page.addInitScript(() => {
    const internals = (window as unknown as { __TAURI_INTERNALS__: Internals }).__TAURI_INTERNALS__;
    const base = internals.invoke;
    internals.invoke = (cmd, args) => {
      if (cmd === 'read_global_prompts') {
        return new Promise((resolve) => setTimeout(() => base(cmd, args).then(resolve), 1000));
      }
      return base(cmd, args);
    };
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Rewrite for Clarity' }).click();
  const sentinel = 'A distinctive sentinel sentence.';
  await page.getByLabel('draft', { exact: true }).fill(sentinel);

  // Global lands after the delay and recomputes the data.
  await expect(page.getByRole('button', { name: /Global Tip, Global/ })).toBeVisible({ timeout: 6000 });

  // The composer input must survive the recompute, not be reset.
  await expect(page.getByLabel('draft', { exact: true })).toHaveValue(sentinel);
});

test('a picked folder stays ready even if a prior in-flight load for it rejects', async ({ page }) => {
  const alphaPrompt = validPrompt('alpha-prompt', 'Alpha Prompt');
  await page.addInitScript((md) => {
    const internals = (window as unknown as { __TAURI_INTERNALS__: Internals }).__TAURI_INTERNALS__;
    const base = internals.invoke;
    internals.invoke = (cmd, args) => {
      if (cmd === 'open_workspace' && args.id === 'ws1') {
        return new Promise((_resolve, reject) => setTimeout(() => reject({ kind: 'moved', message: 'gone' }), 600));
      }
      if (cmd === 'pick_workspace') {
        return Promise.resolve({ workspaceId: 'ws1', label: 'alpha', files: [{ relativePath: 'a.md', contents: md }] });
      }
      return base(cmd, args);
    };
  }, alphaPrompt);

  await page.goto('/');
  // Start a slow, failing recent load for ws1, then immediately pick the same folder.
  await page.getByRole('button', { name: 'Recent folders' }).click();
  await page.getByRole('menuitem', { name: 'Open alpha' }).click();
  await page.getByRole('button', { name: 'Open folder' }).click();
  await expect(libraryButton(page, /Alpha Prompt/)).toBeVisible();

  // Let the stale rejection fire; the picked tab must not turn into an error.
  await page.waitForTimeout(900);
  await expect(page.getByText(/could not be read/)).toHaveCount(0);
  await expect(libraryButton(page, /Alpha Prompt/)).toBeVisible();
});

test('re-picking the same folder with changed content refreshes composer defaults', async ({ page }) => {
  await page.addInitScript(() => {
    const internals = (window as unknown as { __TAURI_INTERNALS__: Internals }).__TAURI_INTERNALS__;
    const base = internals.invoke;
    let pickCount = 0;
    internals.invoke = (cmd, args) => {
      if (cmd === 'pick_workspace') {
        pickCount += 1;
        const def = pickCount === 1 ? 'first-default' : 'second-default';
        const md =
          '---\nid: repick-prompt\ntitle: Repick Prompt\ndescription: A prompt\ncategory: review\n' +
          'variables:\n  - name: topic\n    description: A topic\n    required: false\n    default: ' +
          def +
          '\n---\nUse {{topic}} now.';
        return Promise.resolve({ workspaceId: 'ws1', label: 'alpha', files: [{ relativePath: 'a.md', contents: md }] });
      }
      return base(cmd, args);
    };
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Open folder' }).click();
  await page.getByRole('button', { name: /Repick Prompt/ }).click();
  await expect(page.getByLabel('topic', { exact: true })).toHaveValue('first-default');

  // Edit the field, then re-pick the same folder whose content changed.
  await page.getByLabel('topic', { exact: true }).fill('edited');
  await page.getByRole('button', { name: 'Open folder' }).click();

  // The composer refreshes to the new default, not the edit or the old default.
  await expect(page.getByLabel('topic', { exact: true })).toHaveValue('second-default');
});
