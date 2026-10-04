import type { Clock } from '@parkshape/core';

import { ChainProvider } from './adapters/chain/chain-provider.js';
import { HrdemCogProvider, MrdemProvider } from './adapters/cog/cog-terrain-providers.js';
import type { FixtureDir } from './adapters/static/fixture-files.js';
import { StaticHeightmapProvider } from './adapters/static/static-heightmap-provider.js';
import { StaticSiteContextProvider } from './adapters/static/static-site-context-provider.js';
import { StaticSiteFeaturesProvider } from './adapters/static/static-site-features-provider.js';
import { VancouverContextProvider } from './adapters/vancouver/vancouver-context-provider.js';
import { VancouverOpenDataProvider } from './adapters/vancouver/vancouver-open-data-provider.js';
import type { CacheStore } from './ports/cache-store.js';
import type { HttpFetch } from './ports/http.js';
import type { SiteContextProvider } from './ports/site-context-provider.js';
import type { SiteFeaturesProvider } from './ports/site-features-provider.js';
import type { TerrainProvider } from './ports/terrain-provider.js';

/** Adapter names. AppConfig's TERRAIN_PROVIDER is a subset; tools may also ask for mrdem. */
export type TerrainProviderName = 'static' | 'hrdem' | 'mrdem' | 'chain';
export type SiteFeaturesProviderName = 'static' | 'vancouver';
export type SiteContextProviderName = 'static' | 'vancouver';

export interface ProviderDeps {
  readonly fetch: HttpFetch;
  readonly cache?: CacheStore;
  readonly fixtureDir?: FixtureDir;
}

function staticOptions(deps: ProviderDeps) {
  return deps.fixtureDir === undefined ? {} : { fixtureDir: deps.fixtureDir };
}

/**
 * Picks the terrain adapter named in config. packages/config may not import this package, so
 * apps/api calls this when it fills the container's terrain slot.
 */
export function createTerrainProvider(
  config: { readonly TERRAIN_PROVIDER: TerrainProviderName },
  deps: ProviderDeps,
): TerrainProvider {
  const cogOptions = {
    fetch: deps.fetch,
    ...(deps.cache === undefined ? {} : { cache: deps.cache }),
  };
  switch (config.TERRAIN_PROVIDER) {
    case 'static':
      return new StaticHeightmapProvider(staticOptions(deps));
    case 'hrdem':
      return new HrdemCogProvider(cogOptions);
    case 'mrdem':
      return new MrdemProvider(cogOptions);
    case 'chain':
      return new ChainProvider([
        new HrdemCogProvider(cogOptions),
        new MrdemProvider(cogOptions),
        new StaticHeightmapProvider(staticOptions(deps)),
      ]);
  }
}

/** Picks the site features adapter named in config. See createTerrainProvider for why it lives here. */
export function createSiteFeaturesProvider(
  config: { readonly SITE_FEATURES_PROVIDER: SiteFeaturesProviderName },
  deps: ProviderDeps,
): SiteFeaturesProvider {
  switch (config.SITE_FEATURES_PROVIDER) {
    case 'static':
      return new StaticSiteFeaturesProvider(staticOptions(deps));
    case 'vancouver':
      return new VancouverOpenDataProvider({ fetch: deps.fetch });
  }
}

/** ProviderDeps plus the clock that stamps recordedAt on a live context. */
export interface SiteContextProviderDeps extends ProviderDeps {
  readonly clock: Clock;
}

/** Picks the site context adapter named in config. See createTerrainProvider for why it lives here. */
export function createSiteContextProvider(
  config: { readonly SITE_CONTEXT_PROVIDER: SiteContextProviderName },
  deps: SiteContextProviderDeps,
): SiteContextProvider {
  switch (config.SITE_CONTEXT_PROVIDER) {
    case 'static':
      return new StaticSiteContextProvider(staticOptions(deps));
    case 'vancouver':
      return new VancouverContextProvider({ fetch: deps.fetch, clock: deps.clock });
  }
}
