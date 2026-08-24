import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildReleaseNotes,
  parseStableVersion,
  writeReleaseNotesFile
} from './lib/releaseNotes';

interface GeneratorArguments {
  force: boolean;
  head?: string;
  previousTag?: string;
  version?: string;
}

export interface ReleaseNotesGeneratorDependencies {
  build?: typeof buildReleaseNotes;
  readFile?: (path: string) => string;
  write?: typeof writeReleaseNotesFile;
}

export function generateReleaseNotes(
  args = process.argv.slice(2),
  repoRoot = fileURLToPath(new URL('..', import.meta.url)),
  dependencies: ReleaseNotesGeneratorDependencies = {}
): string {
  const parsed = parseArguments(args);
  const readFile = dependencies.readFile ?? ((path: string) => readFileSync(path, 'utf8'));
  const build = dependencies.build ?? buildReleaseNotes;
  const write = dependencies.write ?? writeReleaseNotesFile;
  const packageJson = JSON.parse(
    readFile(resolve(repoRoot, 'package.json'))
  ) as { version?: unknown };
  const packageVersion = typeof packageJson.version === 'string'
    ? packageJson.version
    : undefined;
  const version = parsed.version ?? packageVersion;
  if (!version) {
    throw new Error('package.json does not contain a version and --version was not supplied.');
  }
  parseStableVersion(version);

  const result = build({
    repoRoot,
    version,
    previousTag: parsed.previousTag,
    head: parsed.head
  });
  write(result.outputPath, result.content, parsed.force);
  return result.outputPath;
}

export function parseArguments(args: readonly string[]): GeneratorArguments {
  const parsed: GeneratorArguments = { force: false };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--force') {
      parsed.force = true;
      continue;
    }

    const separator = argument.indexOf('=');
    const option = separator >= 0 ? argument.slice(0, separator) : argument;
    if (option === '--version' || option === '--previous-tag' || option === '--head') {
      const inlineValue = separator >= 0 ? argument.slice(separator + 1) : undefined;
      const value = inlineValue ?? args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${option} requires a value.`);
      }
      if (!inlineValue) index += 1;

      if (option === '--version') {
        if (parsed.version) throw new Error('--version may only be supplied once.');
        parsed.version = value;
      } else if (option === '--previous-tag') {
        if (parsed.previousTag) throw new Error('--previous-tag may only be supplied once.');
        parsed.previousTag = value;
      } else {
        if (parsed.head) throw new Error('--head may only be supplied once.');
        parsed.head = value;
      }
      continue;
    }

    throw new Error(`Unknown argument "${argument}".`);
  }

  if (parsed.force && !parsed.head) {
    throw new Error('--force requires an explicit --head revision.');
  }

  return parsed;
}

function isMainModule(): boolean {
  return Boolean(process.argv[1])
    && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
}

if (isMainModule()) {
  try {
    const outputPath = generateReleaseNotes();
    console.log(`Generated ${outputPath}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
