import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateReleaseNotes } from './lib/releaseNotesValidation';

function isMainModule(): boolean {
  return Boolean(process.argv[1])
    && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
}

if (isMainModule()) {
  try {
    const repoRoot = fileURLToPath(new URL('..', import.meta.url));
    const result = validateReleaseNotes(repoRoot);
    console.log(
      `Validated ${result.notesPath} (${result.previousTag}..v${result.version}).`
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
