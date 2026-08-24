import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canonicalizeReleaseBody,
  releaseBodiesEqual,
  validateReleaseNotes
} from './releaseNotesValidation';
import type { GitCommand, GitResult } from './releaseNotes';

const REPOSITORY_URL = 'https://github.com/example/prompt-bank';
const HEAD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PREVIOUS = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

describe('release-note validation', () => {
  it('accepts synchronized sources and a reachable predecessor without requiring the target tag', () => {
    const fixture = createFixture();
    const calls: string[][] = [];

    const result = validateReleaseNotes(fixture.root, {
      ...fixture.dependencies,
      git: recordingGit(calls, validGit)
    });

    expect(result).toMatchObject({
      version: '0.6.1',
      previousTag: 'v0.6.0',
      notesPath: fixture.notesPath
    });
    expect(calls).not.toContainEqual([
      'rev-parse',
      '--verify',
      'refs/tags/v0.6.1^{commit}'
    ]);
    expect(calls.some(([command]) => command === 'remote')).toBe(false);
  });

  it('uses canonical package repository metadata when origin is a fork', () => {
    const fixture = createFixture();
    const calls: string[][] = [];

    expect(validateReleaseNotes(fixture.root, {
      ...fixture.dependencies,
      git: recordingGit(calls, validGit)
    }).version).toBe('0.6.1');
    expect(calls.some(([command]) => command === 'remote')).toBe(false);
  });

  it('rejects missing package repository metadata', () => {
    const fixture = createFixture();
    replaceFile(
      fixture,
      'package.json',
      ',\n  "repository": {\n    "type": "git",\n    "url": "git+https://github.com/example/prompt-bank.git"\n  }',
      ''
    );
    expect(() => validate(fixture)).toThrow(/repository metadata/);
  });

  it('rejects a missing versioned release-note file', () => {
    const fixture = createFixture();
    fixture.files.delete(fixture.notesPath);

    expect(() => validate(fixture)).toThrow(/Missing release-note file v0\.6\.1\.md/);
  });

  it.each([
    ['package-lock root', (fixture: Fixture) => {
      replaceFile(fixture, 'package-lock.json', '"version": "0.6.1"', '"version": "0.6.0"');
    }],
    ['package-lock root package', (fixture: Fixture) => {
      replaceFile(
        fixture,
        'package-lock.json',
        '"version": "0.6.1"',
        '"version": "0.6.0"',
        2
      );
    }],
    ['Cargo.toml package', (fixture: Fixture) => {
      replaceFile(fixture, join('src-tauri', 'Cargo.toml'), 'version = "0.6.1"', 'version = "0.6.0"');
    }],
    ['Prompt Bank Cargo.lock package', (fixture: Fixture) => {
      replaceFile(fixture, join('src-tauri', 'Cargo.lock'), 'version = "0.6.1"', 'version = "0.6.0"');
    }]
  ])('rejects a mismatch in the %s version', (_label, mutate) => {
    const fixture = createFixture();
    mutate(fixture);
    expect(() => validate(fixture)).toThrow(/Version mismatch/);
  });

  it('rejects unstable package versions', () => {
    const fixture = createFixture();
    replaceFile(fixture, 'package.json', '"version": "0.6.1"', '"version": "0.6.1-beta.1"');
    expect(() => validate(fixture)).toThrow(/Invalid stable version/);
  });

  it('rejects filename and H1 version disagreement', () => {
    const fixture = createFixture();
    const wrongPath = join(fixture.root, 'docs', 'releases', 'v0.6.0.md');
    expect(() => validateReleaseNotes(fixture.root, {
      ...fixture.dependencies,
      notesPath: wrongPath,
      git: validGit
    })).toThrow(/filename version mismatch/);

    fixture.files.set(
      fixture.notesPath,
      validNotes().replace('# Prompt Bank 0.6.1', '# Prompt Bank 0.6.0')
    );
    expect(() => validate(fixture)).toThrow(/H1 version mismatch/);
  });

  it.each([
    ['an empty file', ''],
    ['only footer boilerplate', validNotes().replace(
      '## Improvements\n\n- Added deterministic release notes.\n\n',
      ''
    )],
    ['an empty bullet', validNotes().replace(
      '- Added deterministic release notes.',
      '- '
    )],
    ['a placeholder', validNotes().replace(
      'Added deterministic release notes.',
      'TODO: describe this release.'
    )]
  ])('rejects %s', (_label, body) => {
    const fixture = createFixture(body);
    expect(() => validate(fixture)).toThrow(
      /empty|non-empty change bullet|template placeholder/
    );
  });

  it('requires the Downloads section, release asset link, and unsigned warning', () => {
    const missingSection = createFixture(
      validNotes().replace('## Downloads', '## Installation')
    );
    expect(() => validate(missingSection)).toThrow(/missing the Downloads section/);

    const missingLink = createFixture(
      validNotes().replace('/releases/tag/v0.6.1', '/releases/tag/v0.6.0')
    );
    expect(() => validate(missingLink)).toThrow(/exactly one Markdown link/);

    const embeddedLink = createFixture(
      validNotes().replace(
        'https://github.com/example/prompt-bank/releases/tag/v0.6.1',
        'https://example.invalid/?next=https://github.com/example/prompt-bank/releases/tag/v0.6.1'
      )
    );
    expect(() => validate(embeddedLink)).toThrow(/exactly one Markdown link/);

    const duplicateLink = createFixture(
      validNotes().replace(
        '> [!WARNING]',
        `A second [release link](${REPOSITORY_URL}/releases/tag/v0.6.1).\n\n> [!WARNING]`
      )
    );
    expect(() => validate(duplicateLink)).toThrow(/exactly one Markdown link/);

    const missingWarning = createFixture(
      validNotes().replace(
        '> Prompt Bank installers are currently unsigned. Windows and macOS may display a security warning.',
        '> Install the downloaded package.'
      )
    );
    expect(() => validate(missingWarning)).toThrow(/unsigned-build warning/);
  });

  it('rejects missing, wrong-target, invalid, and reversed changelog ranges', () => {
    const missing = createFixture(
      validNotes().replace('[Full changelog]', '[Commit comparison]')
    );
    expect(() => validate(missing)).toThrow(/exactly one Full changelog/);

    const wrongTarget = createFixture(
      validNotes().replace('v0.6.0...v0.6.1', 'v0.6.0...v0.6.2')
    );
    expect(() => validate(wrongTarget)).toThrow(/target mismatch/);

    const unstable = createFixture(
      validNotes().replace('v0.6.0...v0.6.1', 'v0.6.0-beta.1...v0.6.1')
    );
    expect(() => validate(unstable)).toThrow(/Invalid stable version|Full changelog must use/);

    const reversed = createFixture(
      validNotes().replace('v0.6.0...v0.6.1', 'v0.7.0...v0.6.1')
    );
    expect(() => validate(reversed)).toThrow(/must be lower/);
  });

  it('rejects a missing or unreachable predecessor tag', () => {
    const missing = createFixture();
    expect(() => validateReleaseNotes(missing.root, {
      ...missing.dependencies,
      git: commandGit((args) => (
        args[0] === 'rev-parse' && args[2]?.startsWith('refs/tags/')
          ? failure('unknown revision')
          : validGit(args)
      ))
    })).toThrow(/Previous tag v0\.6\.0 does not exist/);

    const unreachable = createFixture();
    expect(() => validateReleaseNotes(unreachable.root, {
      ...unreachable.dependencies,
      git: commandGit((args) => (
        args[0] === 'merge-base'
          ? { status: 1, stdout: '', stderr: '' }
          : validGit(args)
      ))
    })).toThrow(/not an ancestor/);
  });
});

