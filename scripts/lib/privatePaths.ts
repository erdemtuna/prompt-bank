/**
 * Shared matcher for the private prompt boundary guard.
 *
 * Private prompt sources live in a `.prompt-bank` directory (the global home and
 * any folder workspace). None of them may ever be tracked in this repository, at
 * any depth. This matcher is kept pure and separate so it can be unit tested with
 * synthetic paths, and it is reused by the tracked path guard script.
 */

const PRIVATE_SEGMENT = '.prompt-bank';

/** Split a path into segments, tolerating both forward and back slashes. */
export function pathSegments(path: string): string[] {
  return path.split(/[/\\]/).filter((segment) => segment.length > 0);
}

/**
 * Returns true when a repository relative path contains a `.prompt-bank` segment
 * at any depth, meaning it belongs to a private prompt source and must not be
 * tracked. Matching is exact per segment, so names such as `.prompt-bankish` or
 * `my.prompt-bank` do not match.
 */
export function isPrivateTrackedPath(path: string): boolean {
  return pathSegments(path).includes(PRIVATE_SEGMENT);
}

/** Filter a list of tracked paths down to the ones that violate the boundary. */
export function findPrivateTrackedPaths(paths: Iterable<string>): string[] {
  const offenders: string[] = [];
  for (const path of paths) {
    if (isPrivateTrackedPath(path)) {
      offenders.push(path);
    }
  }
  return offenders;
}
