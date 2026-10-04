import type { Clock } from '../ports/clock.js';

/** Clock backed by the host system time. */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
