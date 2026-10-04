import { useEffect, useMemo } from 'react';
import type { DependencyList } from 'react';

interface Disposable {
  dispose(): void;
}

/** Memoised three.js resources that are freed when their inputs change or the owner unmounts. */
export function useDisposable<T extends readonly Disposable[]>(
  create: () => T,
  deps: DependencyList,
): T {
  const resources = useMemo(create, deps);
  useEffect(
    () => () => {
      resources.forEach((resource) => {
        resource.dispose();
      });
    },
    [resources],
  );
  return resources;
}
