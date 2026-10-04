import type { Clock } from '../ports/clock.js';

/** Clock that returns a fixed instant until advanced; for tests. */
export class FakeClock implements Clock {
  private currentMs: number;

  constructor(start: Date) {
    this.currentMs = start.getTime();
  }

  now(): Date {
    return new Date(this.currentMs);
  }

  advance(ms: number): void {
    this.currentMs += ms;
  }
}
