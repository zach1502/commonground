import { describe, expect, it } from 'vitest';

import { spawnExec } from './exec.js';

describe('spawnExec', () => {
  it('collects output and the exit code', async () => {
    const script =
      'process.stdout.write("out"); process.stderr.write("err"); process.exitCode = 3;';
    const result = await spawnExec(process.execPath, ['-e', script]);
    expect(result).toEqual({ code: 3, stdout: 'out', stderr: 'err' });
  });

  it('passes stdin through', async () => {
    const script =
      'process.stdin.on("data", (d) => process.stdout.write(String(d).toUpperCase()));';
    expect((await spawnExec(process.execPath, ['-e', script], { input: 'abc' })).stdout).toBe(
      'ABC',
    );
  });

  it('keeps the exit code when the command exits before reading its input', async () => {
    const input = 'x'.repeat(4 * 1024 * 1024);
    const result = await spawnExec(process.execPath, ['-e', 'process.exit(0)'], { input });
    expect(result.code).toBe(0);
  });

  it('marks a missing binary instead of throwing', async () => {
    const result = await spawnExec('parkshape-no-such-binary', []);
    expect(result.missing).toBe(true);
    expect(result.code).toBe(127);
  });
});
