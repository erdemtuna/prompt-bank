// @vitest-environment jsdom
import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isDesktop,
  listWorkspaces,
  openWorkspace,
  pickWorkspace,
  readGlobalPrompts,
  removeWorkspace,
  setWindowTitle
} from './desktopClient';

afterEach(() => clearMocks());

describe('desktopClient', () => {
  it('reports desktop only when the Tauri internals are present', () => {
    expect(isDesktop()).toBe(false);
    mockIPC(() => undefined);
    expect(isDesktop()).toBe(true);
  });

  it('maps global prompts into a global source input', async () => {
    mockIPC((cmd) => {
      if (cmd === 'read_global_prompts') {
        return { files: [{ relativePath: 'review/a.md', contents: 'A' }] };
      }
      throw new Error(`unexpected command ${cmd}`);
    });

    const input = await readGlobalPrompts();
    expect(input.source).toBe('global');
    expect(input.sourceLabel).toBe('Global');
    expect(input.files).toEqual({ 'review/a.md': 'A' });
  });

  it('maps an opened workspace into a folder source keyed by workspace id', async () => {
    mockIPC((cmd, args) => {
      if (cmd === 'open_workspace') {
        expect(args).toEqual({ id: 'ws1' });
        return { workspaceId: 'ws1', label: 'proj', files: [{ relativePath: 'x.md', contents: 'X' }] };
      }
      throw new Error(`unexpected command ${cmd}`);
    });

    const opened = await openWorkspace('ws1');
    expect(opened.workspaceId).toBe('ws1');
    expect(opened.label).toBe('proj');
    expect(opened.source).toEqual({
      source: 'folder',
      sourceLabel: 'Folder',
      instanceId: 'ws1',
      files: { 'x.md': 'X' }
    });
  });

  it('returns null when the folder picker is cancelled', async () => {
    mockIPC((cmd) => (cmd === 'pick_workspace' ? null : undefined));
    expect(await pickWorkspace()).toBeNull();
  });

  it('passes the id when removing a workspace and returns the updated list', async () => {
    mockIPC((cmd, args) => {
      if (cmd === 'remove_workspace') {
        expect(args).toEqual({ id: 'ws2' });
        return [{ id: 'ws1', label: 'a', displayPath: '/a', lastOpened: null }];
      }
      throw new Error(`unexpected command ${cmd}`);
    });

    const list = await removeWorkspace('ws2');
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('ws1');
  });

  it('rejects when a command errors', async () => {
    mockIPC(() => {
      throw { kind: 'symlink', message: 'A symlink was found.' };
    });
    await expect(listWorkspaces()).rejects.toBeDefined();
  });

  it('invokes set_window_title with the title', async () => {
    const spy = vi.fn();
    mockIPC((cmd, args) => {
      spy(cmd, args);
      return undefined;
    });

    await setWindowTitle('Prompt Bank: proj');
    expect(spy).toHaveBeenCalledWith('set_window_title', { title: 'Prompt Bank: proj' });
  });
});
