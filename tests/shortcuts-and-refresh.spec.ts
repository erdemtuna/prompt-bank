import { expect, test, type Page } from '@playwright/test';

/**
 * Desktop bridge whose global set only grows once the test says so, so a Refresh
 * can be observed picking up an edit that happened on disk after startup. The
 * flag is explicit rather than a read counter because React may mount effects
 * more than once.
 */
async function mockDesktopWithChangingGlobal(page: Page) {
  await page.addInitScript(() => {
    const one = { relativePath: 'one.md', contents: '---\nid: g-one\ntitle: Global One\ndescription: Global One prompt\ncategory: review\n---\nBody for g-one.' };
    const two = { relativePath: 'two.md', contents: '---\nid: g-two\ntitle: Added On Disk\ndescription: Added On Disk prompt\ncategory: review\n---\nBody for g-two.' };
    const win = window as unknown as { __TAURI_INTERNALS__: unknown; __pbWriteSecondPrompt: () => void };
    let secondExists = false;
    win.__pbWriteSecondPrompt = () => {
      secondExists = true;
    };
    win.__TAURI_INTERNALS__ = {
      invoke: (cmd: string) => {
        switch (cmd) {
          case 'read_global_prompts':
            return Promise.resolve({ files: secondExists ? [one, two] : [one] });
          case 'list_workspaces':
            return Promise.resolve([]);
          case 'set_window_title':
            return Promise.resolve();
          default:
            return Promise.resolve(null);
        }
      }
    };
  });
}

test('Ctrl+K focuses the index search from anywhere in the app', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Review a Pull Request' })).toBeVisible();

  const search = page.getByLabel('Search prompts');
  await expect(search).not.toBeFocused();

  // Focus starts inside the composer, so the shortcut has to work from a field.
  await page.getByLabel('pullRequest', { exact: true }).click();
  await page.keyboard.press('Control+k');

  await expect(search).toBeFocused();
  await search.fill('worktree');
  await expect(page.getByRole('button', { name: 'New Worktree' })).toBeVisible();
});

test('Ctrl+Enter copies the composed prompt without touching the button', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Refactor Code' }).click();

  const sentinel = 'src/data/loaders.ts';
  await page.getByLabel('target', { exact: true }).fill(sentinel);
  await page.getByLabel('outcome', { exact: true }).fill('Split the resolver.');

  // Fire the shortcut from inside a variable field, which is where a user ends up.
  await page.getByLabel('outcome', { exact: true }).press('Control+Enter');

  await expect(page.getByText('Prompt copied.')).toBeVisible();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain(sentinel);
});

test('Ctrl+Enter reports why copying is blocked instead of copying nothing', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Refactor Code' }).click();

  // The always-on "Copy disabled — ..." line already names the missing
  // variable, so the reason alone proves nothing. The shortcut has to raise a
  // second, separate copy of it in the feedback slot. Counting both occurrences
  // keeps this test failing if the key handler stops firing.
  const reason = page.getByText('Missing required variable "target".');
  await expect(reason).toHaveCount(1);

  await page.getByLabel('target', { exact: true }).press('Control+Enter');

  await expect(reason).toHaveCount(2);
  await expect(page.getByText('Prompt copied.')).toHaveCount(0);
});

test('the shortcut hints are visible so the shortcuts are discoverable', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Review a Pull Request' })).toBeVisible();

  // The hint follows the host platform, so the expectation has to as well or
  // this fails for every contributor on macOS.
  await expect(page.getByLabel('Search prompts')).toHaveAttribute('placeholder', /(Ctrl|Cmd)\+K/);
  await expect(page.getByText(/(Ctrl|Cmd) \+ Enter/)).toBeVisible();
});

test('Refresh re-reads prompt files that changed on disk', async ({ page }) => {
  await mockDesktopWithChangingGlobal(page);
  await page.goto('/');

  await expect(page.getByRole('button', { name: /Global One/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Added On Disk/ })).toHaveCount(0);

  // Simulate the user adding a prompt file while the app is already running.
  await page.evaluate(() => (window as unknown as { __pbWriteSecondPrompt: () => void }).__pbWriteSecondPrompt());
  await expect(page.getByRole('button', { name: /Added On Disk/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Refresh' }).click();

  await expect(page.getByRole('button', { name: /Added On Disk/ }).first()).toBeVisible();
});

test('the empty state explains where prompts go and offers a working example', async ({ page }) => {
  // A folder workspace with no prompt files is the real first-run dead end.
  await page.addInitScript(() => {
    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
      invoke: (cmd: string) => {
        switch (cmd) {
          case 'read_global_prompts':
            return Promise.resolve({ files: [] });
          case 'list_workspaces':
            return Promise.resolve([{ id: 'ws1', label: 'empty-project', displayPath: '/home/u/empty-project', lastOpened: null }]);
          case 'open_workspace':
            return Promise.resolve({ workspaceId: 'ws1', label: 'empty-project', files: [] });
          case 'set_window_title':
            return Promise.resolve();
          default:
            return Promise.resolve(null);
        }
      }
    };
  });
  await page.goto('/');

  await page.getByRole('button', { name: 'Recent folders' }).click();
  await page.getByRole('menuitem', { name: 'Open empty-project' }).click();

  await expect(page.getByText('empty-project has no prompts yet')).toBeVisible();
  await expect(page.getByText('.prompt-bank/<category>/your-prompt.md')).toBeVisible();
  await expect(page.getByText('title: My Prompt')).toBeVisible();

  await page.getByRole('button', { name: 'Copy example' }).click();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain('id: my-prompt');
  expect(clipboard).toContain('{{topic}}');
});
