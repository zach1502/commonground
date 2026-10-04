import { useEffect, useState } from 'react';

import type { ContextLoad } from '@parkshape/scene/editor';

import type { WebApi } from '../api/web-api';

export type ContextApi = Pick<WebApi, 'getContext'>;

/**
 * The streets and stops around the project's parcel for a 3D view. The view does not wait for
 * it: the park draws first, and the context joins it when it arrives. With no api it stays
 * loading and nothing is fetched.
 */
export function useProjectContext(api: ContextApi | undefined, projectId: string): ContextLoad {
  const [load, setLoad] = useState<ContextLoad>({ kind: 'loading' });
  useEffect(() => {
    let live = true;
    setLoad({ kind: 'loading' });
    // A view that shows no context never asks for it.
    if (api === undefined) return undefined;
    api.getContext(projectId).then(
      (context) => {
        if (live) setLoad({ kind: 'ready', context });
      },
      () => {
        if (live) setLoad({ kind: 'failed' });
      },
    );
    return () => {
      live = false;
    };
  }, [api, projectId]);
  return load;
}
