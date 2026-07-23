import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const validPrompt = (id: string, title: string, category = 'review') =>
  `---\nid: ${id}\ntitle: ${title}\ndescription: ${title} prompt\ncategory: ${category}\n---\nBody for ${id}.`;

type Internals = { invoke: (cmd: string, args: { id?: string }) => Promise<unknown> };

const mockData = {
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
    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
      invoke: (cmd: string, args: { id?: string }) => {
        switch (cmd) {
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

test('the Library tab shows built in and global prompts with source labels', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('tab', { name: 'Library' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Filter by source' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Global Tip, Global/ })).toBeVisible();
  // a built in prompt is still present and labelled
  await expect(page.getByRole('button', { name: /, Built in/ }).first()).toBeVisible();
});

test('opening a recent adds a workspace tab showing its folder prompts', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Recent folders' }).click();
  await page.getByRole('menuitem', { name: 'Open alpha' }).click();

  await expect(page.getByRole('tab', { name: 'alpha' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Alpha Prompt, Folder/ })).toBeVisible();
});

test('switching tabs shows each workspace independently', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Recent folders' }).click();
  await page.getByRole('menuitem', { name: 'Open alpha' }).click();
  await expect(page.getByRole('button', { name: /Alpha Prompt, Folder/ })).toBeVisible();

  // Back to the Library tab: the folder prompt is gone, global remains.
  await page.getByRole('tab', { name: 'Library' }).click();
  await expect(page.getByRole('button', { name: /Alpha Prompt/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Global Tip, Global/ })).toBeVisible();

  // Open a second recent and switch to it.
  await page.getByRole('button', { name: 'Recent folders' }).click();
  await page.getByRole('menuitem', { name: 'Open beta' }).click();
  await expect(page.getByRole('button', { name: /Beta Prompt, Folder/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Alpha Prompt/ })).toHaveCount(0);
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
  await expect(page.getByRole('button', { name: /Picked Prompt, Folder/ })).toBeVisible();
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

test('a source filter from one tab does not empty another tab', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Recent folders' }).click();
  await page.getByRole('menuitem', { name: 'Open alpha' }).click();
  await expect(page.getByRole('button', { name: /Alpha Prompt, Folder/ })).toBeVisible();

  // Filter the alpha tab down to Folder only.
  await page.getByRole('group', { name: 'Filter by source' }).getByRole('button', { name: 'Folder' }).click();
  await expect(page.getByRole('button', { name: /Alpha Prompt, Folder/ })).toBeVisible();

  // The Library tab has no Folder source; it must still show its prompts, not an empty view.
  await page.getByRole('tab', { name: 'Library' }).click();
  await expect(page.getByRole('button', { name: /Global Tip, Global/ })).toBeVisible();
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
  await page.getByRole('button', { name: 'Summarize Text' }).click();
  const sentinel = 'A distinctive sentinel sentence.';
  await page.getByLabel('sourceText', { exact: true }).fill(sentinel);

  // Global lands after the delay and recomputes the data.
  await expect(page.getByRole('button', { name: /Global Tip, Global/ })).toBeVisible({ timeout: 6000 });

  // The composer input must survive the recompute, not be reset.
  await expect(page.getByLabel('sourceText', { exact: true })).toHaveValue(sentinel);
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
  await expect(page.getByRole('button', { name: /Alpha Prompt, Folder/ })).toBeVisible();

  // Let the stale rejection fire; the picked tab must not turn into an error.
  await page.waitForTimeout(900);
  await expect(page.getByText(/could not be read/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Alpha Prompt, Folder/ })).toBeVisible();
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
  await page.getByRole('button', { name: /Repick Prompt, Folder/ }).click();
  await expect(page.getByLabel('topic', { exact: true })).toHaveValue('first-default');

  // Edit the field, then re-pick the same folder whose content changed.
  await page.getByLabel('topic', { exact: true }).fill('edited');
  await page.getByRole('button', { name: 'Open folder' }).click();

  // The composer refreshes to the new default, not the edit or the old default.
  await expect(page.getByLabel('topic', { exact: true })).toHaveValue('second-default');
});
