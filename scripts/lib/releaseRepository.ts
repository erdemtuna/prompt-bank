import { executeGit, normalizeGitHubRemote, type GitCommand, type GitResult } from './releaseNotes';

export function repositoryIdentity(repoRoot: string, git: GitCommand = executeGit): string {
  const remote = requireGit(git(['remote', 'get-url', 'origin'], repoRoot),
    'Unable to resolve origin for GitHub readiness');
  return new URL(normalizeGitHubRemote(remote)).pathname.slice(1);
}

export function requireGit(result: GitResult, context: string): string {
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim();
    throw new Error(`${context}${detail ? `: ${detail}` : ''}.`);
  }
  return result.stdout.trim();
}

function requireCleanMain(repoRoot: string, git: GitCommand): void {
  if (requireGit(git(['status', '--porcelain'], repoRoot), 'Unable to inspect working tree')) {
    throw new Error('Release preparation requires a clean working tree.');
  }
  const branch = git(['symbolic-ref', '--quiet', '--short', 'HEAD'], repoRoot);
  if (branch.status !== 0) throw new Error('Release preparation requires an attached local main branch.');
  if (branch.stdout.trim() !== 'main') {
    throw new Error(`Release preparation must run on local main, not ${branch.stdout.trim() || 'an unknown branch'}.`);
  }
}

export function requireCleanSynchronizedMain(repoRoot: string, git: GitCommand = executeGit): string {
  requireCleanMain(repoRoot, git);
  requireGit(git(['fetch', 'origin', '--tags'], repoRoot), 'Unable to fetch origin and tags');
  const head = requireGit(git(['rev-parse', '--verify', 'HEAD^{commit}'], repoRoot), 'Unable to resolve main');
  const remote = requireGit(git(['rev-parse', '--verify', 'refs/remotes/origin/main^{commit}'], repoRoot),
    'Unable to resolve origin/main');
  if (!/^[a-f0-9]{40}$/i.test(head) || !/^[a-f0-9]{40}$/i.test(remote)) {
    throw new Error('Git returned malformed commit identities.');
  }
  if (head !== remote) {
    throw new Error(`Local main must exactly match origin/main (local ${head.slice(0, 7)}, remote ${remote.slice(0, 7)}).`);
  }
  return head;
}

export function requireRepositoryUnchanged(repoRoot: string, head: string, git: GitCommand): void {
  requireCleanMain(repoRoot, git);
  const current = requireGit(git(['rev-parse', '--verify', 'HEAD^{commit}'], repoRoot), 'Unable to recheck HEAD');
  const tracked = requireGit(git(['rev-parse', '--verify', 'refs/remotes/origin/main^{commit}'], repoRoot),
    'Unable to recheck origin/main');
  const remote = requireGit(git(['ls-remote', '--exit-code', 'origin', 'refs/heads/main'], repoRoot),
    'Unable to recheck remote main');
  if (current !== head || tracked !== head || remote !== `${head}\trefs/heads/main`) {
    throw new Error('Main changed during readiness checks. Synchronize and run preflight again.');
  }
}
