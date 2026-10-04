import type { Logger } from '../../ports/logger.js';

/** Keeps warnings in memory so tests can read them. */
export class MemoryLogger implements Logger {
  readonly warnings: string[] = [];

  warn(message: string): void {
    this.warnings.push(message);
  }
}
