import { CONTEXT_LAYER_DEFAULTS, siteContextSchema } from '@parkshape/core';

import type { ContextLayerInput } from '../src/index.js';

/** Which context layers the dev page draws: none, the defaults, or every layer. */
export type DevContext = 'none' | 'defaults' | 'all';

// The recorded context for the fixture parcel, fetched by URL like the heightmap.
const CONTEXT_FILE = new URL(
  '../../terrain/fixtures/jonathan-rogers/context.json',
  import.meta.url,
);

const EVERY_LAYER = {
  street: 'on',
  sidewalk: 'on',
  busStop: 'on',
  parking: 'on',
  bikeway: 'on',
} as const;

export function contextFrom(search: URLSearchParams): DevContext {
  const value = search.get('context');
  return value === 'defaults' || value === 'all' ? value : 'none';
}

/** The fixture's context as the viewer takes it, or undefined for 'none'. */
export async function loadDevContext(mode: DevContext): Promise<ContextLayerInput | undefined> {
  if (mode === 'none') return undefined;
  const file = (await (await fetch(CONTEXT_FILE)).json()) as { readonly context: unknown };
  return {
    context: siteContextSchema.parse(file.context),
    visible: mode === 'all' ? EVERY_LAYER : CONTEXT_LAYER_DEFAULTS,
    streetNames: 'shown',
  };
}
