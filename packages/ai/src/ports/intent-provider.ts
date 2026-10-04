import type { Sourced } from '../answer-source.js';
import type { Intent } from '../schema/intent.js';

/** Turns a resident's free-text description of a park into a structured intent. */
export interface IntentProvider {
  /** The intent, and whether the fixed rules or a named model read the text. */
  parse(text: string): Promise<Sourced<Intent>>;
}
