import type { SourceTexture, TextureKind } from './manifest-schema.js';

/** DESIGN.md "Ground, paths and water": detail and path maps are 512 px. */
export const TEXTURE_SIZE_PX = 512;
// JPEG quality that keeps each map near 100 KB at 512 px.
const JPEG_QUALITY = '82';
// A detail map multiplies the tint, so it stays light: greys from 85 to 100 percent.
const DETAIL_FLOOR = '85%';

export interface TextureJob {
  readonly input: string;
  readonly output: string;
  readonly kind: TextureKind;
}

/** ImageMagick arguments that turn one source map into the 512 px map the viewer loads. */
export function textureArgs({ input, output, kind }: TextureJob): string[] {
  const size = `${String(TEXTURE_SIZE_PX)}x${String(TEXTURE_SIZE_PX)}!`;
  const resize = [input, '-resize', size];
  const tone =
    kind === 'detail'
      ? ['-colorspace', 'Gray', '-normalize', '+level', `${DETAIL_FLOOR},100%`]
      : [];
  return [...resize, ...tone, '-strip', '-quality', JPEG_QUALITY, output];
}

/** The 1K JPG pack of an ambientCG asset. */
export function textureDownloadUrl(asset: string): string {
  return `https://ambientcg.com/get?file=${asset}_1K-JPG.zip`;
}

/** The file inside the pack for one map, as ambientCG names it. */
export function packFileName(texture: SourceTexture): string {
  return `${texture.asset}_1K-JPG_${texture.map}.jpg`;
}
