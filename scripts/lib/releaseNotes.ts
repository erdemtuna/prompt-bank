import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const RELEASE_NOTE_CATEGORIES = [
  { type: 'feature', heading: 'New features' },
  { type: 'improvement', heading: 'Improvements' },
  { type: 'fix', heading: 'Fixes' },
  { type: 'docs', heading: 'Documentation' },
  { type: 'internal', heading: 'Internal changes' },
  { type: 'other', heading: 'Other changes' }
] as const;

export type ReleaseNoteCategory = (typeof RELEASE_NOTE_CATEGORIES)[number]['type'];

export interface GitResult {
  status: number;
  stdout: string;
  stderr: string;
}

export type GitCommand = (args: readonly string[], cwd: string) => GitResult;

export interface ReleaseCommit {
  hash: string;
  parents: string[];
  subject: string;
  body: string;
}

export interface ReleaseNoteEntry {
  category: ReleaseNoteCategory;
  text: string;
  commitHash: string;
}

export interface BuildReleaseNotesOptions {
  repoRoot: string;
  version: string;
  previousTag?: string;
  head?: string;
  git?: GitCommand;
}

export interface BuiltReleaseNotes {
  content: string;
  entries: ReleaseNoteEntry[];
  outputPath: string;
  previousTag: string;
  repositoryUrl: string;
  version: string;
}

interface Trailer {
  key: string;
  value: string;
}

export function executeGit(args: readonly string[], cwd: string): GitResult {
  const result = spawnSync('git', [...args], {
    cwd,
    encoding: 'utf8',
    shell: false,
    windowsHide: true
  });

  if (result.error) {
    throw new Error(`Unable to run git: ${result.error.message}`);
  }

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
  };
}

export function parseStableVersion(version: string): readonly [number, number, number] {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
  if (!match) {
    throw new Error(
      `Invalid stable version "${version}". Expected X.Y.Z without prerelease or build metadata.`
    );
  }

  const parts = match.slice(1).map(Number) as [number, number, number];
  if (parts.some((part) => !Number.isSafeInteger(part))) {
    throw new Error(`Invalid stable version "${version}". Version components must be safe integers.`);
  }
  return parts;
}

export function compareStableVersions(left: string, right: string): number {
  const leftParts = parseStableVersion(left);
  const rightParts = parseStableVersion(right);
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] < rightParts[index] ? -1 : 1;
    }
  }
  return 0;
}

export function normalizeGitHubRemote(remote: string): string {
  const value = remote.trim();
  let owner: string | undefined;
  let repository: string | undefined;

  const httpsMatch = /^(?:git\+)?https:\/\/github\.com\/([^/]+)\/([^/]+?)\/?$/i.exec(value);
  const scpMatch = /^git@github\.com:([^/]+)\/([^/]+?)\/?$/i.exec(value);
  const sshMatch = /^ssh:\/\/git@github\.com\/([^/]+)\/([^/]+?)\/?$/i.exec(value);
  const match = httpsMatch ?? scpMatch ?? sshMatch;
  if (match) {
    [, owner, repository] = match;
  }

  repository = repository?.replace(/\.git$/i, '');
  const validSegment = /^[A-Za-z0-9_.-]+$/;
  if (
    !owner
    || !repository
    || !validSegment.test(owner)
    || !validSegment.test(repository)
    || owner === '.'
    || owner === '..'
    || repository === '.'
    || repository === '..'
  ) {
    throw new Error(
      `Unsupported repository remote "${value}". Expected an HTTPS or SSH GitHub repository URL.`
    );
  }

  return `https://github.com/${owner}/${repository}`;
}

export function parseReleaseCommit(commit: ReleaseCommit): ReleaseNoteEntry[] {
  const trailers = parseTrailingTrailers(commit.body);
  const notes = trailers
    .filter(({ key }) => key.toLowerCase() === 'release-note')
    .map(({ value }) => normalizeStatement(value));
  const types = trailers
    .filter(({ key }) => key.toLowerCase() === 'release-note-type')
    .map(({ value }) => value.trim().toLowerCase());

  if (types.length > 1) {
    throw new Error(
      `Commit ${shortHash(commit.hash)} has multiple Release-Note-Type trailers; exactly zero or one is allowed.`
    );
  }

  const skipNotes = notes.filter((note) => note.toLowerCase() === 'skip');
  if (skipNotes.length > 0) {
    if (notes.length !== 1 || types.length > 0) {
      throw new Error(
        `Commit ${shortHash(commit.hash)} must use Release-Note: skip by itself without other release-note metadata.`
      );
    }
    return [];
  }

  if (notes.length === 0) {
    if (commit.parents.length > 1) {
      throw new Error(
        `Merge commit ${shortHash(commit.hash)} has no Release-Note trailer. Add structured release-note metadata.`
      );
    }
    const subject = normalizeStatement(commit.subject);
    if (!subject) {
      throw new Error(`Commit ${shortHash(commit.hash)} has neither a Release-Note nor a subject.`);
    }
    return [{ category: 'other', text: subject, commitHash: commit.hash }];
  }

  if (notes.some((note) => note.length === 0)) {
    throw new Error(`Commit ${shortHash(commit.hash)} has an empty Release-Note trailer.`);
  }

  const category = categoryForType(types[0] ?? 'improvement');
  return notes.map((text) => ({ category, text, commitHash: commit.hash }));
}

