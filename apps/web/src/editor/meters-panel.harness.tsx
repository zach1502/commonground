import { render } from '@testing-library/react';

import {
  catalogIndex,
  createSeededRandom,
  defaultParameters,
  designDocumentSchema,
  makeFlatHeightmap,
  parcelSchema,
  projectParametersSchema,
  type DesignDocument,
  type ProjectParameters,
} from '@parkshape/core';
import {
  createEditorContext,
  createEditorStore,
  createMetricsClient,
  type MetricsClient,
} from '@parkshape/scene/editor';

import { messages } from '../messages';

import { MetersPanel, type MetersPanelStrings } from './meters-panel';
import { useLiveMetrics } from './use-live-metrics';

const SIDE = 40;
export const strings = messages.editor.meters as MetersPanelStrings;

const PATH_A = 5;
const PATH_B = 20;
const GRID_MARGIN = 6;
const GRID_COLS = 8;
const GRID_STEP = 4;
const LOT_MIN = 6;
const LOT_MAX = 32;

export function rect(minX: number, minY: number, maxX: number, maxY: number) {
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

const point = (x: number, y: number) => ({ x, y });

const parcel = parcelSchema.parse({
  id: 'test-parcel',
  name: 'Test parcel',
  polygon: rect(0, 0, SIDE, SIDE),
  origin: { lat: 49.2636, lon: -123.0995 },
});

export function documentOf(parts: {
  items?: readonly unknown[];
  areas?: readonly unknown[];
  paths?: readonly unknown[];
  zones?: readonly unknown[];
}): DesignDocument {
  return designDocumentSchema.parse({
    version: 1,
    items: parts.items ?? [],
    paths: parts.paths ?? [],
    areas: parts.areas ?? [],
    gradeDelta: { cells: [] },
    zones: parts.zones ?? [],
  });
}

export const emptyDoc = documentOf({});

export const withPath = documentOf({
  paths: [
    {
      id: 'p',
      surface: 'gravel',
      widthM: 2,
      points: [point(PATH_A, PATH_A), point(PATH_B, PATH_A)],
    },
  ],
});

export const withLockedTree = documentOf({
  items: [
    { id: 'oak', catalogId: 'garry-oak', position: { x: 30, y: 30 }, rotationDeg: 0, locked: true },
  ],
});

export const fortyTrees = documentOf({
  items: Array.from({ length: 40 }, (_, index) => ({
    id: `tree-${String(index)}`,
    catalogId: 'bigleaf-maple',
    position: {
      x: GRID_MARGIN + (index % GRID_COLS) * GRID_STEP,
      y: GRID_MARGIN + Math.floor(index / GRID_COLS) * GRID_STEP,
    },
    rotationDeg: 0,
    locked: false,
  })),
});

export const parkingLot = documentOf({
  areas: [
    {
      id: 'lot-1',
      catalogId: 'parking-lot-small',
      polygon: rect(LOT_MIN, LOT_MIN, LOT_MAX, LOT_MAX),
      locked: false,
    },
  ],
});

export function paramsWith(patch: Partial<Record<string, 'hard' | 'soft'>>): ProjectParameters {
  const base = defaultParameters();
  return projectParametersSchema.parse({ ...base, severity: { ...base.severity, ...patch } });
}

export function makeContext(document: DesignDocument) {
  return createEditorContext({
    store: createEditorStore({ document }),
    catalog: catalogIndex,
    random: createSeededRandom(1),
    heightmap: makeFlatHeightmap({ width: SIDE, height: SIDE }),
    zones: [],
  });
}

export function immediateClient(): MetricsClient {
  return createMetricsClient({
    debounceMs: 0,
    createWorker: () => null,
    schedule: (task) => {
      task();
      return 0;
    },
    cancel: () => undefined,
  });
}

export interface HarnessProps {
  readonly ctx: ReturnType<typeof makeContext>;
  readonly parameters: ProjectParameters;
  readonly client: MetricsClient;
  readonly onShowMe?: (key: string) => void;
  readonly baseline?: DesignDocument;
}

export function Harness({ ctx, parameters, client, onShowMe, baseline }: HarnessProps) {
  const report = useLiveMetrics({ ctx, parcel, parameters, client, baseline });
  return (
    <MetersPanel
      report={report}
      strings={strings}
      onShowMe={(key) => onShowMe?.(key)}
      canShow={() => true}
    />
  );
}

export function renderDoc(document: DesignDocument) {
  render(
    <Harness
      ctx={makeContext(document)}
      parameters={defaultParameters()}
      client={immediateClient()}
    />,
  );
}
