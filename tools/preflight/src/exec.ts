import { spawn } from 'node:child_process';

import type { Exec, ExecOptions, ExecResult } from './types.js';

const MISSING_EXIT_CODE = 127;

/** Runs a command without a shell and collects its output. A missing binary never throws. */
export const spawnExec: Exec = (command, args, options: ExecOptions = {}) =>
  new Promise<ExecResult>((resolve) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (error: NodeJS.ErrnoException) => {
      const missing = error.code === 'ENOENT';
      resolve({
        code: MISSING_EXIT_CODE,
        stdout,
        stderr: stderr + error.message,
        ...(missing ? { missing: true as const } : {}),
      });
    });
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
    // A command may exit before it reads stdin. The exit code is the result, so a broken pipe is not.
    child.stdin.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EPIPE') throw error;
    });
    child.stdin.end(options.input ?? '');
  });
