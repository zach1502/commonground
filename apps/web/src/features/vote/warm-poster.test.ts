import { afterEach, describe, expect, it, vi } from 'vitest';

import { warmPoster } from './warm-poster';

afterEach(() => {
  delete (HTMLImageElement.prototype as Partial<HTMLImageElement>).decode;
});

describe('warmPoster', () => {
  it('starts a low-priority download of the picture without adding it to the page', () => {
    const image = warmPoster(document, 'http://api.test/blobs/thumbnails/b.webp');
    expect(image?.getAttribute('src')).toBe('http://api.test/blobs/thumbnails/b.webp');
    expect(image?.getAttribute('fetchpriority')).toBe('low');
    expect(image?.isConnected).toBe(false);
  });

  it('decodes the picture ahead, so the next card paints it in the frame it changes', () => {
    const decode = vi.fn().mockResolvedValue(undefined);
    HTMLImageElement.prototype.decode = decode;
    warmPoster(document, 'http://api.test/blobs/thumbnails/b.webp');
    expect(decode).toHaveBeenCalledOnce();
  });

  it('starts nothing for a design with no stored picture', () => {
    expect(warmPoster(document, null)).toBeNull();
  });
});
