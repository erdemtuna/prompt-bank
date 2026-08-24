import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildReleaseNotes,
  compareStableVersions,
  executeGit,
  type GitCommand,
  type GitResult,
  parseStableVersion
} from './lib/releaseNotes';

const VERSION_FILES = [
  'package.json',
  'package-lock.json',
  'src-tauri/Cargo.toml',
  'src-tauri/Cargo.lock'
] as const;

export interface VersionSources {
  packageJson: string;
  packageLock: string;
  cargoToml: string;
  cargoLock: string;
}

export interface UpdatedVersionSources extends VersionSources {
  currentVersion: string;
}

export interface PrepareReleaseDependencies {
  exists?: (path: string) => boolean;
  git?: GitCommand;
  log?: (message: string) => void;
  makeDirectory?: (path: string) => void;
  readFile?: (path: string) => string;
  removeFile?: (path: string) => void;
  validate?: (repoRoot: string) => void;
  writeFile?: (path: string, content: string) => void;
}

export interface PreparedRelease {
  head: string;
  notesPath: string;
  previousTag: string;
  version: string;
}

export function prepareRelease(
  version: string,
  repoRoot = fileURLToPath(new URL('..', import.meta.url)),
  dependencies: PrepareReleaseDependencies = {}
): PreparedRelease {
  parseStableVersion(version);
  const git = dependencies.git ?? executeGit;
  const readFile = dependencies.readFile ?? ((path: string) => readFileSync(path, 'utf8'));
  const writeFile = dependencies.writeFile ?? ((path: string, content: string) => {
    writeFileSync(path, content, 'utf8');
  });
  const exists = dependencies.exists ?? existsSync;
  const makeDirectory = dependencies.makeDirectory ?? ((path: string) => {
    mkdirSync(path, { recursive: true });
  });
  const removeFile = dependencies.removeFile ?? ((path: string) => {
    rmSync(path, { force: true });
  });
  const validate = dependencies.validate ?? validateReleaseNotes;
  const log = dependencies.log ?? console.log;

  requireCleanSynchronizedMain(repoRoot, git);
  const head = requireGit(
    git(['rev-parse', '--verify', 'HEAD^{commit}'], repoRoot),
    'Unable to resolve the preparation HEAD'
  ).stdout.trim();

  const sourcePaths = {
    packageJson: join(repoRoot, VERSION_FILES[0]),
    packageLock: join(repoRoot, VERSION_FILES[1]),
    cargoToml: join(repoRoot, VERSION_FILES[2]),
    cargoLock: join(repoRoot, VERSION_FILES[3])
  };
  const originals: VersionSources = {
    packageJson: readFile(sourcePaths.packageJson),
    packageLock: readFile(sourcePaths.packageLock),
    cargoToml: readFile(sourcePaths.cargoToml),
    cargoLock: readFile(sourcePaths.cargoLock)
  };
  const updated = updateVersionSources(originals, version);

  if (compareStableVersions(version, updated.currentVersion) <= 0) {
    throw new Error(
      `Target version ${version} must be greater than the current version ${updated.currentVersion}.`
    );
  }

  const notes = buildReleaseNotes({ repoRoot, version, head, git });
  if (exists(notes.outputPath)) {
    throw new Error(`Refusing to overwrite existing release notes at ${notes.outputPath}.`);
  }

  const writes: Array<[string, string]> = [
    [sourcePaths.packageJson, updated.packageJson],
    [sourcePaths.packageLock, updated.packageLock],
    [sourcePaths.cargoToml, updated.cargoToml],
    [sourcePaths.cargoLock, updated.cargoLock]
  ];

  try {
    for (const [path, content] of writes) writeFile(path, content);
    makeDirectory(dirname(notes.outputPath));
    writeFile(notes.outputPath, notes.content);
    validate(repoRoot);
  } catch (error) {
    for (const [key, path] of Object.entries(sourcePaths) as Array<
      [keyof VersionSources, string]
    >) {
      writeFile(path, originals[key]);
    }
    removeFile(notes.outputPath);
    throw error;
  }

  log(`Prepared Prompt Bank v${version} from ${notes.previousTag}..${head}.`);
  log('Review the complete uncommitted diff, then run:');
  log('  npm run check');
  log('  git diff --check');
  log(
    `  git add -- ${VERSION_FILES.join(' ')} docs/releases/v${version}.md`
  );
  log(
    `  git commit -m "Release Prompt Bank v${version}" -m "Release-Note: skip"`
  );
  log(`  git tag v${version}`);

  return {
    head,
    notesPath: notes.outputPath,
    previousTag: notes.previousTag,
    version
  };
}

