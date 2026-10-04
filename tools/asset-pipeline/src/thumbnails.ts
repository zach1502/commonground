import { createHash } from 'node:crypto';

import { z } from 'zod';

/** Where the pictures live inside the web app's public folder. */
export const THUMBNAIL_DIR = 'catalog-thumbs';
const PNG_SIGNATURE = Uint8Array.from(Buffer.from('89504e470d0a1a0a', 'hex'));
// The IHDR chunk holds the width then the height as 4-byte big-endian numbers.
const WIDTH_OFFSET = 16;
const HEIGHT_OFFSET = 20;
const HEADER_BYTES = 24;
const NOTE =
  'Written by pnpm --filter @parkshape/asset-pipeline thumbnails. A changed model hash or settings hash renders the picture again.';

export const thumbnailEntrySchema = z.strictObject({
  itemId: z.string(),
  modelKey: z.string(),
  file: z.string(),
  /** sha256 of the processed GLB the picture was drawn from. */
  modelHash: z.string(),
  bytes: z.number().int().positive(),
});

export const thumbnailManifestSchema = z.strictObject({
  note: z.string(),
  /** sha256 of the camera, light and size settings the pictures were drawn with. */
  settingsHash: z.string(),
  thumbnails: z.array(thumbnailEntrySchema),
});

export type ThumbnailEntry = z.infer<typeof thumbnailEntrySchema>;
export type ThumbnailManifest = z.infer<typeof thumbnailManifestSchema>;

export interface ThumbnailItem {
  readonly id: string;
  readonly modelKey: string;
}

export function thumbnailFile(itemId: string): string {
  return `${THUMBNAIL_DIR}/${itemId}.png`;
}

export function hashOf(content: Uint8Array | string): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Width and height from a PNG's header, or null when the bytes are not a PNG. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < HEADER_BYTES) return null;
  if (PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(WIDTH_OFFSET), height: view.getUint32(HEIGHT_OFFSET) };
}

export interface ThumbnailPlanInput {
  readonly items: readonly ThumbnailItem[];
  /** sha256 of each processed GLB, by model key. */
  readonly modelHashes: ReadonlyMap<string, string>;
  readonly existing: ThumbnailManifest | undefined;
  readonly settingsHash: string;
  /** Whether a file under the public folder exists. */
  readonly present: (file: string) => boolean;
}

export interface ThumbnailPlan {
  readonly render: readonly (ThumbnailItem & { readonly modelHash: string })[];
}

/**
 * The items to draw: every one when the settings changed, else those with no entry, no file or
 * a model hash that no longer matches the GLB.
 */
export function thumbnailPlan(input: ThumbnailPlanInput): ThumbnailPlan {
  const { existing, settingsHash } = input;
  const sameSettings = existing?.settingsHash === settingsHash;
  const byId = new Map(existing?.thumbnails.map((entry) => [entry.itemId, entry]));
  const render = input.items.flatMap((item) => {
    const modelHash = input.modelHashes.get(item.modelKey);
    if (modelHash === undefined) {
      throw new Error(`No processed model ${item.modelKey} for catalog item ${item.id}`);
    }
    const entry = byId.get(item.id);
    const fresh =
      sameSettings &&
      entry?.modelHash === modelHash &&
      entry.modelKey === item.modelKey &&
      input.present(entry.file);
    return fresh ? [] : [{ ...item, modelHash }];
  });
  return { render };
}

/** The manifest to write: one entry per catalog item, in catalog order. */
export function thumbnailManifest(
  items: readonly ThumbnailItem[],
  entries: readonly ThumbnailEntry[],
  settingsHash: string,
): ThumbnailManifest {
  const byId = new Map(entries.map((entry) => [entry.itemId, entry]));
  return {
    note: NOTE,
    settingsHash,
    thumbnails: items.flatMap((item) => {
      const entry = byId.get(item.id);
      return entry === undefined ? [] : [entry];
    }),
  };
}
