import { z } from 'zod';
import { compareStableVersions, parseStableVersion } from './releaseNotes';
import { runCommand } from './processRunner';

export const REQUIRED_CI_JOBS = [
  'Validate, test, and build',
  'Rust core tests (Linux)',
  'Rust core tests (Windows)'
] as const;

const shaSchema = z.string().regex(/^[a-f0-9]{40}$/i);
const runSchema = z.object({
  id: z.number().int().positive().safe(),
  head_sha: shaSchema,
  event: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
  run_attempt: z.number().int().positive().safe(),
  created_at: z.string().datetime(),
  html_url: z.string().url()
});
const jobSchema = z.object({
  name: z.string().min(1),
  status: z.string(),
  conclusion: z.string().nullable()
});
const releaseSchema = z.object({
  tag_name: z.string().min(1),
  draft: z.boolean(),
  prerelease: z.boolean()
});

export type GitHubQuery = (endpoint: string, projection: string) => unknown;
export interface GitHubReadinessClient {
  ci(sha: string): CiSnapshot;
  latestStableTag(): string;
}

export interface CiSnapshot {
  sha: string;
  state: 'success' | 'missing' | 'pending' | 'failed';
  message: string;
  run?: { id: number; attempt: number; url: string };
  jobs: { name: string; status: string; conclusion: string | null }[];
}

export function createGitHubQuery(cwd: string, run: typeof runCommand = runCommand): GitHubQuery {
  return (endpoint, projection) => {
    const result = run('gh', [
      'api', '--method', 'GET', endpoint, '--paginate', '--jq', `${projection} | tojson`
    ], cwd);
    if (result.status !== 0) {
      throw new Error(
        `GitHub readiness request failed (exit ${result.status}). `
        + (result.stderr.trim() || 'Check authentication and network availability.')
      );
    }
    try {
      const lines = result.stdout.trim().split(/\r?\n/);
      if (!result.stdout.trim()) throw new Error('Empty response.');
      return lines.flatMap((line) => {
        const page: unknown = JSON.parse(line);
        if (!Array.isArray(page)) throw new Error('Expected a projected metadata page.');
        return page;
      });
    } catch {
      throw new Error('GitHub readiness response is not valid JSON metadata pages.');
    }
  };
}

export function createGitHubReadinessClient(
  repository: string,
  query: GitHubQuery
): GitHubReadinessClient {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error('GitHub readiness requires an owner/repository identity.');
  }
  if (repository.split('/').some((segment) => segment === '.' || segment === '..')) {
    throw new Error('GitHub readiness requires an owner/repository identity.');
  }
  return {
    ci(sha) {
      shaSchema.parse(sha);
      const runs = z.array(runSchema).parse(query(
        `repos/${repository}/actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=100`,
        '[.workflow_runs[] | {id,head_sha,event,status,conclusion,run_attempt,created_at,html_url}]'
      ));
      const run = runs.filter((candidate) =>
        candidate.head_sha.toLowerCase() === sha.toLowerCase()
        && ['push', 'pull_request'].includes(candidate.event)
      ).sort((left, right) =>
        Date.parse(right.created_at) - Date.parse(left.created_at) || right.id - left.id
      )[0];
      if (!run) {
        return { sha, state: 'missing', message: 'No matching CI run exists for this commit.', jobs: [] };
      }
      const identity = { id: run.id, attempt: run.run_attempt, url: run.html_url };
      if (run.status !== 'completed') {
        return { sha, state: 'pending', message: `CI is ${run.status}.`, run: identity, jobs: [] };
      }
      const jobs = z.array(jobSchema).parse(query(
        `repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`,
        '[.jobs[] | {name,status,conclusion}]'
      ));
      const issues = REQUIRED_CI_JOBS.flatMap((name) => {
        const matches = jobs.filter((job) => job.name === name);
        if (matches.length !== 1) return [`${name}: ${matches.length === 0 ? 'missing' : 'ambiguous'}`];
        const [job] = matches;
        return job.status === 'completed' && job.conclusion === 'success'
          ? []
          : [`${name}: ${job.conclusion ?? job.status}`];
      });
      const succeeded = run.conclusion === 'success' && issues.length === 0;
      const message = run.conclusion === 'success'
        ? issues.join('; ')
        : `CI concluded ${run.conclusion ?? 'without a result'}.${issues.length ? ` ${issues.join('; ')}` : ''}`;
      return {
        sha,
        state: succeeded ? 'success' : 'failed',
        message: succeeded ? 'All required CI jobs succeeded.' : message,
        run: identity,
        jobs
      };
    },
    latestStableTag() {
      const releases = z.array(releaseSchema).parse(query(
        `repos/${repository}/releases?per_page=100`,
        '[.[] | {tag_name,draft,prerelease}]'
      ));
      return newestStableTag(releases);
    }
  };
}

export function newestStableTag(
  releases: readonly z.infer<typeof releaseSchema>[]
): string {
  const candidates = releases.filter((release) =>
    !release.draft && !release.prerelease
    && /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(release.tag_name)
  );
  for (const release of candidates) parseStableVersion(release.tag_name.slice(1));
  candidates.sort((left, right) =>
    compareStableVersions(right.tag_name.slice(1), left.tag_name.slice(1))
  );
  if (!candidates[0]) throw new Error('No published stable SemVer release exists.');
  return candidates[0].tag_name;
}

export function formatCiSnapshot(snapshot: CiSnapshot): string {
  return [
    `CI ${snapshot.state}: ${snapshot.sha}`,
    snapshot.message,
    ...(snapshot.run ? [`Run ${snapshot.run.id}, attempt ${snapshot.run.attempt}: ${snapshot.run.url}`] : [])
  ].join('\n');
}