export function collectReleaseNoteEntries(commits: readonly ReleaseCommit[]): ReleaseNoteEntry[] {
  return commits.flatMap(parseReleaseCommit);
}

export function renderReleaseNotes(
  version: string,
  previousTag: string,
  repositoryUrl: string,
  entries: readonly ReleaseNoteEntry[]
): string {
  parseStableVersion(version);
  if (entries.length === 0) {
    throw new Error('No eligible release-note entries were found in the selected commit range.');
  }

  const lines = [
    `# Prompt Bank ${version}`,
    '',
    entries[0].text,
    ''
  ];

  for (const category of RELEASE_NOTE_CATEGORIES) {
    const categoryEntries = entries.filter((entry) => entry.category === category.type);
    if (categoryEntries.length === 0) continue;

    lines.push(`## ${category.heading}`, '');
    for (const entry of categoryEntries) {
      const commitUrl = `${repositoryUrl}/commit/${entry.commitHash}`;
      lines.push(`- ${entry.text} ([\`${shortHash(entry.commitHash)}\`](${commitUrl}))`);
    }
    lines.push('');
  }

  lines.push(
    '## Downloads',
    '',
    `Download Prompt Bank for your platform from the [GitHub release assets](${repositoryUrl}/releases/tag/v${version}).`,
    '',
    '> [!WARNING]',
    '> Prompt Bank installers are currently unsigned. Windows and macOS may display a security warning.',
    '',
    `[Full changelog](${repositoryUrl}/compare/${previousTag}...v${version})`,
    ''
  );

  return lines.join('\n');
}

export function resolvePreviousTag(
  repoRoot: string,
  version: string,
  head: string,
  requestedTag: string | undefined,
  git: GitCommand = executeGit
): string {
  parseStableVersion(version);
  resolveCommit(repoRoot, head, git);

  if (requestedTag) {
    const previousVersion = versionFromTag(requestedTag);
    if (compareStableVersions(previousVersion, version) >= 0) {
      throw new Error(`Previous tag ${requestedTag} must be strictly lower than v${version}.`);
    }
    verifyTagAndAncestry(repoRoot, requestedTag, head, git);
    return requestedTag;
  }

  const tagResult = requireGit(
    git(['tag', '--merged', head, '--list', 'v*'], repoRoot),
    `Unable to list tags reachable from ${head}`
  );
  const candidates = tagResult.stdout
    .split(/\r?\n/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .flatMap((tag) => {
      try {
        const candidateVersion = versionFromTag(tag);
        return compareStableVersions(candidateVersion, version) < 0
          ? [{ tag, version: candidateVersion }]
          : [];
      } catch {
        return [];
      }
    })
    .sort((left, right) => compareStableVersions(right.version, left.version));

  const previousTag = candidates[0]?.tag;
  if (!previousTag) {
    throw new Error(`No reachable stable version tag exists below v${version}.`);
  }
  verifyTagAndAncestry(repoRoot, previousTag, head, git);
  return previousTag;
}

export function readFirstParentCommits(
  repoRoot: string,
  previousTag: string,
  head: string,
  git: GitCommand = executeGit
): ReleaseCommit[] {
  const range = `${previousTag}..${head}`;
  const revisionResult = requireGit(
    git(['rev-list', '--first-parent', '--reverse', range], repoRoot),
    `Invalid Git range ${range}`
  );
  const hashes = revisionResult.stdout.split(/\r?\n/).map((hash) => hash.trim()).filter(Boolean);
  if (hashes.length === 0) {
    throw new Error(`No commits exist in Git range ${range}.`);
  }

  return hashes.map((hash) => {
    const result = requireGit(
      git(['show', '--no-patch', '--format=%H%x00%P%x00%s%x00%b', hash], repoRoot),
      `Unable to read commit ${hash}`
    );
    const fields = result.stdout.split('\0');
    if (fields.length < 4) {
      throw new Error(`Git returned malformed metadata for commit ${hash}.`);
    }
    const [commitHash, parentText, subject, ...bodyParts] = fields;
    return {
      hash: commitHash.trim(),
      parents: parentText.trim() ? parentText.trim().split(/\s+/) : [],
      subject,
      body: bodyParts.join('\0')
    };
  });
}

export function buildReleaseNotes(options: BuildReleaseNotesOptions): BuiltReleaseNotes {
  const git = options.git ?? executeGit;
  const version = options.version;
  const head = options.head ?? 'HEAD';
  parseStableVersion(version);

  const resolvedHead = resolveCommit(options.repoRoot, head, git);
  const previousTag = resolvePreviousTag(
    options.repoRoot,
    version,
    resolvedHead,
    options.previousTag,
    git
  );
  const remote = requireGit(
    git(['remote', 'get-url', 'origin'], options.repoRoot),
    'Unable to resolve the origin remote'
  ).stdout.trim();
  const repositoryUrl = normalizeGitHubRemote(remote);
  const commits = readFirstParentCommits(options.repoRoot, previousTag, resolvedHead, git);
  const entries = collectReleaseNoteEntries(commits);
  if (entries.length === 0) {
    throw new Error(
      `No eligible release-note entries were found in ${previousTag}..${shortHash(resolvedHead)}.`
    );
  }

  return {
    content: renderReleaseNotes(version, previousTag, repositoryUrl, entries),
    entries,
    outputPath: join(options.repoRoot, 'docs', 'releases', `v${version}.md`),
    previousTag,
    repositoryUrl,
    version
  };
}

export function writeReleaseNotesFile(
  outputPath: string,
  content: string,
  force = false
): void {
  if (existsSync(outputPath) && !force) {
    throw new Error(`Refusing to overwrite existing release notes at ${outputPath}. Use --force to replace it.`);
  }
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, content, 'utf8');
}

