import { z } from 'zod';

import { intentSchema, type Intent } from '@parkshape/core';

import { LEAD_TAGS, type SeedTag } from './fragments.js';
import { readSeedJson, seedJsonFiles } from './seed-files.js';

/** What a design shows while its hand-written blurb is still a placeholder. */
export const DRAFT_BLURB = 'Draft blurb';
// The todo-audit rule blocks the full preflight tier while any seed file holds this marker.
const PLACEHOLDER = /\bTODO\(#seed/;
const SHOWCASE_DIR = 'showcase';

const seedTagSchema = z.enum([...LEAD_TAGS, 'paths']);

export const showcaseSchema = z.object({
  title: z.string().min(1),
  /** Index into the seeded residents. */
  author: z.number().int().min(0),
  seed: z.number().int().min(0),
  tags: z.array(seedTagSchema).min(1),
  blurb: z.string().min(1),
  intent: intentSchema,
});

export interface ShowcaseDesign {
  readonly file: string;
  readonly title: string;
  readonly author: number;
  readonly seed: number;
  readonly tags: readonly SeedTag[];
  readonly blurb: string;
  readonly intent: Intent;
}

/** Whether the text is still the placeholder a team member has to replace. */
export function isPlaceholder(blurb: string): boolean {
  return PLACEHOLDER.test(blurb);
}

/** The blurb to store: the team's text, or the visible draft marker while it is missing. */
export function storedBlurb(blurb: string): string {
  return isPlaceholder(blurb) ? DRAFT_BLURB : blurb;
}

/** The hand-picked designs in packages/db/seed/showcase, in file order. */
export function loadShowcase(): ShowcaseDesign[] {
  return seedJsonFiles(SHOWCASE_DIR).map((file) => ({
    file,
    ...showcaseSchema.parse(readSeedJson(file)),
  }));
}
