import { describe, expect, it } from 'vitest';
import { runCommand } from './processRunner';

describe('bounded command execution', () => {
  it('keeps arguments separate and exposes nonzero results', () => {
    const result = runCommand(process.execPath, [
      '-e', 'console.log(process.argv[1]); console.error("failure"); process.exit(7);',
      'a value; not a command'
    ], process.cwd());
    expect(result).toEqual({
      status: 7, stdout: 'a value; not a command\n', stderr: 'failure\n'
    });
  });

  it('terminates a timed-out owned process rather than treating it as success', () => {
    expect(() => runCommand(process.execPath, [
      '-e', 'setTimeout(() => {}, 10000)'
    ], process.cwd(), { timeoutMs: 100 })).toThrow(/timed out/);
  });

  it('rejects invalid budgets', () => {
    expect(() => runCommand(process.execPath, [], process.cwd(), { timeoutMs: 0 }))
      .toThrow(/positive integers/);
  });
});
