import { basename, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  prepareRelease,
  requireCleanSynchronizedMain,
  updateVersionSources,
  type VersionSources
} from '../prepare-release';
import type { GitCommand, GitResult } from './releaseNotes';
import { releasePreflight, preflightReport } from './releasePreflight';
import { parsePreflightArguments } from '../release-preflight';
import { REQUIRED_CI_JOBS, type GitHubReadinessClient } from './githubReadiness';

const LOCAL = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const REMOTE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

describe('release preparation repository safeguards', () => {
  it('refuses a dirty working tree before fetching', () => {
    const calls: string[][] = [];
    const git = recordingGit(calls, () => success(' M package.json\n'));
    expect(() => requireCleanSynchronizedMain('.', git)).toThrow(/clean working tree/);
    expect(calls).toEqual([['status', '--porcelain']]);
  });

  it('refuses detached HEAD', () => {
    const git = commandGit((args) => {
      if (args[0] === 'status') return success('');
      return { status: 1, stdout: '', stderr: '' };
    });
    expect(() => requireCleanSynchronizedMain('.', git)).toThrow(/attached local main/);
  });

  it('refuses a branch other than main', () => {
    const git = commandGit((args) => {
      if (args[0] === 'status') return success('');
      if (args[0] === 'symbolic-ref') return success('feature/release\n');
      return failure('unexpected');
    });
    expect(() => requireCleanSynchronizedMain('.', git)).toThrow(/must run on local main/);
  });

  it.each([
    ['ahead', LOCAL, REMOTE],
    ['behind', REMOTE, LOCAL]
  ])('refuses a local main that is %s of origin/main', (_state, local, remote) => {
    const git = commandGit((args) => {
      if (args[0] === 'status') return success('');
      if (args[0] === 'symbolic-ref') return success('main\n');
      if (args[0] === 'fetch') return success('');
      if (args[2]?.includes('refs/remotes')) return success(`${remote}\n`);
      if (args[0] === 'rev-parse') return success(`${local}\n`);
      return failure('unexpected');
    });
    expect(() => requireCleanSynchronizedMain('.', git)).toThrow(/exactly match origin\/main/);
  });
});

describe('version source updates', () => {
  it('updates all four files and both package-lock root version values', () => {
    const updated = updateVersionSources(versionSources(), '0.7.0');

    expect(JSON.parse(updated.packageJson).version).toBe('0.7.0');
    const lock = JSON.parse(updated.packageLock);
    expect(lock.version).toBe('0.7.0');
    expect(lock.packages[''].version).toBe('0.7.0');
    expect(updated.cargoToml).toMatch(/\[package\]\r?\nname = "prompt-bank-desktop"\r?\nversion = "0.7.0"/);
    expect(updated.cargoLock).toMatch(/name = "prompt-bank-desktop"\r?\nversion = "0.7.0"/);
    expect(updated.cargoLock).toContain('name = "dependency"\nversion = "0.6.1"');
  });

  it('rejects pre-existing version disagreement', () => {
    const sources = versionSources();
    sources.cargoToml = sources.cargoToml.replace('version = "0.6.1"', 'version = "0.6.0"');
    expect(() => updateVersionSources(sources, '0.7.0')).toThrow(/Version mismatch/);
  });
});

describe('complete release preparation', () => {
  it('writes synchronized uncommitted files, validates, and never commits, tags, or pushes', () => {
    const root = join(process.cwd(), 'virtual-release-repository');
    const sources = versionSources();
    const files = sourceMap(root, sources);
    const calls: string[][] = [];
    const logs: string[] = [];
    let validated = false;

    const result = prepareRelease('0.7.0', root, {
      github: readyGitHub(),
      git: recordingGit(calls, releaseGit),
      readFile: (path) => requiredFile(files, path),
      writeFile: (path, content) => files.set(path, content),
      exists: (path) => files.has(path),
      makeDirectory: () => undefined,
      removeFile: (path) => {
        files.delete(path);
      },
      validate: () => {
        validated = true;
        expect(JSON.parse(requiredFile(files, join(root, 'package.json'))).version).toBe('0.7.0');
        expect(requiredFile(files, join(root, 'docs', 'releases', 'v0.7.0.md')))
          .toContain('# Prompt Bank 0.7.0');
      },
      log: (message) => logs.push(message)
    });

    expect(result).toMatchObject({ version: '0.7.0', previousTag: 'v0.6.1', head: LOCAL });
    expect(validated).toBe(true);
    expect(JSON.parse(requiredFile(files, join(root, 'package-lock.json'))).packages[''].version)
      .toBe('0.7.0');
    expect(requiredFile(files, join(root, 'src-tauri', 'Cargo.toml')))
      .toContain('version = "0.7.0"');
    expect(requiredFile(files, join(root, 'src-tauri', 'Cargo.lock')))
      .toContain('name = "prompt-bank-desktop"\nversion = "0.7.0"');
    expect(calls.some((args) => (
      args[0] === 'commit'
      || args[0] === 'push'
      || (args[0] === 'tag' && !args.includes('--list'))
    ))).toBe(false);
    expect(logs).toContain('  npm run check');
    expect(logs).toContain('  git tag v0.7.0');
    expect(logs).toContain('  git push --atomic origin main refs/tags/v0.7.0');
    expect(logs.find((line) => line.includes('git commit'))).toContain(
      'Release-Note: skip\nCo-authored-by: Copilot App'
    );
  });

  it('rolls back every write when validation fails', () => {
    const root = join(process.cwd(), 'virtual-release-repository');
    const sources = versionSources();
    const files = sourceMap(root, sources);

    expect(() => prepareRelease('0.7.0', root, {
      github: readyGitHub(),
      git: commandGit(releaseGit),
      readFile: (path) => requiredFile(files, path),
      writeFile: (path, content) => files.set(path, content),
      exists: (path) => files.has(path),
      makeDirectory: () => undefined,
      removeFile: (path) => {
        files.delete(path);
      },
      validate: () => {
        throw new Error('invalid notes');
      },
      log: () => undefined
    })).toThrow('invalid notes');

    expect(requiredFile(files, join(root, 'package.json'))).toBe(sources.packageJson);
    expect(files.has(join(root, 'docs', 'releases', 'v0.7.0.md'))).toBe(false);
  });
});

