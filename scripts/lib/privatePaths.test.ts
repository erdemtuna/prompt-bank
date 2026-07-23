import { describe, expect, it } from 'vitest';
import { findPrivateTrackedPaths, isPrivateTrackedPath, pathSegments } from './privatePaths';

describe('isPrivateTrackedPath', () => {
  it('matches a .prompt-bank directory at the repository root', () => {
    expect(isPrivateTrackedPath('.prompt-bank/review/foo.md')).toBe(true);
  });

  it('matches a .prompt-bank directory nested at any depth', () => {
    expect(isPrivateTrackedPath('examples/team/.prompt-bank/writing/bar.md')).toBe(true);
    expect(isPrivateTrackedPath('a/b/c/d/.prompt-bank/e.md')).toBe(true);
  });

  it('matches Windows style separators', () => {
    expect(isPrivateTrackedPath('examples\\team\\.prompt-bank\\writing\\bar.md')).toBe(true);
  });

  it('matches a bare .prompt-bank segment', () => {
    expect(isPrivateTrackedPath('.prompt-bank')).toBe(true);
  });

  it('does not match public prompt files', () => {
    expect(isPrivateTrackedPath('prompts/review/foo.md')).toBe(false);
    expect(isPrivateTrackedPath('src/App.tsx')).toBe(false);
  });

  it('does not match segments that merely contain the name', () => {
    expect(isPrivateTrackedPath('src/.prompt-bankish/x.md')).toBe(false);
    expect(isPrivateTrackedPath('docs/my.prompt-bank.md')).toBe(false);
    expect(isPrivateTrackedPath('prompt-bank/x.md')).toBe(false);
    expect(isPrivateTrackedPath('.prompt-bankrc')).toBe(false);
  });

  it('matches through a leading "./" prefix', () => {
    expect(isPrivateTrackedPath('./nested/.prompt-bank/x.md')).toBe(true);
  });
});

describe('findPrivateTrackedPaths', () => {
  it('returns only the offending paths, preserving order', () => {
    const tracked = [
      'README.md',
      '.prompt-bank/a.md',
      'prompts/b.md',
      'nested/.prompt-bank/c.md',
      'src/index.ts'
    ];
    expect(findPrivateTrackedPaths(tracked)).toEqual(['.prompt-bank/a.md', 'nested/.prompt-bank/c.md']);
  });

  it('returns an empty array when nothing violates the boundary', () => {
    expect(findPrivateTrackedPaths(['README.md', 'prompts/b.md'])).toEqual([]);
  });
});

describe('pathSegments', () => {
  it('drops empty segments from leading, trailing, and doubled slashes', () => {
    expect(pathSegments('/a//b/')).toEqual(['a', 'b']);
  });
});
