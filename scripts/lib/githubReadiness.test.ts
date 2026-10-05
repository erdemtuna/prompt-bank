import { describe, expect, it, vi } from 'vitest';
import {
  createGitHubReadinessClient,
  createGitHubQuery,
  newestStableTag,
  REQUIRED_CI_JOBS,
  type GitHubQuery
} from './githubReadiness';
import { parseCiArguments } from '../check-ci';

const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const run = {
  id: 100, head_sha: SHA, event: 'push', status: 'completed', conclusion: 'success',
  run_attempt: 1, created_at: '2026-01-01T00:00:00Z',
  html_url: 'https://github.com/example/app/actions/runs/100'
};
const jobs = REQUIRED_CI_JOBS.map((name) => ({ name, status: 'completed', conclusion: 'success' }));

function client(query: GitHubQuery) {
  return createGitHubReadinessClient('example/app', query);
}

describe('exact-commit CI readiness', () => {
  it('requires every platform and queries the selected attempt', () => {
    const query = vi.fn((endpoint: string) => endpoint.includes('/jobs?') ? jobs : [
      { ...run, run_attempt: 2 }
    ]);
    expect(client(query).ci(SHA)).toMatchObject({ state: 'success', run: { id: 100, attempt: 2 } });
    expect(query.mock.calls[1][0]).toContain('/runs/100/attempts/2/jobs?');
  });

  it('does not accept another SHA or an unrelated event', () => {
    expect(client(() => [{ ...run, head_sha: OTHER }]).ci(SHA).state).toBe('missing');
    expect(client(() => [{ ...run, event: 'workflow_dispatch' }]).ci(SHA).state).toBe('missing');
  });

  it.each(['queued', 'in_progress', 'waiting'])('reports %s instead of reusing an older success', (status) => {
    expect(client(() => [run, {
      ...run, id: 101, created_at: '2026-01-02T00:00:00Z', status, conclusion: null
    }]).ci(SHA)).toMatchObject({ state: 'pending', run: { id: 101 } });
  });

  it.each(['failure', 'cancelled', 'skipped', 'timed_out', null])('rejects conclusion %s', (conclusion) => {
    expect(client((endpoint) => endpoint.includes('/jobs?') ? jobs : [{ ...run, conclusion }])
      .ci(SHA).state).toBe('failed');
  });

  it('identifies a failing platform without dumping full workflow logs', () => {
    const snapshot = client((endpoint) => endpoint.includes('/jobs?')
      ? jobs.map((job, index) => index === 1 ? { ...job, conclusion: 'failure' } : job)
      : [{ ...run, conclusion: 'failure' }]).ci(SHA);
    expect(snapshot.message).toContain('Rust core tests (Linux): failure');
    expect(snapshot.jobs).toHaveLength(3);
  });

  it.each([
    { results: jobs.slice(0, 2) },
    { results: jobs.map((job, index) => index === 2 ? { ...job, conclusion: 'skipped' } : job) },
    { results: [...jobs, jobs[0]] }
  ])('rejects absent, skipped or ambiguous required jobs', ({ results }) => {
    expect(client((endpoint) => endpoint.includes('/jobs?') ? results : [run]).ci(SHA).state)
      .toBe('failed');
  });

  describe('read-only GitHub CLI adapter', () => {
    it('uses bounded paginated metadata queries without shell interpolation', () => {
      const run = vi.fn(() => ({ status: 0, stdout: '[]', stderr: '' }));
      expect(createGitHubQuery('.', run)('repos/example/app/releases', '[.[]]')).toEqual([]);
      expect(run).toHaveBeenCalledWith('gh', [
        'api', '--method', 'GET', 'repos/example/app/releases',
        '--paginate', '--jq', '[.[]] | tojson'
      ], '.');
    });

    it('flattens compact projected pages without requiring incompatible slurp flags', () => {
      const run = vi.fn(() => ({
        status: 0, stdout: '[{"tag_name":"v0.8.0"}]\n[{"tag_name":"v0.7.0"}]\n', stderr: ''
      }));
      expect(createGitHubQuery('.', run)('endpoint', 'projection')).toEqual([
        { tag_name: 'v0.8.0' }, { tag_name: 'v0.7.0' }
      ]);
    });

    it('does not disguise authentication or malformed responses as missing CI', () => {
      expect(() => createGitHubQuery('.', () => ({
        status: 1, stdout: '', stderr: 'Authentication required.'
      }))('endpoint', 'projection')).toThrow(/Authentication required/);
      expect(() => createGitHubQuery('.', () => ({
        status: 0, stdout: 'not JSON', stderr: ''
      }))('endpoint', 'projection')).toThrow(/not valid JSON/);
    });

    it('rejects path traversal in repository identities', () => {
      expect(() => createGitHubReadinessClient('example/..', () => []))
        .toThrow(/owner\/repository/);
    });
  });

  it('surfaces malformed and unavailable evidence', () => {
    expect(() => client(() => [{ ...run, run_attempt: undefined }]).ci(SHA)).toThrow();
    expect(() => client(() => { throw new Error('Authentication unavailable.'); }).ci(SHA))
      .toThrow('Authentication unavailable.');
  });
});

describe('published release selection', () => {
  it('uses stable SemVer rather than API order, drafts, or the latest label', () => {
    const release = (tag_name: string, flags = {}) => ({ tag_name, draft: false, prerelease: false, ...flags });
    expect(newestStableTag([
      release('v0.8.0'), release('v0.10.0'), release('v1.0.0', { draft: true }),
      release('v2.0.0', { prerelease: true }), release('v2.0.0-beta.1'), release('notes-only')
    ])).toBe('v0.10.0');
  });

  it('requests all release pages with a flattened metadata projection', () => {
    const query = vi.fn(() => [{ tag_name: 'v0.8.0', draft: false, prerelease: false }]);
    expect(client(query).latestStableTag()).toBe('v0.8.0');
    expect(query).toHaveBeenCalledWith('repos/example/app/releases?per_page=100',
      '[.[] | {tag_name,draft,prerelease}]');
  });

  it('fails rather than guessing when no published stable release exists', () => {
    expect(() => newestStableTag([])).toThrow(/No published stable/);
  });
});

describe('CI status arguments', () => {
  it('accepts HEAD default and an exact SHA with JSON output', () => {
    expect(parseCiArguments([])).toEqual({ sha: undefined, json: false });
    expect(parseCiArguments([SHA, '--json'])).toEqual({ sha: SHA, json: true });
  });

  it.each([
    { args: ['main'] }, { args: ['--json', '--json'] },
    { args: [SHA, OTHER] }, { args: ['--unknown'] }
  ])('rejects ambiguous arguments $args', ({ args }) => {
    expect(() => parseCiArguments(args)).toThrow(/Usage/);
  });
});
