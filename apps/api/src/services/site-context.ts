import { CONTEXT_BUFFER_M, siteContextSchema, type SiteContext } from '@parkshape/core';
import type { Project } from '@parkshape/db';
import { parcelPolygonWgs84 } from '@parkshape/terrain';

import type { AppDeps } from '../deps.js';
import { contextUnavailable, fromBlobStore } from '../errors.js';

import { storedParcel } from './access.js';

type ContextDeps = Pick<AppDeps, 'blobStore' | 'siteContext' | 'logger'>;

const JSON_TYPE = 'application/json';

/** Where a project's context is kept after the first read. Project ids are safe blob keys. */
export function contextBlobKey(projectId: string): string {
  return `context/${projectId}.json`;
}

async function cachedContext(deps: ContextDeps, key: string): Promise<SiteContext | undefined> {
  const blob = await fromBlobStore(() => deps.blobStore.get(key));
  if (blob === undefined) return undefined;
  // A copy that does not parse is read again from the provider and stored over.
  const parsed = siteContextSchema.safeParse(JSON.parse(new TextDecoder().decode(blob.bytes)));
  return parsed.success ? parsed.data : undefined;
}

/**
 * The streets, sidewalks, stops, parking and bikeways within CONTEXT_BUFFER_M of the project's
 * parcel. The first read asks the provider and stores the answer; later reads use the copy. A
 * provider failure is a 503 and is not stored, so the next read tries again.
 */
export async function loadProjectContext(
  deps: ContextDeps,
  project: Project,
): Promise<SiteContext> {
  const key = contextBlobKey(project.id);
  const cached = await cachedContext(deps, key);
  if (cached !== undefined) return cached;
  const polygonWgs84 = parcelPolygonWgs84(storedParcel(project));
  const result = await deps.siteContext.getContext({ polygonWgs84, bufferM: CONTEXT_BUFFER_M });
  if (!result.ok) throw contextUnavailable();
  const bytes = new TextEncoder().encode(JSON.stringify(result.value));
  // The answer is good without the copy; a store that fails now only costs a fetch next time.
  await deps.blobStore.put(key, bytes, JSON_TYPE).catch(() => {
    deps.logger.warn(`could not store ${key}; the next read fetches it again`);
  });
  return result.value;
}
