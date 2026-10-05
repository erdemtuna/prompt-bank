import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createGitHubQuery,
  createGitHubReadinessClient,
  formatCiSnapshot
} from './lib/githubReadiness';
import { executeGit } from './lib/releaseNotes';
import { repositoryIdentity } from './lib/releaseRepository';

export function parseCiArguments(args: readonly string[]): { sha?: string; json: boolean } {
  const json = args.includes('--json');
  const positional = args.filter((argument) => argument !== '--json');
  if (args.filter((argument) => argument === '--json').length > 1
    || positional.length > 1
    || (positional[0] && !/^[a-f0-9]{40}$/i.test(positional[0]))) {
    throw new Error('Usage: npm run ci:status -- [<40-character commit SHA>] [--json]');
  }
  return { sha: positional[0], json };
}

if (process.argv[1] && resolve(process.argv[1]).toLowerCase()
  === fileURLToPath(import.meta.url).toLowerCase()) {
  try {
    const args = parseCiArguments(process.argv.slice(2));
    const root = fileURLToPath(new URL('..', import.meta.url));
    const head = executeGit(['rev-parse', '--verify', 'HEAD^{commit}'], root);
    if (head.status !== 0) throw new Error('Unable to resolve HEAD.');
    const client = createGitHubReadinessClient(repositoryIdentity(root), createGitHubQuery(root));
    const snapshot = client.ci(args.sha ?? head.stdout.trim());
    console.log(args.json ? JSON.stringify(snapshot, null, 2) : formatCiSnapshot(snapshot));
    process.exitCode = snapshot.state === 'success' ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
