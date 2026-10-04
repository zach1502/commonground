import { afterEach, describe, expect, it } from 'vitest';

import { preloadPoster } from './preload-poster';

const POSTER = {
  designId: 'd1',
  url: 'http://api.test/blobs/thumbnails/d1.webp',
  width: 640,
  height: 400,
  placeholder: '#cfe3f0',
};

const preloads = () => document.head.querySelectorAll('link[rel="preload"][as="image"]');

afterEach(() => {
  preloads().forEach((link) => {
    link.remove();
  });
});

describe('preloadPoster', () => {
  it('adds one high-priority image preload for the poster', () => {
    preloadPoster(document.head, POSTER);
    preloadPoster(document.head, POSTER);
    expect(preloads()).toHaveLength(1);
    expect(preloads()[0]?.getAttribute('href')).toBe(POSTER.url);
    expect(preloads()[0]?.getAttribute('fetchpriority')).toBe('high');
  });

  it('adds nothing when the queue has no poster', () => {
    preloadPoster(document.head, null);
    expect(preloads()).toHaveLength(0);
  });
});
