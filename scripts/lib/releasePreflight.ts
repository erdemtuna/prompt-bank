import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createGitHubQuery, createGitHubReadinessClient,
  type CiSnapshot, type GitHubReadinessClient
} from './githubReadiness';
import {
  buildReleaseNotes, compareStableVersions, executeGit, parseStableVersion,
  type BuiltReleaseNotes, type GitCommand
} from './releaseNotes';
import {
  repositoryIdentity, requireCleanSynchronizedMain, requireGit, requireRepositoryUnchanged
} from './releaseRepository';
import { updateVersionSources, VERSION_FILES, type UpdatedVersionSources, type VersionSources } from './releaseVersions';

export interface PreflightDependencies {
  git?: GitCommand;
  github?: GitHubReadinessClient;
  exists?: (path: string) => boolean;
  readFile?: (path: string) => string;
}

export interface ReleasePreflight {
  head: string;
  version: string;
  currentVersion: string;
  previousTag: string;
  ci: CiSnapshot;
  notes: BuiltReleaseNotes;
  originals: VersionSources;
  updated: UpdatedVersionSources;
}

export function releasePreflight(
  version: string,
  repoRoot: string,
  dependencies: PreflightDependencies = {}
): ReleasePreflight {
  parseStableVersion(version);
  const git = dependencies.git ?? executeGit;
  const readFile = dependencies.readFile ?? ((path) => readFileSync(path, 'utf8'));
  const exists = dependencies.exists ?? existsSync;
  const head = requireCleanSynchronizedMain(repoRoot, git);
  const originals: VersionSources = {
    packageJson: readFile(join(repoRoot, VERSION_FILES[0])),
    packageLock: readFile(join(repoRoot, VERSION_FILES[1])),
    cargoToml: readFile(join(repoRoot, VERSION_FILES[2])),
    cargoLock: readFile(join(repoRoot, VERSION_FILES[3]))
  };
  const updated = updateVersionSources(originals, version);
  if (compareStableVersions(version, updated.currentVersion) <= 0) {
    throw new Error(`Target version ${version} must be greater than the current version ${updated.currentVersion}.`);
  }
  const destination = join(repoRoot, 'docs', 'releases', `v${version}.md`);
  if (exists(destination)) throw new Error(`Refusing to overwrite existing release notes at ${destination}.`);
  const target = git(['show-ref', '--verify', '--quiet', `refs/tags/v${version}`], repoRoot);
  if (target.status === 0) throw new Error(`Release tag v${version} already exists.`);
  if (target.status !== 1) throw new Error('Unable to check the requested release tag.');

  const github = dependencies.github ?? createGitHubReadinessClient(
    repositoryIdentity(repoRoot, git), createGitHubQuery(repoRoot)
  );
  const previousTag = github.latestStableTag();
  parseStableVersion(previousTag.slice(1));
  if (!previousTag.startsWith('v') || compareStableVersions(previousTag.slice(1), version) >= 0) {
    throw new Error(`Target v${version} must be newer than published stable release ${previousTag}.`);
  }
  const publishedHead = requireGit(git(['rev-parse', '--verify', `refs/tags/${previousTag}^{commit}`], repoRoot),
    `Published stable tag ${previousTag} is unavailable locally after fetching`);
  if (!/^[a-f0-9]{40}$/i.test(publishedHead)) {
    throw new Error('Git returned a malformed published-tag commit.');
  }
  const ancestry = git(['merge-base', '--is-ancestor', publishedHead, head], repoRoot);
  if (ancestry.status === 1) {
    throw new Error(`Newest published stable tag ${previousTag} is outside main's ancestry. Resolve the release history before preparing; do not rewrite historical tags.`);
  }
  requireGit(ancestry, 'Unable to verify published release ancestry');
  const notes = buildReleaseNotes({ repoRoot, version, head, git });
  if (notes.previousTag !== previousTag) {
    throw new Error(`Generated predecessor ${notes.previousTag} differs from newest published stable release ${previousTag}.`);
  }
  const ci = github.ci(head);
  if (ci.sha !== head || ci.state !== 'success') {
    throw new Error(`Release CI is not ready for ${head}: ${ci.message}`);
  }
  requireRepositoryUnchanged(repoRoot, head, git);
  if (requireGit(git(['rev-parse', '--verify', `refs/tags/${previousTag}^{commit}`], repoRoot),
    'Unable to recheck published stable tag') !== publishedHead) {
    throw new Error('Published stable tag changed during readiness checks.');
  }
  return {
    head, version, currentVersion: updated.currentVersion,
    previousTag, ci, notes, originals, updated
  };
}

export function preflightReport(result: ReleasePreflight) {
  return {
    state: 'ready',
    head: result.head,
    currentVersion: result.currentVersion,
    targetVersion: result.version,
    previousTag: result.previousTag,
    ci: result.ci,
    changeCount: result.notes.entries.length
  };
}
