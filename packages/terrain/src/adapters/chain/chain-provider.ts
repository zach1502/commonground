import { err, ok, type Result } from '@parkshape/core';

import type {
  ProviderAttempt,
  TerrainError,
  TerrainProvider,
  TerrainRequest,
  TerrainResult,
} from '../../ports/terrain-provider.js';

/** Tries each provider in order and returns the first success, with the attempts made. */
export class ChainProvider implements TerrainProvider {
  readonly name: string;

  constructor(private readonly providers: readonly TerrainProvider[]) {
    this.name = `chain(${providers.map((provider) => provider.name).join(',')})`;
  }

  async getHeightmap(request: TerrainRequest): Promise<Result<TerrainResult, TerrainError>> {
    const attempts: ProviderAttempt[] = [];
    for (const provider of this.providers) {
      const result = await provider.getHeightmap(request);
      if (result.ok) {
        attempts.push({ provider: provider.name, outcome: 'succeeded' });
        return ok({ ...result.value, attempts });
      }
      attempts.push({ provider: provider.name, outcome: 'failed', errorKind: result.error.kind });
    }
    return err({ kind: 'allProvidersFailed', attempts });
  }
}
