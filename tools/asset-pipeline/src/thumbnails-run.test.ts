import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  parseThumbnailArgs,
  runThumbnails,
  settingsHashOf,
  type ThumbnailPaths,
  type ThumbnailRenderer,
} from './thumbnails-run.js';
import { hashOf, thumbnailFile, thumbnailManifestSchema } from './thumbnails.js';

const ITEMS = [
  { id: 'bench', modelKey: 'bench' },
  { id: 'douglas-fir', modelKey: 'tree-douglas-fir' },
];
const MODELS = {
  note: 'n',
  models: [
    { modelKey: 'bench', file: 'models/bench.glb' },
    { modelKey: 'tree-douglas-fir', file: 'models/tree-douglas-fir.glb' },
  ],
};

let root = '';
let paths: ThumbnailPaths;

/** A renderer that records each call and returns the model key as the picture bytes. */
function fakeRenderer(settings: unknown = { side: 256 }) {
  const calls: string[] = [];
  const renderer: ThumbnailRenderer = {
    settings: () => Promise.resolve(settings),
    render: (modelKey, url) => {
      calls.push(`${modelKey} ${url}`);
      return Promise.resolve(Buffer.from(modelKey));
    },
  };
  return { renderer, calls };
}

function writeModel(file: string, content: string): void {
  writeFileSync(join(paths.publicDir, file), content);
}

const readManifest = () =>
  thumbnailManifestSchema.parse(JSON.parse(readFileSync(paths.manifest, 'utf8')));
const quiet = { items: ITEMS, log: () => undefined };

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'thumbs-'));
  paths = {
    publicDir: `${root}/public/`,
    manifest: join(root, 'thumbnails.manifest.json'),
    modelsManifest: join(root, 'models.manifest.json'),
  };
  mkdirSync(join(paths.publicDir, 'models'), { recursive: true });
  writeFileSync(paths.modelsManifest, JSON.stringify(MODELS));
  writeModel('models/bench.glb', 'bench-v1');
  writeModel('models/tree-douglas-fir.glb', 'fir-v1');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('parseThumbnailArgs', () => {
  it('redraws only changed pictures with no flags', () => {
    expect(parseThumbnailArgs([])).toEqual({ redraw: 'changed' });
  });

  it('redraws every picture with --force', () => {
    expect(parseThumbnailArgs(['--force'])).toEqual({ redraw: 'all' });
  });

  it('rejects an unknown flag', () => {
    expect(() => parseThumbnailArgs(['--fast'])).toThrow('Unknown flag --fast');
  });
});

describe('settingsHashOf', () => {
  it('gives the sha256 of the settings JSON', () => {
    expect(settingsHashOf({ a: 1 })).toBe(hashOf('{"a":1}'));
  });

  it('changes when a setting changes', () => {
    expect(settingsHashOf({ a: 1 })).not.toBe(settingsHashOf({ a: 2 }));
  });
});

describe('runThumbnails', () => {
  it('draws every item on the first run and writes the pictures and the manifest', async () => {
    const { renderer, calls } = fakeRenderer();
    const summary = await runThumbnails(paths, { redraw: 'changed' }, { ...quiet, renderer });
    expect(calls).toEqual([
      'bench /models/bench.glb',
      'tree-douglas-fir /models/tree-douglas-fir.glb',
    ]);
    expect(summary).toEqual({ drawn: 2, unchanged: 0 });
    expect(readFileSync(join(paths.publicDir, thumbnailFile('bench')), 'utf8')).toBe('bench');
    const manifest = readManifest();
    expect(manifest.settingsHash).toBe(settingsHashOf({ side: 256 }));
    expect(
      manifest.thumbnails.map((entry) => [entry.itemId, entry.modelHash, entry.bytes]),
    ).toEqual([
      ['bench', hashOf('bench-v1'), 'bench'.length],
      ['douglas-fir', hashOf('fir-v1'), 'tree-douglas-fir'.length],
    ]);
  });

  it('draws nothing on a second run with the same models and settings', async () => {
    await runThumbnails(
      paths,
      { redraw: 'changed' },
      { ...quiet, renderer: fakeRenderer().renderer },
    );
    const again = fakeRenderer();
    const summary = await runThumbnails(
      paths,
      { redraw: 'changed' },
      { ...quiet, renderer: again.renderer },
    );
    expect(again.calls).toEqual([]);
    expect(summary).toEqual({ drawn: 0, unchanged: 2 });
    expect(readManifest().thumbnails).toHaveLength(2);
  });

  it('draws only the item whose model changed and keeps the other entry', async () => {
    await runThumbnails(
      paths,
      { redraw: 'changed' },
      { ...quiet, renderer: fakeRenderer().renderer },
    );
    writeModel('models/bench.glb', 'bench-v2');
    const again = fakeRenderer();
    await runThumbnails(paths, { redraw: 'changed' }, { ...quiet, renderer: again.renderer });
    expect(again.calls).toEqual(['bench /models/bench.glb']);
    expect(readManifest().thumbnails.map((entry) => entry.modelHash)).toEqual([
      hashOf('bench-v2'),
      hashOf('fir-v1'),
    ]);
  });
});

describe('runThumbnails redraws', () => {
  it('draws every item when the settings change', async () => {
    await runThumbnails(
      paths,
      { redraw: 'changed' },
      { ...quiet, renderer: fakeRenderer().renderer },
    );
    const again = fakeRenderer({ side: 128 });
    await runThumbnails(paths, { redraw: 'changed' }, { ...quiet, renderer: again.renderer });
    expect(again.calls).toHaveLength(2);
  });

  it('draws every item with redraw all, even when nothing changed', async () => {
    await runThumbnails(
      paths,
      { redraw: 'changed' },
      { ...quiet, renderer: fakeRenderer().renderer },
    );
    const again = fakeRenderer();
    await runThumbnails(paths, { redraw: 'all' }, { ...quiet, renderer: again.renderer });
    expect(again.calls).toHaveLength(2);
  });

  it('treats an unreadable manifest as missing and draws every item', async () => {
    writeFileSync(paths.manifest, JSON.stringify({ note: 'old shape' }));
    const { renderer, calls } = fakeRenderer();
    await runThumbnails(paths, { redraw: 'changed' }, { ...quiet, renderer });
    expect(calls).toHaveLength(2);
  });
});

describe('runThumbnails reports', () => {
  it('logs one line per picture and a summary', async () => {
    const lines: string[] = [];
    await runThumbnails(
      paths,
      { redraw: 'changed' },
      { items: ITEMS, renderer: fakeRenderer().renderer, log: (line) => lines.push(line) },
    );
    expect(lines).toEqual(['bench\t5 B', 'douglas-fir\t16 B', '2 drawn, 0 unchanged']);
  });

  it('fails before drawing when a catalog item has no processed model', async () => {
    const { renderer, calls } = fakeRenderer();
    const items = [...ITEMS, { id: 'gazebo', modelKey: 'gazebo' }];
    await expect(
      runThumbnails(paths, { redraw: 'changed' }, { items, renderer, log: () => undefined }),
    ).rejects.toThrow('No processed model gazebo');
    expect(calls).toEqual([]);
    expect(existsSync(paths.manifest)).toBe(false);
  });
});
