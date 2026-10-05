import { parseStableVersion } from './releaseNotes';

export const VERSION_FILES = [
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
