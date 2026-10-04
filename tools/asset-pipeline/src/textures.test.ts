import { describe, expect, it } from 'vitest';

import { CC0, sourceManifestSchema, textureManifestSchema } from './manifest-schema.js';
import { textureArgs, textureDownloadUrl, TEXTURE_SIZE_PX } from './textures.js';

describe('textureArgs', () => {
  it('turns a colour map into a light greyscale 512 px detail map, so it adds grain but no hue', () => {
    const args = textureArgs({ input: 'in.jpg', output: 'out.jpg', kind: 'detail' });
    expect(TEXTURE_SIZE_PX).toBe(512);
    expect(args).toContain('Gray');
    expect(args.join(' ')).toContain('512x512');
    expect(args.at(-1)).toBe('out.jpg');
  });

  it('keeps a normal map in colour and only resizes it', () => {
    const args = textureArgs({ input: 'in.jpg', output: 'out.jpg', kind: 'normal' });
    expect(args).not.toContain('Gray');
    expect(args.join(' ')).toContain('512x512');
  });
});

describe('textureDownloadUrl', () => {
  it('asks ambientCG for the 1K JPG pack', () => {
    expect(textureDownloadUrl('Grass004')).toBe(
      'https://ambientcg.com/get?file=Grass004_1K-JPG.zip',
    );
  });
});

describe('the texture manifest', () => {
  it('parses with a credited CC0 source', () => {
    const manifest = textureManifestSchema.parse({
      textures: [
        {
          key: 'grass-detail',
          asset: 'Grass004',
          map: 'Color',
          kind: 'detail',
          source: {
            name: 'ambientCG',
            url: 'https://ambientcg.com',
            author: 'ambientCG',
            licence: CC0,
          },
        },
      ],
    });
    expect(manifest.textures).toHaveLength(1);
  });

  // Textures moved to textures.json so manifest.json stays inside the 600 line JSON budget.
  it('lives apart from the model sources', () => {
    const sources = [
      { name: 'ambientCG', url: 'https://ambientcg.com', author: 'ambientCG', licence: CC0 },
    ];
    expect(sourceManifestSchema.safeParse({ sources, models: [], textures: [] }).success).toBe(
      false,
    );
  });
});
