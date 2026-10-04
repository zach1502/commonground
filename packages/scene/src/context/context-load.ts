import type { SiteContext } from '@parkshape/core';

/** Where the page is with the site context: on its way, in, or failed for this visit. */
export type ContextLoad =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly context: SiteContext }
  | { readonly kind: 'failed' };
