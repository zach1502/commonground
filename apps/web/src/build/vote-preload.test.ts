import { describe, expect, it } from 'vitest';

import { QUEUE_BATCH_SIZE } from '@parkshape/core';

import { VOTE_PRELOAD_MARKER, injectVotePreload, votePreloadPlan } from './vote-preload';

const chunk = (fileName: string, imports: string[], facadeModuleId: string | null = null) => ({
  type: 'chunk' as const,
  fileName,
  imports,
  facadeModuleId,
  moduleIds: facadeModuleId === null ? [] : [facadeModuleId],
});

/** Rollup leaves the facade empty when the chunk also exports bindings to a lazy chunk. */
const SHARED_VOTE_CHUNK = {
  type: 'chunk' as const,
  fileName: 'assets/vote-page-c.js',
  imports: ['assets/react-b.js', 'assets/index-a.js'],
  facadeModuleId: null,
  moduleIds: [
    '/repo/apps/web/src/features/vote/vote-warm.ts',
    '/repo/apps/web/src/pages/vote-page.tsx',
  ],
};

const BUNDLE = {
  'assets/index-a.js': { ...chunk('assets/index-a.js', ['assets/react-b.js']), isEntry: true },
  'assets/react-b.js': chunk('assets/react-b.js', []),
  'assets/vote-page-c.js': chunk(
    'assets/vote-page-c.js',
    ['assets/react-b.js', 'assets/index-a.js', 'assets/intent-d.js'],
    '/repo/apps/web/src/pages/vote-page.tsx',
  ),
  'assets/intent-d.js': chunk('assets/intent-d.js', ['assets/zod-e.js']),
  'assets/zod-e.js': chunk('assets/zod-e.js', []),
  'assets/gallery-page-f.js': chunk('assets/gallery-page-f.js', [], '/repo/gallery-page.tsx'),
  'assets/index-g.css': { type: 'asset' as const, fileName: 'assets/index-g.css' },
};

describe('votePreloadPlan', () => {
  it('lists the vote page chunk and its imports that the entry does not load already', () => {
    expect(votePreloadPlan(BUNDLE, '/')).toEqual({
      chunks: ['/assets/vote-page-c.js', '/assets/intent-d.js', '/assets/zod-e.js'],
      queueSize: QUEUE_BATCH_SIZE,
    });
  });

  it('prefixes the base path', () => {
    expect(votePreloadPlan(BUNDLE, '/app/')?.chunks[0]).toBe('/app/assets/vote-page-c.js');
  });

  it('finds the vote page chunk when it also exports to a lazy chunk and has no facade', () => {
    const bundle = { ...BUNDLE, 'assets/vote-page-c.js': SHARED_VOTE_CHUNK };
    expect(votePreloadPlan(bundle, '/')?.chunks).toEqual(['/assets/vote-page-c.js']);
  });

  it('is null when the bundle has no vote page chunk', () => {
    const { ['assets/vote-page-c.js']: omitted, ...rest } = BUNDLE;
    expect(omitted).toBeDefined();
    expect(votePreloadPlan(rest, '/')).toBeNull();
  });
});

describe('injectVotePreload', () => {
  it('replaces the marker in index.html with the plan as JSON', () => {
    const html = `<script>(function (plan) {})(${VOTE_PRELOAD_MARKER});</script>`;
    const plan = { chunks: ['/assets/v.js'], queueSize: 5 };
    expect(injectVotePreload(html, plan)).toBe(
      '<script>(function (plan) {})({"chunks":["/assets/v.js"],"queueSize":5});</script>',
    );
  });

  it('fails the build when index.html lost the marker', () => {
    expect(() => injectVotePreload('<html></html>', null)).toThrow('vote-preload');
  });
});
