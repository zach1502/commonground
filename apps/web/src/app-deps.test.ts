import { describe, expect, it } from 'vitest';

import { createWebDeps, mapTilesFor } from './app-deps';

describe('createWebDeps', () => {
  it('builds the API and a self-report store over the given storage', async () => {
    const deps = createWebDeps(
      {
        VITE_API_URL: 'http://api.test',
        VITE_POLL_INTERVAL_MS: 5000,
        VITE_EDITOR_TEST_HOOK: 'off',
        VITE_FEATURE_TERRAFORM: true,
        VITE_FEATURE_DESCRIBE_IT: true,
        VITE_MAP_TILES: 'osm-raster',
      },
      { local: window.localStorage, session: window.sessionStorage },
    );
    expect(await deps.api.getMe()).toBeNull();
    deps.selfReports.save('u9', { kind: 'skipped' });
    expect(window.localStorage.getItem('parkshape.self-report.u9')).not.toBeNull();
    window.localStorage.clear();
  });

  it('hands the editor both storages, a random seed and the test hook setting', () => {
    const deps = createWebDeps(
      {
        VITE_API_URL: 'http://api.test',
        VITE_POLL_INTERVAL_MS: 5000,
        VITE_EDITOR_TEST_HOOK: 'on',
        VITE_FEATURE_TERRAFORM: true,
        VITE_FEATURE_DESCRIBE_IT: true,
        VITE_MAP_TILES: 'osm-raster',
      },
      { local: window.localStorage, session: window.sessionStorage },
    );
    expect(deps.editor.storage.session).toBe(window.sessionStorage);
    expect(deps.editor.testHook).toBe('on');
    expect(deps.editor.terraform).toBe('on');
    expect(deps.describeIt).toBe('on');
    expect(Number.isInteger(deps.editor.randomSeed)).toBe(true);
  });
});

describe('mapTilesFor', () => {
  it('picks OpenStreetMap tiles by default and a plain fill for tests', () => {
    expect(mapTilesFor('osm-raster').name).toBe('osm-raster');
    expect(mapTilesFor('static').styleOrTiles()).toMatchObject({ kind: 'solid' });
  });
});
