import { createApiClient } from '@parkshape/api-client';
import type { BrowserConfig } from '@parkshape/config/browser';
import { SystemClock, type Clock } from '@parkshape/core';
import { OsmRasterTileSource, StaticTileSource, type MapTileSource } from '@parkshape/ui';

import { createWebApi, type WebApi } from './api/web-api';
import type { EditorStorage } from './editor/editor-session';
import {
  createReviewApi,
  type PlannerReviewApi,
  type ReviewApi,
} from './features/review/review-api';
import { messages } from './messages';
import { createBrowserSelfReportStore, type SelfReportStore } from './session/self-report';

/** What the routes need from outside React; tests pass fakes. */
export interface EditorDeps {
  readonly storage: EditorStorage;
  /** Seeds the random source for tree size and turn and for new element ids. */
  readonly randomSeed: number;
  /** 'on' only in test builds; exposes the editor state on window for Playwright. */
  readonly testHook: 'on' | 'off';
  /** Whether the terraforming tools show in the editor. */
  readonly terraform: 'on' | 'off';
}

export interface WebDeps {
  readonly api: WebApi;
  /** Element comments for review mode. */
  readonly review: ReviewApi;
  /** A planner's resolve, reply and hide, and the element feedback counts. */
  readonly feedback: PlannerReviewApi;
  readonly selfReports: SelfReportStore;
  readonly editor: EditorDeps;
  /** Where the API lives, for links the browser follows itself, such as export downloads. */
  readonly apiBaseUrl: string;
  /** Milliseconds between polls of live data such as the leaderboard. */
  readonly pollIntervalMs: number;
  /** The basemap behind the planner's parcel map. */
  readonly mapTiles: MapTileSource;
  /** Whether residents can start a design from a description. */
  readonly describeIt: 'on' | 'off';
  /** Stamps the "Votes counted to" time on pages with vote counts. */
  readonly clock: Clock;
}

/** The one place the web app picks a map tile adapter, from VITE_MAP_TILES. */
export function mapTilesFor(choice: BrowserConfig['VITE_MAP_TILES']): MapTileSource {
  const strings = messages.planner.site;
  return choice === 'static'
    ? new StaticTileSource({
        colour: '--domain-terrain-meadow',
        attribution: strings.staticAttribution,
      })
    : new OsmRasterTileSource({ attribution: strings.osmAttribution });
}

export function createWebDeps(config: BrowserConfig, storage: EditorStorage): WebDeps {
  const client = createApiClient({ baseUrl: config.VITE_API_URL });
  const comments = createReviewApi(client);
  return {
    api: createWebApi(client),
    review: comments,
    feedback: comments,
    apiBaseUrl: config.VITE_API_URL,
    selfReports: createBrowserSelfReportStore(storage.local),
    pollIntervalMs: config.VITE_POLL_INTERVAL_MS,
    mapTiles: mapTilesFor(config.VITE_MAP_TILES),
    describeIt: config.VITE_FEATURE_DESCRIBE_IT ? 'on' : 'off',
    clock: new SystemClock(),
    editor: {
      storage,
      // The composition root is the one place that picks a seed; everything else takes Random.
      randomSeed: Date.now(),
      testHook: config.VITE_EDITOR_TEST_HOOK,
      terraform: config.VITE_FEATURE_TERRAFORM ? 'on' : 'off',
    },
  };
}
