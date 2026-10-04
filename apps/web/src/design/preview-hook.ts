import { useEffect } from 'react';

import type { Design } from '../api/web-api';

/** What the Playwright tests read from the Describe it preview in a test build. */
export interface PreviewTestHook {
  readonly document: Design['document'];
}

declare global {
  interface Window {
    __parkshapePreview?: PreviewTestHook;
  }
}

/** Puts the previewed document on window when the test hook is on. */
export function usePreviewTestHook(testHook: 'on' | 'off', document: Design['document']): void {
  useEffect(() => {
    if (testHook === 'off') return undefined;
    window.__parkshapePreview = { document };
    return () => {
      delete window.__parkshapePreview;
    };
  }, [testHook, document]);
}
