import { spawnSync } from 'node:child_process';
import { basename } from 'node:path';

export interface CommandResult {
  status: number;
  stdout: string;
  stderr: string;
}

export function runCommand(
  program: string,
  args: readonly string[],
  cwd: string,
  options: { timeoutMs?: number; maxBuffer?: number; env?: NodeJS.ProcessEnv } = {}
): CommandResult {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const maxBuffer = options.maxBuffer ?? 8 * 1024 * 1024;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0
    || !Number.isSafeInteger(maxBuffer) || maxBuffer <= 0) {
    throw new Error('Command timeout and output limit must be positive integers.');
  }
  const result = spawnSync(program, [...args], {
    cwd,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: timeoutMs,
    maxBuffer,
    env: options.env
  });
  if (result.error) {
    const name = basename(program);
    const code = 'code' in result.error && typeof result.error.code === 'string'
      ? result.error.code : undefined;
    if (code === 'ETIMEDOUT') {
      throw new Error(`${name} timed out after ${timeoutMs} ms; no result was confirmed.`);
    }
    if (code === 'ENOBUFS') {
      throw new Error(`${name} exceeded the command output limit.`);
    }
    if (code === 'ENOENT') {
      throw new Error(`${name} is unavailable. Install it or make it available on PATH.`);
    }
    throw new Error(`${name} could not complete (${code ?? 'process error'}).`);
  }
  if (result.status === null) {
    throw new Error(`${basename(program)} was interrupted (${result.signal ?? 'unknown signal'}).`);
  }
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  };
}
