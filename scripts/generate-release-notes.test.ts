import { describe, expect, it, vi } from 'vitest';
import {
  generateReleaseNotes,
  parseArguments
} from './generate-release-notes';
import type { BuiltReleaseNotes } from './lib/releaseNotes';

describe('release-note generator arguments', () => {
  it('accepts separate and inline head values', () => {
    expect(parseArguments(['--head', 'HEAD'])).toMatchObject({
      force: false,
      head: 'HEAD'
    });
    expect(parseArguments(['--head=v1.2.3'])).toMatchObject({
      force: false,
      head: 'v1.2.3'
    });
  });

  it('requires an explicit head whenever force is used', () => {
    expect(() => parseArguments(['--force'])).toThrow(
      /--force requires an explicit --head/
    );
    expect(parseArguments(['--force', '--head', 'HEAD'])).toMatchObject({
      force: true,
      head: 'HEAD'
    });
  });

  it('rejects missing, duplicate, and unknown arguments', () => {
    expect(() => parseArguments(['--head='])).toThrow(/--head requires a value/);
    expect(() => parseArguments(['--head', 'HEAD', '--head', 'main']))
      .toThrow(/--head may only be supplied once/);
    expect(() => parseArguments(['--range', 'HEAD'])).toThrow(/Unknown argument/);
  });
});

describe('release-note generation range', () => {
  it('passes the requested head to generation and force to the write', () => {
    const result: BuiltReleaseNotes = {
      content: '# Prompt Bank 1.2.3\n',
      entries: [],
      outputPath: 'repository/docs/releases/v1.2.3.md',
      previousTag: 'v1.2.2',
      repositoryUrl: 'https://github.com/example/prompt-bank',
      version: '1.2.3'
    };
    const build = vi.fn(() => result);
    const write = vi.fn();

    expect(generateReleaseNotes(
      ['--version', '1.2.3', '--head', 'v1.2.3', '--force'],
      'repository',
      {
        readFile: () => '{"version":"1.2.3"}',
        build,
        write
      }
    )).toBe(result.outputPath);
    expect(build).toHaveBeenCalledWith({
      repoRoot: 'repository',
      version: '1.2.3',
      previousTag: undefined,
      head: 'v1.2.3'
    });
    expect(write).toHaveBeenCalledWith(
      result.outputPath,
      result.content,
      true
    );
  });
});
