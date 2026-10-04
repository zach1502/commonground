import type { HttpFetch } from '@parkshape/terrain';

/** Raised in place of a network call while PARKSHAPE_OFFLINE is 1. */
export class OfflineRequestError extends Error {
  readonly kind = 'offline';

  constructor(readonly url: string) {
    super(`PARKSHAPE_OFFLINE=1 blocked a request to ${url}`);
    this.name = 'OfflineRequestError';
  }
}

/** A fetch that never touches the network, so a local run proves it needs none. */
export const offlineFetch: HttpFetch = (url) => Promise.reject(new OfflineRequestError(url));
