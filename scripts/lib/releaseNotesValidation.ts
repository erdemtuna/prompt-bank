import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { updateVersionSources, type VersionSources } from '../prepare-release';
import {
  compareStableVersions,
  executeGit,
  normalizeGitHubRemote,
  parseStableVersion,
  RELEASE_NOTE_CATEGORIES,
  resolvePreviousTag,
  type GitCommand
} from './releaseNotes';

const UNSIGNED_BUILD_WARNING =
  '> Prompt Bank installers are currently unsigned. Windows and macOS may display a security warning.';

const PLACEHOLDER_PATTERNS = [
  /\b(?:TODO|TBD|TBC|FIXME|CHANGEME|PLACEHOLDER)\b/i,
  /\{\{[^}\r\n]+\}\}/,
  /\$\{[^}\r\n]+\}/,
  /<(?:version|previous[-_ ]?tag|release[-_ ]?notes?)>/i,
  /\bX\.Y\.Z\b/i,
  /\bvNEXT\b/i
] as const;

export interface ReleaseNotesValidationDependencies {
  exists?: (path: string) => boolean;
  git?: GitCommand;
  notesPath?: string;
  readFile?: (path: string) => string;
}

export interface ValidatedReleaseNotes {
  canonicalBody: string;
  notesPath: string;
  previousTag: string;
  version: string;
}

export function canonicalizeReleaseBody(body: string): string {
  const normalized = body.replace(/\r\n?/g, '\n');
  return normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
}

export function releaseBodiesEqual(left: string, right: string): boolean {
  return canonicalizeReleaseBody(left) === canonicalizeReleaseBody(right);
}

export function validateReleaseNotes(
  repoRoot: string,
  dependencies: ReleaseNotesValidationDependencies = {}
): ValidatedReleaseNotes {
  const readFile = dependencies.readFile ?? ((path: string) => readFileSync(path, 'utf8'));
  const exists = dependencies.exists ?? existsSync;
  const git = dependencies.git ?? executeGit;

  const sourcePaths = {
    packageJson: join(repoRoot, 'package.json'),
    packageLock: join(repoRoot, 'package-lock.json'),
    cargoToml: join(repoRoot, 'src-tauri', 'Cargo.toml'),
    cargoLock: join(repoRoot, 'src-tauri', 'Cargo.lock')
  };
  const sources: VersionSources = {
    packageJson: readRequiredFile(sourcePaths.packageJson, 'package.json', exists, readFile),
    packageLock: readRequiredFile(
      sourcePaths.packageLock,
      'package-lock.json',
      exists,
      readFile
    ),
    cargoToml: readRequiredFile(
      sourcePaths.cargoToml,
      'src-tauri/Cargo.toml',
      exists,
      readFile
    ),
    cargoLock: readRequiredFile(
      sourcePaths.cargoLock,
      'src-tauri/Cargo.lock',
      exists,
      readFile
    )
  };

  const packageJson = parseJsonObject(sources.packageJson, 'package.json');
  if (typeof packageJson.version !== 'string') {
    throw new Error('package.json does not contain a string version.');
  }
  const version = packageJson.version;
  parseStableVersion(version);

  // This is a read-only use of the release preparer's shared parser. Supplying the
  // current version validates every source without changing any files.
  updateVersionSources(sources, version);

  const expectedFileName = `v${version}.md`;
  const notesPath = dependencies.notesPath
    ?? join(repoRoot, 'docs', 'releases', expectedFileName);
  const fileName = basename(notesPath);
  const fileMatch = /^v(.+)\.md$/.exec(fileName);
  if (!fileMatch) {
    throw new Error(`Release-note filename "${fileName}" must use vX.Y.Z.md.`);
  }
  parseStableVersion(fileMatch[1]);
  if (fileName !== expectedFileName) {
    throw new Error(
      `Release-note filename version mismatch: expected ${expectedFileName}, found ${fileName}.`
    );
  }
  const body = readRequiredFile(
    notesPath,
    `release-note file ${expectedFileName}`,
    exists,
    readFile
  );
  const canonicalBody = canonicalizeReleaseBody(body);
  if (canonicalBody.length === 0) {
    throw new Error(`Release-note file ${expectedFileName} is empty.`);
  }

  validateH1(canonicalBody, version);
  validateNoPlaceholders(canonicalBody);
  validateChanges(canonicalBody);

  const repositoryUrl = packageRepositoryUrl(packageJson);
  validateDownloads(canonicalBody, repositoryUrl, version);

  const previousTag = validateChangelog(canonicalBody, repositoryUrl, version);
  resolvePreviousTag(repoRoot, version, 'HEAD', previousTag, git);

  return {
    canonicalBody,
    notesPath,
    previousTag,
    version
  };
}

