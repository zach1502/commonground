import type { Sourced } from '../answer-source.js';
import type { Summary } from '../schema/summary.js';
import type { SummaryInput } from '../types.js';

/** Turns the top designs and vote counts into themes and tradeoffs for staff. */
export interface SummaryProvider {
  /** The summary, and whether the fixed rules or a named model wrote it. */
  summarize(input: SummaryInput): Promise<Sourced<Summary>>;
}
