import { useLayoutEffect, useRef } from 'react';

import { fadeIn } from './animate.js';

/**
 * A list reveals as one 150 ms fade on its container when its set of items changes, with no
 * stagger. `setKey` names the set, such as the ids joined; a re-render with the same set stays
 * still.
 */
export function useSetReveal<T extends Element>(setKey: string) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    if (ref.current !== null) void fadeIn(ref.current);
  }, [setKey]);
  return ref;
}