function validateH1(body: string, version: string): void {
  const firstLine = body.split('\n', 1)[0];
  const match = /^# Prompt Bank (.+)$/.exec(firstLine);
  if (!match) {
    throw new Error(`Release notes must begin with "# Prompt Bank ${version}".`);
  }
  parseStableVersion(match[1]);
  if (match[1] !== version) {
    throw new Error(
      `Release-note H1 version mismatch: package.json is ${version}, but the H1 is ${match[1]}.`
    );
  }
}

function validateNoPlaceholders(body: string): void {
  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(body))) {
    throw new Error('Release notes contain a template placeholder.');
  }
}

function validateChanges(body: string): void {
  const changeHeadings = new Set<string>(
    RELEASE_NOTE_CATEGORIES.map(({ heading }) => heading)
  );
  let currentHeading: string | undefined;
  let changeCount = 0;

  for (const line of body.split('\n')) {
    const heading = /^## (.+)$/.exec(line);
    if (heading) {
      currentHeading = heading[1];
      continue;
    }
    if (currentHeading && changeHeadings.has(currentHeading) && /^- \S/.test(line)) {
      changeCount += 1;
    }
  }

  if (changeCount === 0) {
    throw new Error(
      'Release notes must contain at least one non-empty change bullet under a supported category.'
    );
  }
}

function validateDownloads(body: string, repositoryUrl: string, version: string): void {
  const downloads = sectionBody(body, 'Downloads');
  if (downloads === undefined) {
    throw new Error('Release notes are missing the Downloads section.');
  }
  const expectedUrl = `${repositoryUrl}/releases/tag/v${version}`;
  const destinations = [...downloads.matchAll(/\[[^\]\r\n]+\]\(([^)\r\n]+)\)/g)]
    .map((match) => match[1]);
  const exactMatches = destinations.filter((destination) => destination === expectedUrl);
  if (exactMatches.length !== 1) {
    throw new Error(
      `The Downloads section must contain exactly one Markdown link to ${expectedUrl}.`
    );
  }
  if (!downloads.includes(UNSIGNED_BUILD_WARNING)) {
    throw new Error('The Downloads section is missing the unsigned-build warning.');
  }
}

function validateChangelog(body: string, repositoryUrl: string, version: string): string {
  const links = [...body.matchAll(/\[Full changelog\]\(([^)\r\n]+)\)/g)];
  if (links.length !== 1) {
    throw new Error('Release notes must contain exactly one Full changelog link.');
  }

  const escapedRepositoryUrl = escapeRegExp(repositoryUrl);
  const rangePattern = new RegExp(
    `^${escapedRepositoryUrl}/compare/(v[^.\\s]+\\.[^.\\s]+\\.[^.\\s]+)\\.\\.\\.(v[^.\\s]+\\.[^.\\s]+\\.[^.\\s]+)$`
  );
  const range = rangePattern.exec(links[0][1]);
  if (!range) {
    throw new Error(
      `Full changelog must use ${repositoryUrl}/compare/vX.Y.Z...v${version}.`
    );
  }

  const previousTag = range[1];
  const targetTag = range[2];
  const previousVersion = previousTag.slice(1);
  const targetVersion = targetTag.slice(1);
  parseStableVersion(previousVersion);
  parseStableVersion(targetVersion);
  if (targetVersion !== version) {
    throw new Error(
      `Full changelog target mismatch: expected v${version}, found ${targetTag}.`
    );
  }
  if (compareStableVersions(previousVersion, version) >= 0) {
    throw new Error(`Full changelog predecessor ${previousTag} must be lower than v${version}.`);
  }
  return previousTag;
}

function sectionBody(body: string, heading: string): string | undefined {
  const lines = body.split('\n');
  const start = lines.indexOf(`## ${heading}`);
  if (start < 0) return undefined;
  const nextHeading = lines.findIndex(
    (line, index) => index > start && line.startsWith('## ')
  );
  return lines.slice(start + 1, nextHeading < 0 ? undefined : nextHeading).join('\n');
}

function readRequiredFile(
  path: string,
  label: string,
  exists: (path: string) => boolean,
  readFile: (path: string) => string
): string {
  if (!exists(path)) {
    throw new Error(`Missing ${label} at ${path}.`);
  }
  return readFile(path);
}

function parseJsonObject(source: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error(
      `${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must contain a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function packageRepositoryUrl(packageJson: Record<string, unknown>): string {
  const repository = packageJson.repository;
  let url: unknown;
  if (typeof repository === 'string') {
    url = repository;
  } else if (repository && typeof repository === 'object' && !Array.isArray(repository)) {
    url = (repository as Record<string, unknown>).url;
  }

  if (typeof url !== 'string' || url.trim() === '') {
    throw new Error(
      'package.json repository metadata must contain a GitHub repository URL.'
    );
  }
  return normalizeGitHubRemote(url);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
