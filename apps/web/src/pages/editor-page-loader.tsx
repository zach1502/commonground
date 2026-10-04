import { lazy, Suspense } from 'react';

import type { WebDeps } from '../app-deps';

import { LoadingPage } from './error-page';

// The editor and its rules sit in their own chunk, so other pages do not download them.
const EditorPage = lazy(async () => ({ default: (await import('./editor-page')).EditorPage }));

export function EditorPageLoader({ deps }: { readonly deps: WebDeps }) {
  return (
    <Suspense fallback={<LoadingPage />}>
      <EditorPage deps={deps} />
    </Suspense>
  );
}
