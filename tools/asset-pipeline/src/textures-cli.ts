import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { unzipSync } from 'fflate';

import { textureManifestSchema, type SourceTexture } from './manifest-schema.js';
import { httpFetcher } from './sources.js';
import { packFileName, textureArgs, textureDownloadUrl } from './textures.js';

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));
const REPO_DIR = fileURLToPath(new URL('../../..', import.meta.url));
const CACHE_DIR = join(PACKAGE_DIR, 'sources');
const OUTPUT_DIR = join(REPO_DIR, 'apps/web/public/textures');

async function sourceMap(texture: SourceTexture): Promise<string> {
  const zipPath = join(CACHE_DIR, `${texture.asset}_1K-JPG.zip`);
  if (!existsSync(zipPath)) {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(zipPath, await httpFetcher(textureDownloadUrl(texture.asset)));
  }
  const name = packFileName(texture);
  const bytes = unzipSync(readFileSync(zipPath), { filter: (file) => file.name === name })[name];
  if (bytes === undefined) throw new Error(`${name} is not in the ${texture.asset} pack`);
  const path = join(CACHE_DIR, name);
  writeFileSync(path, bytes);
  return path;
}

/** Downloads each ambientCG pack once and writes the 512 px maps; needs ImageMagick 7. */
async function main(): Promise<void> {
  const manifest = textureManifestSchema.parse(
    JSON.parse(readFileSync(join(PACKAGE_DIR, 'textures.json'), 'utf8')),
  );
  mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const texture of manifest.textures) {
    const output = join(OUTPUT_DIR, `${texture.key}.jpg`);
    execFileSync(
      'magick',
      textureArgs({ input: await sourceMap(texture), output, kind: texture.kind }),
    );
    process.stdout.write(`${texture.key}\t${String(statSync(output).size)} B\n`);
  }
}

await main();