describe('blocking release preflight', () => {
  function fixture(git: GitCommand = commandGit(releaseGit), github = readyGitHub()) {
    const root = join(process.cwd(), 'virtual-release-repository');
    const files = sourceMap(root, versionSources());
    return {
      root, files,
      dependencies: {
        git, github,
        readFile: (path: string) => requiredFile(files, path),
        exists: (path: string) => files.has(path)
      }
    };
  }

  it('reports the verified source and never exposes file contents in its JSON report', () => {
    const setup = fixture();
    const before = [...setup.files];
    const report = preflightReport(releasePreflight('0.7.0', setup.root, setup.dependencies));
    expect(report).toMatchObject({
      state: 'ready', head: LOCAL, previousTag: 'v0.6.1',
      currentVersion: '0.6.1', targetVersion: '0.7.0', changeCount: 1
    });
    expect(report).not.toHaveProperty('originals');
    expect([...setup.files]).toEqual(before);
  });

  it.each(['missing', 'pending', 'failed'] as const)('does not write when CI is %s', (state) => {
    const github = readyGitHub();
    github.ci = (sha) => ({ sha, state, message: `CI ${state}`, jobs: [] });
    const setup = fixture(undefined, github);
    const writeFile = vi.fn();
    expect(() => prepareRelease('0.7.0', setup.root, { ...setup.dependencies, writeFile }))
      .toThrow(/CI is not ready/);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('rejects successful evidence for another commit', () => {
    const github = readyGitHub();
    const ci = github.ci;
    github.ci = () => ci(REMOTE);
    const setup = fixture(undefined, github);
    expect(() => releasePreflight('0.7.0', setup.root, setup.dependencies)).toThrow(/CI is not ready/);
  });

  it('fails closed when GitHub authentication or requests are unavailable', () => {
    const github = readyGitHub();
    github.latestStableTag = () => { throw new Error('GitHub unavailable.'); };
    const setup = fixture(undefined, github);
    const writeFile = vi.fn();
    expect(() => prepareRelease('0.7.0', setup.root, { ...setup.dependencies, writeFile }))
      .toThrow('GitHub unavailable.');
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('blocks a newest published tag outside main instead of falling back', () => {
    const setup = fixture(commandGit((args) =>
      args[0] === 'merge-base' ? { status: 1, stdout: '', stderr: '' } : releaseGit(args)
    ));
    expect(() => releasePreflight('0.7.0', setup.root, setup.dependencies))
      .toThrow(/outside main's ancestry/);
  });

  it('requires the published tag to exist after fetch and match the generated predecessor', () => {
    const missing = fixture(commandGit((args) =>
      args[0] === 'rev-parse' && args[2]?.startsWith('refs/tags/')
        ? failure('missing tag') : releaseGit(args)
    ));
    expect(() => releasePreflight('0.7.0', missing.root, missing.dependencies))
      .toThrow(/unavailable locally/);
    const github = readyGitHub();
    github.latestStableTag = () => 'v0.6.0';
    const different = fixture(undefined, github);
    expect(() => releasePreflight('0.7.0', different.root, different.dependencies))
      .toThrow(/differs from newest published/);
  });

  it('blocks existing destinations, target tags, and non-increasing versions before requests', () => {
    const github = readyGitHub();
    github.latestStableTag = vi.fn(github.latestStableTag);
    const existing = fixture(undefined, github);
    existing.files.set(join(existing.root, 'docs', 'releases', 'v0.7.0.md'), 'preserve');
    expect(() => releasePreflight('0.7.0', existing.root, existing.dependencies))
      .toThrow(/overwrite existing/);
    expect(github.latestStableTag).not.toHaveBeenCalled();
    const tagged = fixture(commandGit((args) =>
      args[0] === 'show-ref' ? success('') : releaseGit(args)
    ), github);
    expect(() => releasePreflight('0.7.0', tagged.root, tagged.dependencies)).toThrow(/already exists/);
    const old = fixture(undefined, github);
    expect(() => releasePreflight('0.6.1', old.root, old.dependencies)).toThrow(/must be greater/);
    expect(github.latestStableTag).not.toHaveBeenCalled();
  });

  it('rejects remote drift after online queries', () => {
    const setup = fixture(commandGit((args) =>
      args[0] === 'ls-remote' ? success(`${REMOTE}\trefs/heads/main\n`) : releaseGit(args)
    ));
    expect(() => releasePreflight('0.7.0', setup.root, setup.dependencies))
      .toThrow(/changed during readiness/);
  });

  it('rejects a working tree edited during online queries', () => {
    let statuses = 0;
    const setup = fixture(commandGit((args) => {
      if (args[0] === 'status' && ++statuses > 1) return success(' M package.json\n');
      return releaseGit(args);
    }));
    const writeFile = vi.fn();
    expect(() => prepareRelease('0.7.0', setup.root, { ...setup.dependencies, writeFile }))
      .toThrow(/clean working tree/);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('parses one stable target and an optional JSON flag', () => {
    expect(parsePreflightArguments(['0.7.0', '--json'])).toEqual({ version: '0.7.0', json: true });
    for (const args of [[], ['0.7.0', '0.8.0'], ['0.7.0', '--json', '--json'], ['0.7.0-beta']]) {
      expect(() => parsePreflightArguments(args)).toThrow();
    }
  });
});

function readyGitHub(): GitHubReadinessClient {
  return {
    latestStableTag: () => 'v0.6.1',
    ci: (sha) => ({
      sha, state: 'success', message: 'All required CI jobs succeeded.',
      run: { id: 1, attempt: 1, url: 'https://github.com/example/prompt-bank/actions/runs/1' },
      jobs: REQUIRED_CI_JOBS.map((name) => ({ name, status: 'completed', conclusion: 'success' }))
    })
  };
}

function versionSources(): VersionSources {
  return {
    packageJson: '{\n  "name": "prompt-bank",\n  "version": "0.6.1"\n}\n',
    packageLock: [
      '{',
      '  "name": "prompt-bank",',
      '  "version": "0.6.1",',
      '  "packages": {',
      '    "": {',
      '      "name": "prompt-bank",',
      '      "version": "0.6.1"',
      '    }',
      '  }',
      '}',
      ''
    ].join('\n'),
    cargoToml: [
      '[package]',
      'name = "prompt-bank-desktop"',
      'version = "0.6.1"',
      '',
      '[workspace]',
      'members = []',
      ''
    ].join('\n'),
    cargoLock: [
      'version = 4',
      '',
      '[[package]]',
      'name = "dependency"',
      'version = "0.6.1"',
      '',
      '[[package]]',
      'name = "prompt-bank-desktop"',
      'version = "0.6.1"',
      'dependencies = []',
      ''
    ].join('\n')
  };
}

function sourceMap(root: string, sources: VersionSources): Map<string, string> {
  return new Map([
    [join(root, 'package.json'), sources.packageJson],
    [join(root, 'package-lock.json'), sources.packageLock],
    [join(root, 'src-tauri', 'Cargo.toml'), sources.cargoToml],
    [join(root, 'src-tauri', 'Cargo.lock'), sources.cargoLock]
  ]);
}

function requiredFile(files: Map<string, string>, path: string): string {
  const value = files.get(path);
  if (value === undefined) throw new Error(`Missing virtual file ${basename(path)}`);
  return value;
}

function releaseGit(args: readonly string[]): GitResult {
  if (args[0] === 'status') return success('');
  if (args[0] === 'symbolic-ref') return success('main\n');
  if (args[0] === 'fetch') return success('');
  if (args[0] === 'show-ref') return { status: 1, stdout: '', stderr: '' };
  if (args[0] === 'ls-remote') return success(`${LOCAL}\trefs/heads/main\n`);
  if (args[0] === 'rev-parse') {
    if (args[2]?.includes('origin/main')) return success(`${LOCAL}\n`);
    if (args[2]?.includes('refs/tags')) return success(`${REMOTE}\n`);
    return success(`${LOCAL}\n`);
  }
  if (args[0] === 'tag') return success('v0.5.4\nv0.6.0\nv0.6.1\n');
  if (args[0] === 'merge-base') return success('');
  if (args[0] === 'remote') return success('git@github.com:example/prompt-bank.git\n');
  if (args[0] === 'rev-list') return success(`${REMOTE}\n`);
  if (args[0] === 'show') {
    return success(
      `${REMOTE}\0${LOCAL}\0Add visible improvement\0`
      + 'Release-Note-Type: improvement\nRelease-Note: Added visible improvement.\n'
    );
  }
  return failure(`unexpected git command: ${args.join(' ')}`);
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
