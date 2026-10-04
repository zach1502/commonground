const HASH_LENGTH = 8;

/** Builds a cache-busting kebab-case asset file name from a label, content hash, and extension. */
export function assetFileName(label: string, hash: string, extension: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug}.${hash.slice(0, HASH_LENGTH)}.${extension}`;
}
