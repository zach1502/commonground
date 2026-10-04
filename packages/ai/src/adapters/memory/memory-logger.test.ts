import { describe, expect, it } from 'vitest';

import { loggerContract } from '../../ports/__contracts__/logger.contract.js';

import { MemoryLogger } from './memory-logger.js';

loggerContract('MemoryLogger', () => new MemoryLogger());

describe('MemoryLogger', () => {
  it('keeps each warning in order', () => {
    const logger = new MemoryLogger();
    logger.warn('first');
    logger.warn('second');
    expect(logger.warnings).toEqual(['first', 'second']);
  });
});
