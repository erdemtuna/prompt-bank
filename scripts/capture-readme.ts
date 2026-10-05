import { lstatSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCommand } from './lib/processRunner';

export function parseCaptureArguments(args: readonly string[], repoRoot: string): string {
  if (args.length !== 2 || args[0] !== '--output' || !args[1]) {
    throw new Error('Usage: npm run screenshot:readme -- --output <image.png>');
  }
  const output = resolve(repoRoot, args[1]);
  if (extname(output).toLowerCase() !== '.png') throw new Error('Capture output must be a PNG file.');
  const existing = lstatSync(output, { throwIfNoEntry: false });
  if (existing && (!existing.isFile() || existing.isSymbolicLink())) {
    throw new Error('Capture output must be a regular file, not a directory or symlink.');
  }
  return output;
}

export function captureReadme(
  args: readonly string[],
  repoRoot: string,
  run: typeof runCommand = runCommand
): string {
  const output = parseCaptureArguments(args, repoRoot);
  const result = run(process.execPath, [
    join(repoRoot, 'node_modules', '@playwright', 'test', 'cli.js'),
    'test', 'readme-capture.spec.ts'
  ], repoRoot, {
    timeoutMs: 300_000,
    env: { ...process.env, PROMPT_BANK_README_CAPTURE: output }
  });
  if (result.status !== 0) {
    throw new Error(`README capture failed.\n${result.stderr.trim() || result.stdout.trim()}`);
  }
  return output;
}

if (process.argv[1] && resolve(process.argv[1]).toLowerCase()
  === fileURLToPath(import.meta.url).toLowerCase()) {
  try {
    const root = fileURLToPath(new URL('..', import.meta.url));
    console.log(`Captured ${captureReadme(process.argv.slice(2), root)}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