describe('release body canonicalization', () => {
  it('normalizes LF, CRLF, and CR before comparing draft bodies', () => {
    expect(canonicalizeReleaseBody('line one\r\nline two\r'))
      .toBe('line one\nline two');
    expect(releaseBodiesEqual('line one\nline two\n', 'line one\r\nline two\r\n'))
      .toBe(true);
  });

  it('ignores at most one terminal newline without trimming other content', () => {
    expect(releaseBodiesEqual('body', 'body\n')).toBe(true);
    expect(releaseBodiesEqual('body\n', 'body\n\n')).toBe(false);
    expect(releaseBodiesEqual('body ', 'body')).toBe(false);
    expect(releaseBodiesEqual('body\n\nsection', 'body\nsection')).toBe(false);
  });
});

interface Fixture {
  dependencies: {
    exists: (path: string) => boolean;
    readFile: (path: string) => string;
  };
  files: Map<string, string>;
  notesPath: string;
  root: string;
}

function createFixture(notes = validNotes()): Fixture {
  const root = join(process.cwd(), 'virtual-release-validation');
  const notesPath = join(root, 'docs', 'releases', 'v0.6.1.md');
  const files = new Map<string, string>([
    [join(root, 'package.json'), JSON.stringify({
      name: 'prompt-bank',
      version: '0.6.1',
      repository: {
        type: 'git',
        url: 'git+https://github.com/example/prompt-bank.git'
      }
    }, null, 2) + '\n'],
    [join(root, 'package-lock.json'), JSON.stringify({
      name: 'prompt-bank',
      version: '0.6.1',
      lockfileVersion: 3,
      packages: {
        '': {
          name: 'prompt-bank',
          version: '0.6.1'
        }
      }
    }, null, 2) + '\n'],
    [join(root, 'src-tauri', 'Cargo.toml'), [
      '[package]',
      'name = "prompt-bank-desktop"',
      'version = "0.6.1"',
      '',
      '[workspace]',
      'members = []',
      ''
    ].join('\n')],
    [join(root, 'src-tauri', 'Cargo.lock'), [
      'version = 4',
      '',
      '[[package]]',
      'name = "prompt-bank-core"',
      'version = "0.1.0"',
      '',
      '[[package]]',
      'name = "prompt-bank-desktop"',
      'version = "0.6.1"',
      'dependencies = []',
      ''
    ].join('\n')],
    [notesPath, notes]
  ]);

  return {
    root,
    notesPath,
    files,
    dependencies: {
      exists: (path) => files.has(path),
      readFile: (path) => {
        const value = files.get(path);
        if (value === undefined) throw new Error(`Unexpected read of ${path}`);
        return value;
      }
    }
  };
}

