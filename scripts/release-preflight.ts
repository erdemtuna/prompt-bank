import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { releasePreflight, preflightReport } from './lib/releasePreflight';
import { parseStableVersion } from './lib/releaseNotes';

export function parsePreflightArguments(args: readonly string[]): { version: string; json: boolean } {
  const positional = args.filter((argument) => argument !== '--json');
  if (positional.length !== 1 || args.filter((argument) => argument === '--json').length > 1) {
    throw new Error('Usage: npm run release:preflight -- X.Y.Z [--json]');
  }
  parseStableVersion(positional[0]);
  return { version: positional[0], json: args.includes('--json') };
}

if (process.argv[1] && resolve(process.argv[1]).toLowerCase()
  === fileURLToPath(import.meta.url).toLowerCase()) {
  try {
    const args = parsePreflightArguments(process.argv.slice(2));
    const root = fileURLToPath(new URL('..', import.meta.url));
    const report = preflightReport(releasePreflight(args.version, root));
    console.log(args.json ? JSON.stringify(report, null, 2)
      : `Release ready: ${report.head}\n${report.previousTag} -> v${report.targetVersion}\n${report.ci.message}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
