import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { releasePreflight, type PreflightDependencies } from './lib/releasePreflight';
import { requireRepositoryUnchanged } from './lib/releaseRepository';
import { executeGit } from './lib/releaseNotes';
import { validateReleaseNotes } from './lib/releaseNotesValidation';
import { VERSION_FILES, type VersionSources } from './lib/releaseVersions';

export { requireCleanSynchronizedMain } from './lib/releaseRepository';
export { updateVersionSources, type VersionSources } from './lib/releaseVersions';

export interface PrepareReleaseDependencies extends PreflightDependencies {
  log?: (message: string) => void;
  makeDirectory?: (path: string) => void;
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
  const ready = releasePreflight(version, repoRoot, { ...dependencies, git, readFile, exists });
  const sourcePaths = {
    packageJson: join(repoRoot, VERSION_FILES[0]),
    packageLock: join(repoRoot, VERSION_FILES[1]),
    cargoToml: join(repoRoot, VERSION_FILES[2]),
    cargoLock: join(repoRoot, VERSION_FILES[3])
  };
  const paths = Object.entries(sourcePaths) as [keyof VersionSources, string][];
  requireRepositoryUnchanged(repoRoot, ready.head, git);
  try {
    for (const [key, path] of paths) writeFile(path, ready.updated[key]);
    makeDirectory(dirname(ready.notes.outputPath));
    writeFile(ready.notes.outputPath, ready.notes.content);
    validate(repoRoot);
  } catch (error) {
    for (const [key, path] of paths) writeFile(path, ready.originals[key]);
    removeFile(ready.notes.outputPath);
    throw error;
  }

  log(`Prepared Prompt Bank v${version} from ${ready.previousTag}..${ready.head}.`);
  log('Review the complete uncommitted diff, then run:');
  log('  npm run check');
  log('  git diff --check');
  log(`  git add -- ${VERSION_FILES.join(' ')} docs/releases/v${version}.md`);
  log(`  git commit -m "Release Prompt Bank v${version}" -m "Release-Note: skip\nCo-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"`);
  log(`  git tag v${version}`);
  log(`  git push --atomic origin main refs/tags/v${version}`);
  return {
    head: ready.head, notesPath: ready.notes.outputPath,
    previousTag: ready.previousTag, version
  };
}

if (process.argv[1] && resolve(process.argv[1]).toLowerCase()
  === fileURLToPath(import.meta.url).toLowerCase()) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 1 || args[0].startsWith('-')) {
      throw new Error('Usage: npm run release:prepare -- X.Y.Z');
    }
    prepareRelease(args[0]);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
