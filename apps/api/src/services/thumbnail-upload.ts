import { createHash } from 'node:crypto';

import { ApiError } from '../errors.js';

const BYTES_PER_KIB = 1024;
const MAX_THUMBNAIL_KIB = 500;
const MAX_THUMBNAIL_BYTES = MAX_THUMBNAIL_KIB * BYTES_PER_KIB;
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const RIFF = Buffer.from('RIFF', 'ascii');
const WEBP = Buffer.from('WEBP', 'ascii');
// A WebP file is RIFF, a four-byte size, then WEBP.
const WEBP_TAG_OFFSET = 8;
// 16 hex digits of SHA-256 name a picture among one design's uploads with no real chance of a clash.
const CONTENT_KEY_DIGITS = 16;

interface ThumbnailFormat {
  readonly extension: 'webp' | 'png';
  readonly contentType: 'image/webp' | 'image/png';
}

/** A checked thumbnail and the content-named key it is stored under. */
export interface ThumbnailUpload extends ThumbnailFormat {
  readonly bytes: Uint8Array;
  readonly key: string;
}

function startsWith(bytes: Uint8Array, signature: Buffer, offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/** Reads the format from the file's own bytes, so the stored content type cannot be spoofed. */
function thumbnailFormat(bytes: Uint8Array): ThumbnailFormat | null {
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, WEBP_TAG_OFFSET)) {
    return { extension: 'webp', contentType: 'image/webp' };
  }
  if (startsWith(bytes, PNG_SIGNATURE)) return { extension: 'png', contentType: 'image/png' };
  return null;
}

/**
 * Decodes and checks an uploaded thumbnail. The key holds a hash of the bytes, so two uploads
 * for one design never share a key and the key a design records always holds the bytes it names.
 */
export function thumbnailUpload(designId: string, imageBase64: string): ThumbnailUpload {
  const bytes = new Uint8Array(Buffer.from(imageBase64, 'base64'));
  if (bytes.length === 0 || bytes.length > MAX_THUMBNAIL_BYTES) {
    throw new ApiError('validation', 'The thumbnail must be an image of at most 500 KB.');
  }
  const format = thumbnailFormat(bytes);
  if (format === null) {
    throw new ApiError('validation', 'The thumbnail must be a WebP or PNG image.');
  }
  const digest = createHash('sha256').update(bytes).digest('hex').slice(0, CONTENT_KEY_DIGITS);
  return { ...format, bytes, key: `thumbnails/${designId}/${digest}.${format.extension}` };
}
