import {
  compareContextFeatures,
  err,
  ok,
  type ContextFeature,
  type Result,
  type SiteContext,
} from '@parkshape/core';

import type {
  SiteContextError,
  SiteContextProvider,
  SiteContextRequest,
} from '../../ports/site-context-provider.js';

export interface InMemorySiteContextOptions {
  readonly features: readonly ContextFeature[];
  readonly recordedAt: string;
}

/** Returns the features it was given, for API tests that need context with no files or network. */
export class InMemorySiteContextProvider implements SiteContextProvider {
  readonly name = 'memory';

  constructor(private readonly options: InMemorySiteContextOptions) {}

  getContext(request: SiteContextRequest): Promise<Result<SiteContext, SiteContextError>> {
    if (!Number.isFinite(request.bufferM) || request.bufferM < 0) {
      return Promise.resolve(
        err({ kind: 'invalidRequest', reason: 'bufferM must be a finite number of 0 or more' }),
      );
    }
    const features = [...this.options.features].sort(compareContextFeatures);
    return Promise.resolve(
      ok({ features, bufferM: request.bufferM, recordedAt: this.options.recordedAt }),
    );
  }
}
