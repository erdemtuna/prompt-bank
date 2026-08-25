import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  collectReleaseNoteEntries,
  compareStableVersions,
  normalizeGitHubRemote,
  parseStableVersion,
  parseReleaseCommit,
  readFirstParentCommits,
  renderReleaseNotes,
  resolvePreviousTag,
  writeReleaseNotesFile,
  type GitCommand,
  type ReleaseCommit
} from './releaseNotes';

const workspaces: string[] = [];
const HASH_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const HASH_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

describe('release-note trailer parsing', () => {
  it('uses improvement by default and retains multiple entries in declaration order', () => {
    const entries = parseReleaseCommit(commit({
      body: [
        'Implementation context.',
        '',
        'Release-Note: Added the first capability.',
        'Co-authored-by: Example <example@example.com>',
        'Release-Note: Improved the follow-up.',
        'Copilot-Session: session-id'
      ].join('\n')
    }));

    expect(entries).toEqual([
      { category: 'improvement', text: 'Added the first capability.', commitHash: HASH_A },
      { category: 'improvement', text: 'Improved the follow-up.', commitHash: HASH_A }
    ]);
  });

  it('ignores an earlier Release-Note paragraph when a later trailer block is terminal', () => {
    expect(parseReleaseCommit(commit({
      subject: 'Use the fallback subject',
      body: [
        'Release-Note: This paragraph is not in the terminal trailer block.',
        '',
        'Co-authored-by: Example <example@example.com>',
        'Copilot-Session: session-id'
      ].join('\n')
    }))).toEqual([{
      category: 'other',
      text: 'Use the fallback subject',
      commitHash: HASH_A
    }]);
  });

  it('retains a typed release-note block immediately before terminal attribution trailers', () => {
    expect(parseReleaseCommit(commit({
      body: [
        'Release-Note-Type: improvement',
        'Release-Note: Made plans adapt to task complexity.',
        'Release-Note: Improved analytical report flow.',
        '',
        'Co-authored-by: Example <example@example.com>',
        'Copilot-Session: session-id'
      ].join('\n')
    }))).toEqual([
      {
        category: 'improvement',
        text: 'Made plans adapt to task complexity.',
        commitHash: HASH_A
      },
      {
        category: 'improvement',
        text: 'Improved analytical report flow.',
        commitHash: HASH_A
      }
    ]);
  });

  it('ignores a typed release-note block when the terminal paragraph is prose', () => {
    expect(parseReleaseCommit(commit({
      subject: 'Use the fallback subject',
      body: [
        'Release-Note-Type: improvement',
        'Release-Note: This paragraph is not terminal metadata.',
        '',
        'This is ordinary prose at the end.'
      ].join('\n')
    }))).toEqual([{
      category: 'other',
      text: 'Use the fallback subject',
      commitHash: HASH_A
    }]);
  });

  it('retains indented multiline continuations in the terminal trailer block', () => {
    expect(parseReleaseCommit(commit({
      body: [
        'Release-Note-Type: feature',
        'Release-Note: Added a capability that spans',
        '  multiple trailer lines.',
        'Co-authored-by: Example <example@example.com>'
      ].join('\n')
    }))).toEqual([{
      category: 'feature',
      text: 'Added a capability that spans multiple trailer lines.',
      commitHash: HASH_A
    }]);
  });

  it.each([
    ['feature', 'feature'],
    ['improvement', 'improvement'],
    ['fix', 'fix'],
    ['docs', 'docs'],
    ['internal', 'internal'],
    ['future-kind', 'other']
  ] as const)('maps Release-Note-Type %s to %s', (type, category) => {
    expect(parseReleaseCommit(commit({
      body: `Release-Note-Type: ${type}\nRelease-Note: A visible change.`
    }))).toEqual([
      { category, text: 'A visible change.', commitHash: HASH_A }
    ]);
  });

  it('skips the commit when skip is the only release-note metadata', () => {
    expect(parseReleaseCommit(commit({
      body: 'Release-Note: skip'
    }))).toEqual([]);
  });

  it('rejects skip mixed with visible notes or a release-note type', () => {
    expect(() => parseReleaseCommit(commit({
      body: 'Release-Note: A visible change.\nRelease-Note: skip'
    }))).toThrow(/must use Release-Note: skip by itself/);
    expect(() => parseReleaseCommit(commit({
      body: 'Release-Note-Type: internal\nRelease-Note: skip'
    }))).toThrow(/must use Release-Note: skip by itself/);
  });

  it('falls back to a direct or squash commit subject under Other changes', () => {
    expect(parseReleaseCommit(commit({
      subject: 'Keep [Markdown] *characters* and `code`',
      body: 'This ordinary body line: is not a trailer paragraph.'
    }))).toEqual([{
      category: 'other',
      text: 'Keep [Markdown] *characters* and `code`',
      commitHash: HASH_A
    }]);
  });

  it('allows a merge commit with structured metadata', () => {
    expect(parseReleaseCommit(commit({
      parents: [HASH_A, HASH_B],
      body: 'Release-Note-Type: fix\nRelease-Note: Fixed merged behavior.'
    }))).toEqual([{
      category: 'fix',
      text: 'Fixed merged behavior.',
      commitHash: HASH_A
    }]);
  });

  it('rejects a merge commit without a Release-Note trailer', () => {
    expect(() => parseReleaseCommit(commit({
      parents: [HASH_A, HASH_B],
      subject: 'Merge pull request #12'
    }))).toThrow(/Merge commit .* has no Release-Note trailer/);
  });

  it('rejects multiple type trailers as ambiguous', () => {
    expect(() => parseReleaseCommit(commit({
      body: [
        'Release-Note-Type: feature',
        'Release-Note-Type: fix',
        'Release-Note: Added something.'
      ].join('\n')
    }))).toThrow(/multiple Release-Note-Type/);
  });

  it('does not parse an ordinary body paragraph as trailers', () => {
    expect(parseReleaseCommit(commit({
      subject: 'Fallback subject',
      body: 'Release-Note: This is ordinary prose.\nIt continues on a non-trailer line.'
    }))).toEqual([{
      category: 'other',
      text: 'Fallback subject',
      commitHash: HASH_A
    }]);
  });
});

