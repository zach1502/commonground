import { err, type Clock, type Result } from '@parkshape/core';

import type { Completion, LlmClient, LlmError, LlmRequest } from '../../ports/llm-client.js';
import type { Logger } from '../../ports/logger.js';

const TOO_MANY_REQUESTS = 429;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

/** How long a model that answered 429 is skipped when the reply did not say how long to wait. */
export const DEFAULT_COOLDOWN_MS = SECONDS_PER_MINUTE * MS_PER_SECOND;

const MAX_COOLDOWN_MINUTES = 15;

/** The longest skip, so a model held by a daily limit is still tried now and then. */
export const MAX_COOLDOWN_MS = MAX_COOLDOWN_MINUTES * SECONDS_PER_MINUTE * MS_PER_SECOND;

/** The clients in the order they are asked; there is always a first one. */
export type ChainLinks = readonly [LlmClient, ...LlmClient[]];

export interface ModelChainOptions {
  readonly clients: ChainLinks;
  readonly clock: Clock;
  readonly logger: Logger;
}

function cooldownMs(error: LlmError & { readonly kind: 'http' }): number {
  return Math.min(error.retryAfterMs ?? DEFAULT_COOLDOWN_MS, MAX_COOLDOWN_MS);
}

function seconds(ms: number): string {
  return String(Math.ceil(ms / MS_PER_SECOND));
}

/**
 * Asks each model in turn, moving on only when one answers 429. Any other failure is returned
 * at once, so a request the server refuses does not spend the next model's quota as well.
 * A model that answered 429 is skipped until its cooldown ends, read from the injected clock.
 */
export class ModelChainClient implements LlmClient {
  readonly model: string;
  readonly #options: ModelChainOptions;
  /** Per client, the time in ms before which it is not called. */
  readonly #skipUntil = new Map<LlmClient, number>();

  constructor(options: ModelChainOptions) {
    this.model = options.clients[0].model;
    this.#options = options;
  }

  async complete(request: LlmRequest): Promise<Result<Completion, LlmError>> {
    let lastRateLimit: LlmError | undefined;
    for (const client of this.#options.clients) {
      if (this.#isCoolingDown(client)) continue;
      const result = await client.complete(request);
      if (result.ok || result.error.kind !== 'http' || result.error.status !== TOO_MANY_REQUESTS) {
        return result;
      }
      this.#coolDown(client, cooldownMs(result.error));
      lastRateLimit = result.error;
    }
    const models = this.#options.clients.map((client) => client.model);
    return err(lastRateLimit ?? { kind: 'cooling-down', models });
  }

  #isCoolingDown(client: LlmClient): boolean {
    const leftMs = (this.#skipUntil.get(client) ?? 0) - this.#options.clock.now().getTime();
    if (leftMs <= 0) return false;
    this.#options.logger.warn(
      `AI model ${client.model} skipped; rate limited for ${seconds(leftMs)} s more.`,
    );
    return true;
  }

  #coolDown(client: LlmClient, ms: number): void {
    this.#skipUntil.set(client, this.#options.clock.now().getTime() + ms);
    this.#options.logger.warn(
      `AI model ${client.model} answered 429; skipping it for ${seconds(ms)} s.`,
    );
  }
}