export function requireCleanSynchronizedMain(
  repoRoot: string,
  git: GitCommand = executeGit
): void {
  const status = requireGit(
    git(['status', '--porcelain'], repoRoot),
    'Unable to inspect the working tree'
  );
  if (status.stdout.length > 0) {
    throw new Error('Release preparation requires a clean working tree.');
  }

  const branch = git(['symbolic-ref', '--quiet', '--short', 'HEAD'], repoRoot);
  if (branch.status !== 0) {
    throw new Error('Release preparation requires an attached local main branch.');
  }
  if (branch.stdout.trim() !== 'main') {
    throw new Error(
      `Release preparation must run on local main, not ${branch.stdout.trim() || 'an unknown branch'}.`
    );
  }

  requireGit(
    git(['fetch', 'origin', '--tags'], repoRoot),
    'Unable to fetch origin and tags'
  );
  const localHead = requireGit(
    git(['rev-parse', '--verify', 'HEAD^{commit}'], repoRoot),
    'Unable to resolve local main'
  ).stdout.trim();
  const remoteHead = requireGit(
    git(['rev-parse', '--verify', 'refs/remotes/origin/main^{commit}'], repoRoot),
    'Unable to resolve origin/main'
  ).stdout.trim();
  if (localHead !== remoteHead) {
    throw new Error(
      `Local main must exactly match origin/main (local ${shortHash(localHead)}, remote ${shortHash(remoteHead)}).`
    );
  }
}

export function updateVersionSources(
  sources: VersionSources,
  targetVersion: string
): UpdatedVersionSources {
  parseStableVersion(targetVersion);

  const packageJson = parseJsonObject(sources.packageJson, 'package.json');
  const currentVersion = requiredVersion(packageJson.version, 'package.json');

  const packageLock = parseJsonObject(sources.packageLock, 'package-lock.json');
  const lockVersion = requiredVersion(packageLock.version, 'package-lock.json root');
  const packages = packageLock.packages;
  if (!packages || typeof packages !== 'object' || Array.isArray(packages)) {
    throw new Error('package-lock.json does not contain a packages object.');
  }
  const rootPackage = (packages as Record<string, unknown>)[''];
  if (!rootPackage || typeof rootPackage !== 'object' || Array.isArray(rootPackage)) {
    throw new Error('package-lock.json does not contain the root package entry.');
  }
  const rootLockVersion = requiredVersion(
    (rootPackage as Record<string, unknown>).version,
    'package-lock.json root package'
  );

  const cargoPackage = cargoPackageMetadata(sources.cargoToml);
  const cargoLockVersion = cargoLockPackageVersion(sources.cargoLock, cargoPackage.name);
  const foundVersions = [
    ['package-lock.json root', lockVersion],
    ['package-lock.json root package', rootLockVersion],
    ['src-tauri/Cargo.toml', cargoPackage.version],
    [`src-tauri/Cargo.lock package ${cargoPackage.name}`, cargoLockVersion]
  ] as const;
  for (const [source, foundVersion] of foundVersions) {
    if (foundVersion !== currentVersion) {
      throw new Error(
        `Version mismatch: package.json is ${currentVersion}, but ${source} is ${foundVersion}.`
      );
    }
  }

  packageJson.version = targetVersion;
  packageLock.version = targetVersion;
  (rootPackage as Record<string, unknown>).version = targetVersion;

  return {
    currentVersion,
    packageJson: formatJsonLike(sources.packageJson, packageJson),
    packageLock: formatJsonLike(sources.packageLock, packageLock),
    cargoToml: replaceCargoPackageVersion(sources.cargoToml, targetVersion),
    cargoLock: replaceCargoLockPackageVersion(
      sources.cargoLock,
      cargoPackage.name,
      targetVersion
    )
  };
}

function parseJsonObject(source: string, label: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new Error(
      `${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must contain a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function requiredVersion(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} does not contain a string version.`);
  }
  parseStableVersion(value);
  return value;
}

function formatJsonLike(source: string, value: unknown): string {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const trailingNewline = /\r?\n$/.test(source) ? newline : '';
  return JSON.stringify(value, null, 2).replace(/\n/g, newline) + trailingNewline;
}

function cargoPackageMetadata(source: string): { name: string; version: string } {
  const packageSection = tomlSection(source, 'package');
  const name = tomlStringValue(packageSection, 'name', 'src-tauri/Cargo.toml [package]');
  const version = tomlStringValue(
    packageSection,
    'version',
    'src-tauri/Cargo.toml [package]'
  );
  parseStableVersion(version);
  return { name, version };
}

