import { useEffect, useState } from 'react';

import { carriedComments, type DesignDocument } from '@parkshape/core';

import type { ReviewApi, ReviewComment } from './review-api';

/**
 * The last version's open comments on elements this version still has, for "On the last
 * version". They are read only here, so Edit never shows on them. A first version, or a last
 * version the caller cannot read, gives none.
 */
export function useCarriedComments(
  api: ReviewApi,
  versionOf: string | null,
  document: DesignDocument,
): readonly ReviewComment[] {
  const [carried, setCarried] = useState<readonly ReviewComment[]>([]);
  useEffect(() => {
    if (versionOf === null) return;
    let live = true;
    api.listComments(versionOf).then(
      (listed) => {
        const previous = listed.elements.flatMap((element) => element.comments);
        const kept = carriedComments(previous, document).map((comment) => ({
          ...comment,
          editable: false,
        }));
        if (live) setCarried(kept);
      },
      () => {
        if (live) setCarried([]);
      },
    );
    return () => {
      live = false;
    };
  }, [api, versionOf, document]);
  return carried;
}
