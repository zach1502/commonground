import { renderThumbnail } from '../src/thumbnail-entry.js';
import type { OfflineFrame, ThumbnailInput } from '../src/thumbnail-entry.js';

const RGBA = 4;
const HALF = 0.5;
// Rec. 709 luma weights for red, green and blue.
const LUMA_RED = 0.2126;
const LUMA_GREEN = 0.7152;
const LUMA_BLUE = 0.0722;
const GREEN = 1;
const BLUE = 2;

/**
 * Renders a thumbnail and reads back the RGBA of its centre and top-left pixels, for the
 * black-thumbnail check. A transparent corner shows as black once the PNG lands on a card.
 */
export async function thumbnailPixels(input: ThumbnailInput): Promise<number[]> {
  const blob = await renderThumbnail(input);
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  if (context === null) return [];
  context.drawImage(bitmap, 0, 0);
  const x = Math.floor(bitmap.width * HALF);
  const y = Math.floor(bitmap.height * HALF);
  const centre = [...context.getImageData(x, y, 1, 1).data.slice(0, RGBA)];
  const corner = [...context.getImageData(0, 0, 1, 1).data.slice(0, RGBA)];
  return [...centre, ...corner];
}

async function pixelsOf(blob: Blob): Promise<Uint8ClampedArray> {
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d');
  if (context === null) return new Uint8ClampedArray();
  context.drawImage(bitmap, 0, 0);
  return context.getImageData(0, 0, bitmap.width, bitmap.height).data;
}

/** Mean luma of every pixel, out of 255. */
export function meanLuminance(rgba: Uint8ClampedArray): number {
  let sum = 0;
  for (let i = 0; i < rgba.length; i += RGBA) {
    const red = rgba[i] ?? 0;
    const green = rgba[i + GREEN] ?? 0;
    const blue = rgba[i + BLUE] ?? 0;
    sum += LUMA_RED * red + LUMA_GREEN * green + LUMA_BLUE * blue;
  }
  return rgba.length === 0 ? 0 : sum / (rgba.length / RGBA);
}

/** Renders a thumbnail and reports its encoding and mean luminance, for the dark-frame check. */
export async function thumbnailFacts(
  input: ThumbnailInput,
): Promise<{ type: string; meanLuminance: number }> {
  const blob = await renderThumbnail(input);
  return { type: blob.type, meanLuminance: meanLuminance(await pixelsOf(blob)) };
}

/** Renders one still image of the dev scene with the offline preset, as base64, for render-hero. */
export async function offlineImage(input: ThumbnailInput, frame: OfflineFrame): Promise<string> {
  const bytes = new Uint8Array(await (await renderThumbnail(input, frame)).arrayBuffer());
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}
