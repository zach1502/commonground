import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NodeIO } from '@gltf-transform/core';
import { zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CC0 } from './manifest-schema.js';
import { measureBounds } from './pipeline.js';
import { documentFromParts } from './procedural.js';
import { cacheFileName, cachedDownload, httpFetcher, loadSourceDocument } from './sources.js';

const ZIP_URL = 'https://example.test/assets/kit.zip';
const GLB_URL = 'https://static.example.test/abc-123.glb';

let cacheDir = '';
let requests: string[] = [];

async function boxGlb(widthM: number): Promise<Uint8Array> {
  const document = documentFromParts('box', [
    { shape: 'box', widthM, depthM: 1, heightM: 1, x: 0, baseY: 0, z: 0, colour: 'wood' },
  ]);
  return new NodeIO().writeBinary(document);
}

function fakeFetcher(files: Record<string, Uint8Array>) {
  return (url: string): Promise<Uint8Array> => {
    requests.push(url);
    const body = files[url];
    return body === undefined ? Promise.reject(new Error(`404 ${url}`)) : Promise.resolve(body);
  };
}

function model(file: string, url: string) {
  return {
    modelKey: 'bench',
    category: 'seating',
    source: { name: 'Kenney', url, author: 'Kenney', licence: CC0 },
    file,
    yawDeg: 0,
  } as const;
}

beforeEach(() => {
  cacheDir = mkdtempSync(join(tmpdir(), 'asset-sources-'));
  requests = [];
});

afterEach(() => {
  rmSync(cacheDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe('httpFetcher', () => {
  it('returns the response body', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(new Uint8Array([7, 8]))));
    expect(await httpFetcher(GLB_URL)).toEqual(new Uint8Array([7, 8]));
  });

  it('fails with the status when the server refuses', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('blocked', { status: 403 })));
    await expect(httpFetcher(GLB_URL)).rejects.toThrow(/403/);
  });
});

describe('cacheFileName', () => {
  it('keeps the last path segment and drops anything unsafe', () => {
    expect(cacheFileName('https://kenney.nl/media/kenney_nature-kit.zip?x=1')).toBe(
      'kenney_nature-kit.zip',
    );
    expect(cacheFileName('https://example.test/')).toBe('example.test');
  });

  it('names the furniture kit and the gazebo as their cached copies', () => {
    expect(
      cacheFileName(
        'https://kenney.nl/media/pages/assets/furniture-kit/440e0608a4-1677580847/kenney_furniture-kit.zip',
      ),
    ).toBe('kenney_furniture-kit.zip');
    expect(
      cacheFileName('https://static.poly.pizza/a0c33317-3662-478e-b826-78590c348d83.glb'),
    ).toBe('a0c33317-3662-478e-b826-78590c348d83.glb');
  });
});

describe('cachedDownload', () => {
  it('downloads once and serves the cached copy after that', async () => {
    const fetcher = fakeFetcher({ [ZIP_URL]: new Uint8Array([1, 2, 3]) });
    const first = await cachedDownload(ZIP_URL, { cacheDir, fetcher });
    const second = await cachedDownload(ZIP_URL, { cacheDir, fetcher });
    expect(first).toBe(second);
    expect([...readFileSync(first)]).toEqual([1, 2, 3]);
    expect(requests).toEqual([ZIP_URL]);
  });
});

describe('loadSourceDocument', () => {
  it('reads a model from inside a cached zip', async () => {
    const zip = zipSync({ 'Models/GLB format/bench.glb': await boxGlb(2) });
    const fetcher = fakeFetcher({ [ZIP_URL]: zip });
    const document = await loadSourceDocument(model('Models/GLB format/bench.glb', ZIP_URL), {
      cacheDir,
      fetcher,
      io: new NodeIO(),
    });
    expect(measureBounds(document).dims.widthM).toBe(2);
    expect(existsSync(join(cacheDir, 'kit'))).toBe(true);
  });

  it('reads a model from a direct GLB link', async () => {
    const fetcher = fakeFetcher({ [GLB_URL]: await boxGlb(3) });
    const document = await loadSourceDocument(model(GLB_URL, 'https://poly.test/m/abc'), {
      cacheDir,
      fetcher,
      io: new NodeIO(),
    });
    expect(measureBounds(document).dims.widthM).toBe(3);
  });

  it('skips folder entries and paths that climb out of the archive folder', async () => {
    const zip = zipSync({
      'Models/': new Uint8Array(),
      '../escape.txt': new Uint8Array([1]),
      'Models/box.glb': await boxGlb(2),
    });
    const loader = { cacheDir, fetcher: fakeFetcher({ [ZIP_URL]: zip }), io: new NodeIO() };
    await loadSourceDocument(model('Models/box.glb', ZIP_URL), loader);
    expect(existsSync(join(cacheDir, 'escape.txt'))).toBe(false);
    // A second model from the same archive reuses the folder extracted by the first.
    const again = await loadSourceDocument(model('Models/box.glb', ZIP_URL), loader);
    expect(measureBounds(again).dims.widthM).toBeCloseTo(2);
  });

  it('fails when the archive has no such file', async () => {
    const fetcher = fakeFetcher({ [ZIP_URL]: zipSync({ 'other.txt': new Uint8Array([1]) }) });
    await expect(
      loadSourceDocument(model('Models/missing.glb', ZIP_URL), {
        cacheDir,
        fetcher,
        io: new NodeIO(),
      }),
    ).rejects.toThrow(/missing\.glb/);
  });
});
