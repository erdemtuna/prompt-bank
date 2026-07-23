/**
 * Boundary guard: fail if any private prompt source is tracked in git.
 *
 * Private prompts live in `.prompt-bank` directories (the global home and folder
 * workspaces) and must never be committed. `.gitignore` prevents accidental
 * additions, but this guard is the standing proof: it lists every tracked file
 * and fails when any path carries a `.prompt-bank` segment at any depth, so a
 * forced add cannot slip a private prompt into history unnoticed.
 */

import { execFileSync } from 'node:child_process';
import { findPrivateTrackedPaths } from './lib/privatePaths';

function trackedFiles(): string[] {
  const output = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' });
  return output.split('\0').filter((path) => path.length > 0);
}

function main(): void {
  const offenders = findPrivateTrackedPaths(trackedFiles());
  if (offenders.length > 0) {
    console.error('Private prompt sources must never be tracked in this repository.');
    console.error('The following tracked paths contain a ".prompt-bank" segment:');
    for (const path of offenders) {
      console.error(`  ${path}`);
    }
    console.error('Remove them with "git rm --cached" and confirm ".gitignore" covers the path.');
    process.exit(1);
  }
  console.log('Boundary guard passed: no tracked ".prompt-bank" paths.');
}

main();