function validNotes(): string {
  return [
    '# Prompt Bank 0.6.1',
    '',
    'Added deterministic release notes.',
    '',
    '## Improvements',
    '',
    '- Added deterministic release notes.',
    '',
    '## Downloads',
    '',
    `Download Prompt Bank for your platform from the [GitHub release assets](${REPOSITORY_URL}/releases/tag/v0.6.1).`,
    '',
    '> [!WARNING]',
    '> Prompt Bank installers are currently unsigned. Windows and macOS may display a security warning.',
    '',
    `[Full changelog](${REPOSITORY_URL}/compare/v0.6.0...v0.6.1)`,
    ''
  ].join('\n');
}

function validate(fixture: Fixture) {
  return validateReleaseNotes(fixture.root, {
    ...fixture.dependencies,
    git: validGit
  });
}

function replaceFile(
  fixture: Fixture,
  relativePath: string,
  from: string,
  to: string,
  occurrence = 1
): void {
  const path = join(fixture.root, relativePath);
  const source = fixture.files.get(path);
  if (source === undefined) throw new Error(`Missing fixture file ${path}`);
  const segments = source.split(from);
  if (occurrence < 1 || occurrence >= segments.length) {
    throw new Error(`Missing occurrence ${occurrence} of "${from}" in ${path}`);
  }
  fixture.files.set(
    path,
    segments.slice(0, occurrence).join(from)
      + to
      + segments.slice(occurrence).join(from)
  );
}

function validGit(args: readonly string[]): GitResult {
  if (args[0] === 'remote') return success('git@github.com:fork-owner/prompt-bank.git\n');
  if (args[0] === 'rev-parse') {
    if (args[2]?.startsWith('refs/tags/v0.6.0')) return success(`${PREVIOUS}\n`);
    if (args[2]?.startsWith('refs/tags/')) return failure('target tag must not be queried');
    return success(`${HEAD}\n`);
  }
  if (args[0] === 'merge-base') return success('');
  return failure(`unexpected Git command: ${args.join(' ')}`);
}

function recordingGit(
  calls: string[][],
  handler: (args: readonly string[]) => GitResult
): GitCommand {
  return (args) => {
    calls.push([...args]);
    return handler(args);
  };
}

function commandGit(handler: (args: readonly string[]) => GitResult): GitCommand {
  return (args) => handler(args);
}

function success(stdout: string): GitResult {
  return { status: 0, stdout, stderr: '' };
}

function failure(stderr: string): GitResult {
  return { status: 128, stdout: '', stderr };
}