describe('release-note rendering', () => {
  it('uses fixed category order and preserves commit order within categories', () => {
    const entries = collectReleaseNoteEntries([
      commit({
        hash: HASH_A,
        body: 'Release-Note-Type: fix\nRelease-Note: First fix.'
      }),
      commit({
        hash: HASH_B,
        body: 'Release-Note-Type: feature\nRelease-Note: Later feature.'
      }),
      commit({
        hash: 'cccccccccccccccccccccccccccccccccccccccc',
        body: 'Release-Note-Type: fix\nRelease-Note: Second fix.'
      })
    ]);
    const markdown = renderReleaseNotes(
      '1.2.0',
      'v1.1.0',
      'https://github.com/example/prompt-bank',
      entries
    );

    expect(markdown.indexOf('## New features')).toBeLessThan(markdown.indexOf('## Fixes'));
    expect(markdown.indexOf('First fix.')).toBeLessThan(markdown.indexOf('Second fix.'));
    expect(markdown).toContain('Later feature. ([`bbbbbbb`](https://github.com/example/prompt-bank/commit/');
    expect(markdown).toContain('/compare/v1.1.0...v1.2.0)');
    expect(markdown).toContain('installers are currently unsigned');
    expect(markdown.endsWith('\n')).toBe(true);
  });

  it('fails when every selected commit is skipped', () => {
    expect(() => renderReleaseNotes(
      '1.2.0',
      'v1.1.0',
      'https://github.com/example/prompt-bank',
      []
    )).toThrow(/No eligible release-note entries/);
  });
});

