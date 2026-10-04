import type { Design, WebApi } from '../../api/web-api';

type DesignApi = Pick<WebApi, 'getDesign'>;

/** A design request started by the route loader, before the vote card renders. */
export interface PrefetchedDesign {
  readonly id: string;
  readonly design: Promise<Design>;
}

/** Starts loading one design early. A failure is handled later by whoever reads it. */
export function prefetchDesign(api: DesignApi, id: string | undefined): PrefetchedDesign | null {
  if (id === undefined) return null;
  const design = api.getDesign(id);
  design.catch(() => undefined);
  return { id, design };
}

/** The api, with getDesign answering the prefetched id from the request already in flight. */
export function withPrefetchedDesign<T extends DesignApi>(
  api: T,
  prefetched: PrefetchedDesign | null,
): T {
  if (prefetched === null) return api;
  return {
    ...api,
    getDesign: (id: string) =>
      id === prefetched.id ? prefetched.design.catch(() => api.getDesign(id)) : api.getDesign(id),
  };
}
