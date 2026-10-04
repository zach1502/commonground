import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

import type { Document, NodeIO } from '@gltf-transform/core';
import { unzipSync } from 'fflate';

import type { SourceModel } from './manifest-schema.js';

export type Fetcher = (url: string) => Promise<Uint8Array>;

export interface SourceCache {
  readonly cacheDir: string;
  readonly fetcher: Fetcher;
}

export interface SourceLoader extends SourceCache {
  readonly io: NodeIO;
}

const UNSAFE_NAME_CHARACTERS = /[^A-Za-z0-9._-]/g;
const ARCHIVE_EXTENSION = /\.zip$/i;

/** A file name for the cache from the last segment of a URL path. */
export function cacheFileName(url: string): string {
  const { hostname, pathname } = new URL(url);
  const last =
    pathname
      .split('/')
      .filter((segment) => segment !== '')
      .pop() ?? hostname;
  return last.replace(UNSAFE_NAME_CHARACTERS, '_');
}

/** Fetches a URL into the cache directory unless an earlier run already did. */
export async function cachedDownload(url: string, cache: SourceCache): Promise<string> {
  const path = join(cache.cacheDir, cacheFileName(url));
  if (!existsSync(path)) {
    const body = await cache.fetcher(url);
    mkdirSync(cache.cacheDir, { recursive: true });
    writeFileSync(path, body);
  }
  return path;
}

/** Real network access for the CLI; tests pass a fake. */
export const httpFetcher: Fetcher = async (url) => {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`GET ${url} returned ${String(response.status)}`);
  }
  return new Uint8Array(await response.arrayBuffer());
};

function extractArchive(zipPath: string, destination: string): void {
  if (existsSync(destination)) {
    return;
  }
  const root = resolve(destination);
  Object.entries(unzipSync(readFileSync(zipPath))).forEach(([name, bytes]) => {
    const target = resolve(root, name);
    // Skips directory entries and any path that would land outside the archive folder.
    if (name.endsWith('/') || !target.startsWith(root + sep)) {
      return;
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  });
}

function isDirectLink(file: string): boolean {
  return file.startsWith('https://');
}

/** Downloads, caches and reads the source model named in the manifest. */
export async function loadSourceDocument(
  model: SourceModel,
  loader: SourceLoader,
): Promise<Document> {
  if (isDirectLink(model.file)) {
    return loader.io.read(await cachedDownload(model.file, loader));
  }
  const zipPath = await cachedDownload(model.source.url, loader);
  const folder = zipPath.replace(ARCHIVE_EXTENSION, '');
  extractArchive(zipPath, folder);
  const path = join(folder, model.file);
  if (!existsSync(path)) {
    throw new Error(`${model.file} is not in ${model.source.url}`);
  }
  return loader.io.read(path);
}