describe('Git release range helpers', () => {
  it('chooses the greatest reachable stable tag below the target', () => {
    const git = fakeGit((args) => {
      if (args[0] === 'rev-parse') return success(`${HASH_B}\n`);
      if (args[0] === 'tag') {
        return success('v0.9.0\nv1.0.0\nv1.2.0\nv1.1.5\nv1.1.5-beta.1\n');
      }
      if (args[0] === 'merge-base') return success('');
      return failure('unexpected command');
    });

    expect(resolvePreviousTag('.', '1.2.0', HASH_B, undefined, git)).toBe('v1.1.5');
  });

  it('rejects a missing or invalid Git range', () => {
    const git = fakeGit(() => failure('fatal: ambiguous argument'));
    expect(() => readFirstParentCommits('.', 'v1.0.0', 'HEAD', git))
      .toThrow(/Invalid Git range/);
  });

  it('rejects an empty Git range', () => {
    const git = fakeGit(() => success(''));
    expect(() => readFirstParentCommits('.', 'v1.0.0', 'HEAD', git))
      .toThrow(/No commits exist/);
  });

  it('uses the requested head as the terminal revision in the first-parent range', () => {
    const calls: string[][] = [];
    const git = fakeGit((args) => {
      calls.push([...args]);
      if (args[0] === 'rev-list') return success(`${HASH_A}\n`);
      if (args[0] === 'show') {
        return success(`${HASH_A}\0${HASH_B}\0A subject\0Release-Note: A change.\n`);
      }
      return failure('unexpected command');
    });

    expect(readFirstParentCommits('.', 'v1.0.0', 'v1.1.0', git)).toHaveLength(1);
    expect(calls[0]).toEqual([
      'rev-list',
      '--first-parent',
      '--reverse',
      'v1.0.0..v1.1.0'
    ]);
  });

  it('rejects prerelease, build-metadata, and leading-zero versions', () => {
    expect(() => parseStableVersion('1.2.0-beta.1')).toThrow(/Invalid stable version/);
    expect(() => parseStableVersion('1.2.0+build.1')).toThrow(/Invalid stable version/);
    expect(() => parseStableVersion('01.2.0')).toThrow(/Invalid stable version/);
    expect(compareStableVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
  });

  it('fails when no reachable predecessor exists', () => {
    const git = fakeGit((args) => {
      if (args[0] === 'rev-parse') return success(`${HASH_B}\n`);
      if (args[0] === 'tag') return success('v2.0.0\nv1.2.0-beta.1\n');
      return failure('unexpected command');
    });
    expect(() => resolvePreviousTag('.', '1.2.0', HASH_B, undefined, git))
      .toThrow(/No reachable stable version tag/);
  });
});

describe('GitHub remote normalization', () => {
  it.each([
    ['https://github.com/example/prompt-bank.git', 'https://github.com/example/prompt-bank'],
    ['git+https://github.com/example/prompt-bank.git', 'https://github.com/example/prompt-bank'],
    ['https://github.com/example/prompt-bank/', 'https://github.com/example/prompt-bank'],
    ['git@github.com:example/prompt-bank.git', 'https://github.com/example/prompt-bank'],
    ['ssh://git@github.com/example/prompt-bank.git', 'https://github.com/example/prompt-bank']
  ])('normalizes %s', (remote, expected) => {
    expect(normalizeGitHubRemote(remote)).toBe(expected);
  });

  it('rejects unsupported hosts', () => {
    expect(() => normalizeGitHubRemote('https://gitlab.com/example/prompt-bank.git'))
      .toThrow(/Unsupported repository remote/);
  });
});

describe('release-note file writes', () => {
  it('refuses overwrite unless force is supplied', () => {
    const workspace = join(
      process.cwd(),
      `.release-notes-test-${process.pid}-${Math.random().toString(16).slice(2)}`
    );
    workspaces.push(workspace);
    mkdirSync(workspace);
    const outputPath = join(workspace, 'v1.2.0.md');
    writeFileSync(outputPath, 'old', 'utf8');

    expect(() => writeReleaseNotesFile(outputPath, 'new')).toThrow(/Refusing to overwrite/);
    expect(readFileSync(outputPath, 'utf8')).toBe('old');

    writeReleaseNotesFile(outputPath, 'new', true);
    expect(existsSync(outputPath)).toBe(true);
    expect(readFileSync(outputPath, 'utf8')).toBe('new');
  });
});

function commit(overrides: Partial<ReleaseCommit> = {}): ReleaseCommit {
  return {
    hash: HASH_A,
    parents: [HASH_B],
    subject: 'Subject fallback',
    body: '',
    ...overrides
  };
}

function fakeGit(handler: (args: readonly string[]) => ReturnType<typeof success>): GitCommand {
  return (args) => handler(args);
}

function success(stdout: string) {
  return { status: 0, stdout, stderr: '' };
}

function failure(stderr: string) {
  return { status: 128, stdout: '', stderr };
}
