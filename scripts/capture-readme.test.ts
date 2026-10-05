import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { captureReadme, parseCaptureArguments } from './capture-readme';

describe('explicit README capture', () => {
  it('requires a single explicit PNG destination', () => {
    expect(parseCaptureArguments(['--output', 'example.png'], process.cwd()))
      .toBe(resolve('example.png'));
    for (const args of [[], ['--output'], ['--output', 'example.jpg'], ['--unknown', 'example.png']]) {
      expect(() => parseCaptureArguments(args, process.cwd())).toThrow();
    }
  });

  it('uses the existing isolated browser scenario and runner-owned server', () => {
    const run = vi.fn(() => ({ status: 0, stdout: '', stderr: '' }));
    const root = process.cwd();
    const output = captureReadme(['--output', 'example.png'], root, run);
    expect(run).toHaveBeenCalledWith(process.execPath, [
      resolve('node_modules', '@playwright', 'test', 'cli.js'),
      'test', 'readme-capture.spec.ts'
    ], root, expect.objectContaining({
      timeoutMs: 300_000,
      env: expect.objectContaining({ PROMPT_BANK_README_CAPTURE: output })
    }));
  });

  it('surfaces a browser failure rather than reporting a completed capture', () => {
    const run = vi.fn(() => ({ status: 1, stdout: 'Browser scenario failed.', stderr: '' }));
    expect(() => captureReadme(['--output', 'example.png'], process.cwd(), run))
      .toThrow(/Browser scenario failed/);
  });
});
