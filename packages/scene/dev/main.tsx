import '@bcgov/bc-sans/css/BC_Sans.css';
import '@bcgov/design-tokens/css/variables.css';
import './dev.css';

import { StrictMode, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';

import { assetManifestFromModels, ParkViewer } from '../src/index.js';
import type {
  AssetManifest,
  ContextLayerInput,
  ParkDocument,
  SceneInspector,
  ViewerStrings,
} from '../src/index.js';
import type { OfflineFrame } from '../src/thumbnail-entry.js';

import { contextFrom, loadDevContext } from './context-source.js';
import { loadDevScene, parkFrom, tierFrom } from './park-source.js';
import type { DevPark, DevScene, DevTier } from './park-source.js';
import { offlineImage, thumbnailFacts, thumbnailPixels } from './thumbnail-probe.js';
import { devWalk } from './walk-probe.js';

type ThumbnailPixels = () => Promise<number[]>;
type ThumbnailFacts = () => Promise<{ type: string; meanLuminance: number }>;
type DevAction = () => void;
type RenderOffline = (frame: OfflineFrame) => Promise<string>;

declare global {
  interface Window {
    __parkshapeFrameTimes: number[];
    __parkshapeReady: boolean;
    __parkshapeTier: string;
    __parkshapeThumbnailPixels: ThumbnailPixels;
    __parkshapeThumbnailFacts: ThumbnailFacts;
    /** The dev scene as one offline still, base64; render-hero calls it with 'hero'. */
    __parkshapeRenderOffline: RenderOffline;
    __parkshapeInspect: SceneInspector;
    /** Moves the first item 1 m east, as an edit would. */
    __parkshapeNudge: DevAction;
  }
}

// Apps pass these from their locale files; the dev page writes them out.
const strings: Readonly<Record<DevPark, ViewerStrings>> = {
  ramp: {
    canvasLabel: '3D view of a sample park on a sloped site',
    viewControls: 'View',
    resetView: 'Reset view',
    topDown: 'Top-down',
    birdsEye: "Bird's eye",
    compareWithToday: 'Compare with today',
    loadingMessage: 'Loading terrain from a sample ramp',
  },
  baseline: {
    canvasLabel: '3D view of Jonathan Rogers Park as it is today',
    viewControls: 'View',
    resetView: 'Reset view',
    topDown: 'Top-down',
    birdsEye: "Bird's eye",
    compareWithToday: 'Compare with today',
    loadingMessage: 'Loading the recorded terrain for Jonathan Rogers Park',
  },
  seed: {
    canvasLabel: '3D view of a seeded design for Jonathan Rogers Park',
    viewControls: 'View',
    resetView: 'Reset view',
    topDown: 'Top-down',
    birdsEye: "Bird's eye",
    compareWithToday: 'Compare with today',
    loadingMessage: 'Loading the recorded terrain for Jonathan Rogers Park',
  },
};

window.__parkshapeFrameTimes = [];
window.__parkshapeReady = false;
window.__parkshapeTier = 'unknown';

// Written by the asset pipeline next to the GLBs; without it the viewer draws placeholders.
const MODEL_INDEX_URL = '/models/index.json';

async function loadManifest(): Promise<AssetManifest> {
  try {
    const response = await fetch(MODEL_INDEX_URL);
    return response.ok ? assetManifestFromModels(await response.json(), '/') : {};
  } catch {
    return {};
  }
}

interface DevPage {
  readonly park: DevPark;
  readonly tier: DevTier | undefined;
  readonly scene: DevScene;
  readonly manifest: AssetManifest;
  readonly context: ContextLayerInput | undefined;
}

function nudged(document: ParkDocument): ParkDocument {
  const [first, ...rest] = document.items;
  if (first === undefined) return document;
  const position = { ...first.position, x: first.position.x + 1 };
  return { ...document, items: [{ ...first, position }, ...rest] };
}

function DevViewer({ page }: { readonly page: DevPage }): ReactElement {
  const [parkDocument, setParkDocument] = useState(page.scene.document);
  const walk = useMemo(() => devWalk(page.scene), [page.scene]);
  useEffect(() => {
    window.__parkshapeNudge = () => {
      setParkDocument(nudged);
    };
    const input = { ...page.scene, strings: strings[page.park], manifest: page.manifest };
    window.__parkshapeThumbnailPixels = () => thumbnailPixels(input);
    window.__parkshapeThumbnailFacts = () => thumbnailFacts(input);
    window.__parkshapeRenderOffline = (frame) => offlineImage(input, frame);
  }, [page]);
  return (
    <ParkViewer
      heightmap={page.scene.heightmap}
      document={parkDocument}
      catalog={page.scene.catalog}
      mode="compare"
      strings={strings[page.park]}
      manifest={page.manifest}
      walk={walk}
      context={page.context}
      {...(page.tier === undefined ? {} : { tier: page.tier })}
      onInspect={(inspect) => {
        window.__parkshapeInspect = inspect;
      }}
      onRenderTier={(tier) => {
        window.__parkshapeTier = tier;
      }}
      onReady={() => {
        window.__parkshapeReady = true;
      }}
      onFrameTime={(frameMs) => {
        window.__parkshapeFrameTimes.push(frameMs);
      }}
    />
  );
}

function render(page: DevPage): void {
  const root = document.getElementById('root');
  if (root === null) {
    return;
  }
  createRoot(root).render(
    <StrictMode>
      <DevViewer page={page} />
    </StrictMode>,
  );
}

async function start(): Promise<void> {
  const search = new URLSearchParams(window.location.search);
  const park = parkFrom(search);
  const [scene, manifest, context] = await Promise.all([
    loadDevScene(park),
    loadManifest(),
    loadDevContext(contextFrom(search)),
  ]);
  render({ park, tier: tierFrom(search), scene, manifest, context });
}

void start();
