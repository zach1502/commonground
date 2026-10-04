import { EventEmitter } from 'node:events';

import { describe, expect, it } from 'vitest';

import { EXIT_FATAL, installFatalHandlers } from '../../src/node-server.js';

function fakeProcess() {
  const target = new EventEmitter();
  const lines: string[] = [];
  const exits: number[] = [];
  installFatalHandlers(target, {
    logger: { warn: (line) => lines.push(line) },
    exit: (code) => {
      exits.push(code);
    },
  });
  return { target, lines, exits };
}

describe('fatal handlers', () => {
  it('logs an unhandled rejection through the Logger port and exits non-zero', () => {
    const { target, lines, exits } = fakeProcess();
    target.emit('unhandledRejection', new Error('lost promise'), Promise.resolve());
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/fatal: unhandled rejection.*lost promise/);
    expect(exits).toEqual([EXIT_FATAL]);
    expect(EXIT_FATAL).not.toBe(0);
  });

  it('logs an uncaught exception with its stack and exits non-zero', () => {
    const { target, lines, exits } = fakeProcess();
    target.emit('uncaughtException', new TypeError('bad state'));
    expect(lines[0]).toMatch(/fatal: uncaught exception.*TypeError: bad state/s);
    expect(lines[0]).toMatch(/at /);
    expect(exits).toEqual([EXIT_FATAL]);
  });

  it('describes a rejection that is not an Error', () => {
    const { target, lines } = fakeProcess();
    target.emit('unhandledRejection', 'just a string');
    expect(lines[0]).toMatch(/just a string/);
  });

  it('exits once when a second fault arrives while the first is being handled', () => {
    const { target, exits } = fakeProcess();
    target.emit('uncaughtException', new Error('first'));
    target.emit('unhandledRejection', new Error('second'));
    expect(exits).toEqual([EXIT_FATAL]);
  });
});
