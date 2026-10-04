import { InvalidBlobKeyError } from '@parkshape/storage';

import type { ApiApp, AppDeps } from '../deps.js';
import { ApiError, fromBlobStore, notFound } from '../errors.js';
import { HTTP_OK } from '../http-status.js';
import { loadVisibleSummary } from '../services/access.js';
import { isStorableText } from '../storable-text.js';

// A design's thumbnail key changes with each capture, but a short cache with revalidation still
// keeps the gallery fast without pinning a stale image under an older key.
const CACHE_CONTROL = 'public, max-age=60';
// A draft's picture is its author's alone, so no shared cache may keep a copy.
const PRIVATE_CACHE_CONTROL = 'private, max-age=60';
// thumbnails/<design id>/<16 hex of the bytes>.png, or thumbnails/<design id>.png from before
// uploads were named by content. Any other png or webp under thumbnails/ still captures a design
// id that is looked up, and so answers 404 unless that design is visible.
const THUMBNAIL_KEY = /^thumbnails\/(.+?)(?:\/[0-9a-f]{16})?\.(?:png|webp)$/;

/**
 * A thumbnail follows its design's visibility: a draft's picture is as private as the draft, and
 * a missing or hidden design answers 404 like a missing picture. Returns the Cache-Control.
 */
async function cacheControlFor(
  deps: AppDeps,
  key: string,
  viewerId: string | undefined,
): Promise<string> {
  const designId = THUMBNAIL_KEY.exec(key)?.[1];
  if (designId === undefined) return CACHE_CONTROL;
  if (!isStorableText(designId)) throw notFound('The picture');
  // A hidden draft answers exactly as a missing picture does, message included.
  const design = await loadVisibleSummary(deps.repos, designId, viewerId).catch(
    (error: unknown) => {
      if (error instanceof ApiError && error.kind === 'not-found') return undefined;
      throw error;
    },
  );
  if (design === undefined) throw notFound('The picture');
  return design.status === 'draft' ? PRIVATE_CACHE_CONTROL : CACHE_CONTROL;
}

async function readBlob(deps: AppDeps, key: string) {
  try {
    return await fromBlobStore(() => deps.blobStore.get(key));
  } catch (error) {
    if (error instanceof InvalidBlobKeyError) return undefined;
    throw error;
  }
}

/**
 * Streams stored blobs (thumbnails and renders) back through the blob store. A missing blob is
 * a 404 in the usual error shape; a store that does not answer is a 503 with Retry-After.
 */
export function registerBlobRoutes(app: ApiApp, deps: AppDeps): void {
  app.get('/blobs/:key{.+}', async (c) => {
    const key = c.req.param('key');
    // The store is read first, so an outage answers the same 503 for every key and says
    // nothing about which designs exist.
    const blob = await readBlob(deps, key);
    if (blob === undefined) throw notFound('The picture');
    const cacheControl = await cacheControlFor(deps, key, c.get('session')?.userId);
    c.header('Content-Type', blob.contentType);
    c.header('Cache-Control', cacheControl);
    const bytes = blob.bytes.slice();
    return c.body(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      HTTP_OK,
    );
  });
}