function parseTrailingTrailers(body: string): Trailer[] {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  while (lines.at(-1)?.trim() === '') lines.pop();

  let terminalParagraphStart = 0;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index].trim() === '') {
      terminalParagraphStart = index + 1;
      break;
    }
  }
  return parseTrailerParagraph(lines.slice(terminalParagraphStart)) ?? [];
}

function parseTrailerParagraph(lines: readonly string[]): Trailer[] | undefined {
  const trailers: Trailer[] = [];
  for (const line of lines) {
    const match = /^([A-Za-z0-9][A-Za-z0-9-]*):[ \t]*(.*)$/.exec(line);
    if (match) {
      trailers.push({ key: match[1], value: match[2] });
      continue;
    }
    if (/^[ \t]+/.test(line) && trailers.length > 0) {
      trailers[trailers.length - 1].value += ` ${line.trim()}`;
      continue;
    }
    return undefined;
  }
  return trailers.length > 0 ? trailers : undefined;
}

function normalizeStatement(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function categoryForType(type: string): ReleaseNoteCategory {
  return RELEASE_NOTE_CATEGORIES.some((category) => category.type === type)
    ? type as ReleaseNoteCategory
    : 'other';
}

function versionFromTag(tag: string): string {
  if (!tag.startsWith('v')) {
    throw new Error(`Invalid stable version tag "${tag}". Expected vX.Y.Z.`);
  }
  const version = tag.slice(1);
  parseStableVersion(version);
  return version;
}

function resolveCommit(repoRoot: string, revision: string, git: GitCommand): string {
  const result = requireGit(
    git(['rev-parse', '--verify', `${revision}^{commit}`], repoRoot),
    `Unable to resolve generation commit ${revision}`
  );
  const hash = result.stdout.trim();
  if (!/^[0-9a-f]{40,64}$/i.test(hash)) {
    throw new Error(`Git returned an invalid commit hash for ${revision}.`);
  }
  return hash;
}

function verifyTagAndAncestry(
  repoRoot: string,
  tag: string,
  head: string,
  git: GitCommand
): void {
  requireGit(
    git(['rev-parse', '--verify', `refs/tags/${tag}^{commit}`], repoRoot),
    `Previous tag ${tag} does not exist`
  );
  const ancestor = git(['merge-base', '--is-ancestor', tag, head], repoRoot);
  if (ancestor.status === 1) {
    throw new Error(`Previous tag ${tag} is not an ancestor of ${shortHash(head)}.`);
  }
  requireGit(ancestor, `Unable to verify ancestry for ${tag}`);
}

function requireGit(result: GitResult, context: string): GitResult {
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim();
    throw new Error(`${context}${detail ? `: ${detail}` : ''}.`);
  }
  return result;
}

function shortHash(hash: string): string {
  return hash.slice(0, 7);
}