function replaceCargoPackageVersion(source: string, version: string): string {
  const section = tomlSectionRange(source, 'package');
  const body = source.slice(section.start, section.end);
  const replaced = replaceSingleTomlString(body, 'version', version, '[package]');
  return source.slice(0, section.start) + replaced + source.slice(section.end);
}

function cargoLockPackageVersion(source: string, packageName: string): string {
  const block = cargoLockPackageBlock(source, packageName);
  const version = tomlStringValue(block.body, 'version', `Cargo.lock package ${packageName}`);
  parseStableVersion(version);
  return version;
}

function replaceCargoLockPackageVersion(
  source: string,
  packageName: string,
  version: string
): string {
  const block = cargoLockPackageBlock(source, packageName);
  const replaced = replaceSingleTomlString(
    block.body,
    'version',
    version,
    `Cargo.lock package ${packageName}`
  );
  return source.slice(0, block.start) + replaced + source.slice(block.end);
}

function cargoLockPackageBlock(
  source: string,
  packageName: string
): { body: string; start: number; end: number } {
  const blockPattern = /(?:^|\r?\n)\[\[package\]\]\r?\n[\s\S]*?(?=\r?\n\[\[package\]\]|\s*$)/g;
  const matches = [...source.matchAll(blockPattern)].filter((match) => {
    const body = match[0].replace(/^\r?\n/, '');
    return tomlOptionalStringValue(body, 'name') === packageName;
  });
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one Cargo.lock package named "${packageName}", found ${matches.length}.`
    );
  }
  const match = matches[0];
  const leadingNewlineLength = match[0].startsWith('\r\n')
    ? 2
    : match[0].startsWith('\n')
      ? 1
      : 0;
  const start = (match.index ?? 0) + leadingNewlineLength;
  const body = match[0].slice(leadingNewlineLength);
  return { body, start, end: start + body.length };
}

function tomlSection(source: string, name: string): string {
  const range = tomlSectionRange(source, name);
  return source.slice(range.start, range.end);
}

function tomlSectionRange(source: string, name: string): { start: number; end: number } {
  const header = new RegExp(`^\\[${escapeRegExp(name)}\\]\\s*$`, 'm');
  const match = header.exec(source);
  if (!match) throw new Error(`Missing [${name}] section.`);
  const start = match.index;
  const remainder = source.slice(start + match[0].length);
  const nextSection = /\r?\n\[[^\]]+\]\s*(?:\r?\n|$)/.exec(remainder);
  const end = nextSection
    ? start + match[0].length + nextSection.index
    : source.length;
  return { start, end };
}

function tomlStringValue(source: string, key: string, label: string): string {
  const value = tomlOptionalStringValue(source, key);
  if (value === undefined) {
    throw new Error(`${label} does not contain ${key} = "...".`);
  }
  return value;
}

function tomlOptionalStringValue(source: string, key: string): string | undefined {
  const pattern = new RegExp(`^${escapeRegExp(key)}\\s*=\\s*"([^"]*)"\\s*$`, 'gm');
  const matches = [...source.matchAll(pattern)];
  return matches.length === 1 ? matches[0][1] : undefined;
}

function replaceSingleTomlString(
  source: string,
  key: string,
  value: string,
  label: string
): string {
  const pattern = new RegExp(`^(${escapeRegExp(key)}\\s*=\\s*)"[^"]*"(\\s*)$`, 'gm');
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) {
    throw new Error(`${label} must contain exactly one ${key} string.`);
  }
  return source.replace(pattern, `$1"${value}"$2`);
}

function validateReleaseNotes(repoRoot: string): void {
  const tsxCli = join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const validator = join(repoRoot, 'scripts', 'validate-release-notes.ts');
  const result = spawnSync(process.execPath, [tsxCli, validator], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
    stdio: 'inherit',
    windowsHide: true
  });
  if (result.error) {
    throw new Error(`Unable to run release-note validation: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error('Release-note validation failed; preparation changes were rolled back.');
  }
}

function requireGit(result: GitResult, context: string): GitResult {
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim();
    throw new Error(`${context}${detail ? `: ${detail}` : ''}.`);
  }
  return result;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function shortHash(hash: string): string {
  return hash.slice(0, 7);
}

function parseTargetArgument(args: readonly string[]): string {
  if (args.length !== 1 || args[0].startsWith('-')) {
    throw new Error('Usage: npm run release:prepare -- X.Y.Z');
  }
  return args[0];
}

function isMainModule(): boolean {
  return Boolean(process.argv[1])
    && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
}

if (isMainModule()) {
  try {
    prepareRelease(parseTargetArgument(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
