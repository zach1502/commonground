import {
  polygonSchema,
  polylineSchema,
  type DesignArea,
  type DesignDocument,
  type DesignItem,
  type DesignPath,
  type LocalPoint,
} from '@parkshape/core';

import type { SingleCommandSpec } from './command-schema.js';
import { mergeGradeDelta, subtractGradeDelta } from './terraform/grade-delta.js';

type Doc = DesignDocument;
type SpecMap = { [S in SingleCommandSpec as S['kind']]: S };
type Kind = keyof SpecMap;
interface Handler<K extends Kind> {
  apply(doc: Doc, spec: SpecMap[K]): Doc;
  revert(doc: Doc, spec: SpecMap[K]): Doc;
}
type Handlers = { readonly [K in Kind]: Handler<K> };

interface Identified {
  readonly id: string;
}

function mapById<T extends Identified>(list: readonly T[], id: string, change: (value: T) => T) {
  return list.map((value) => (value.id === id ? change(value) : value));
}

function removeById<T extends Identified>(list: readonly T[], id: string): T[] {
  return list.filter((value) => value.id !== id);
}

function insertAt<T>(list: readonly T[], index: number, value: T): T[] {
  return [...list.slice(0, index), value, ...list.slice(index)];
}

function replaceAt<T>(list: readonly T[], index: number, value: T): T[] {
  return list.map((current, position) => (position === index ? value : current));
}

function withoutIndex<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, position) => position !== index);
}

const moveTo = (to: LocalPoint) => (item: DesignItem) => ({ ...item, position: to });
const turnTo = (to: number) => (item: DesignItem) => ({ ...item, rotationDeg: to });
/**
 * An edited path or area is the resident's change, so it loses the existing flag and meets the
 * slope rules again. Undo restores the shape but not the flag, which only makes the check stricter.
 */
function edited<T extends { existing?: boolean | undefined }>(element: T): T {
  const copy = { ...element };
  delete copy.existing;
  return copy;
}
const pathPoints =
  (change: (points: readonly LocalPoint[]) => LocalPoint[]) => (path: DesignPath) =>
    ({ ...edited(path), points: polylineSchema.parse(change(path.points)) }) satisfies DesignPath;
const areaOutline =
  (change: (points: readonly LocalPoint[]) => LocalPoint[]) => (area: DesignArea) =>
    ({ ...edited(area), polygon: polygonSchema.parse(change(area.polygon)) }) satisfies DesignArea;

const itemHandlers = {
  'add-item': {
    apply: (doc, { item }) => ({ ...doc, items: [...doc.items, item] }),
    revert: (doc, { item }) => ({ ...doc, items: removeById(doc.items, item.id) }),
  },
  'delete-item': {
    apply: (doc, { item }) => ({ ...doc, items: removeById(doc.items, item.id) }),
    revert: (doc, { item, index }) => ({ ...doc, items: insertAt(doc.items, index, item) }),
  },
  'move-item': {
    apply: (doc, { id, to }) => ({ ...doc, items: mapById(doc.items, id, moveTo(to)) }),
    revert: (doc, { id, from }) => ({ ...doc, items: mapById(doc.items, id, moveTo(from)) }),
  },
  'rotate-item': {
    apply: (doc, { id, to }) => ({ ...doc, items: mapById(doc.items, id, turnTo(to)) }),
    revert: (doc, { id, from }) => ({ ...doc, items: mapById(doc.items, id, turnTo(from)) }),
  },
} satisfies Pick<Handlers, 'add-item' | 'delete-item' | 'move-item' | 'rotate-item'>;

const pathHandlers = {
  'add-path': {
    apply: (doc, { path }) => ({ ...doc, paths: [...doc.paths, path] }),
    revert: (doc, { path }) => ({ ...doc, paths: removeById(doc.paths, path.id) }),
  },
  'delete-path': {
    apply: (doc, { path }) => ({ ...doc, paths: removeById(doc.paths, path.id) }),
    revert: (doc, { path, index }) => ({ ...doc, paths: insertAt(doc.paths, index, path) }),
  },
  'move-path-vertex': {
    apply: (doc, { id, index, to }) => ({
      ...doc,
      paths: mapById(
        doc.paths,
        id,
        pathPoints((points) => replaceAt(points, index, to)),
      ),
    }),
    revert: (doc, { id, index, from }) => ({
      ...doc,
      paths: mapById(
        doc.paths,
        id,
        pathPoints((points) => replaceAt(points, index, from)),
      ),
    }),
  },
  'insert-path-vertex': {
    apply: (doc, { id, index, point }) => ({
      ...doc,
      paths: mapById(
        doc.paths,
        id,
        pathPoints((points) => insertAt(points, index, point)),
      ),
    }),
    revert: (doc, { id, index }) => ({
      ...doc,
      paths: mapById(
        doc.paths,
        id,
        pathPoints((points) => withoutIndex(points, index)),
      ),
    }),
  },
} satisfies Pick<Handlers, 'add-path' | 'delete-path' | 'move-path-vertex' | 'insert-path-vertex'>;

const areaHandlers = {
  'add-area': {
    apply: (doc, { area }) => ({ ...doc, areas: [...doc.areas, area] }),
    revert: (doc, { area }) => ({ ...doc, areas: removeById(doc.areas, area.id) }),
  },
  'delete-area': {
    apply: (doc, { area }) => ({ ...doc, areas: removeById(doc.areas, area.id) }),
    revert: (doc, { area, index }) => ({ ...doc, areas: insertAt(doc.areas, index, area) }),
  },
  'move-area-vertex': {
    apply: (doc, { id, index, to }) => ({
      ...doc,
      areas: mapById(
        doc.areas,
        id,
        areaOutline((points) => replaceAt(points, index, to)),
      ),
    }),
    revert: (doc, { id, index, from }) => ({
      ...doc,
      areas: mapById(
        doc.areas,
        id,
        areaOutline((points) => replaceAt(points, index, from)),
      ),
    }),
  },
  'resize-area': {
    apply: (doc, { id, to }) => ({
      ...doc,
      areas: mapById(
        doc.areas,
        id,
        areaOutline(() => to),
      ),
    }),
    revert: (doc, { id, from }) => ({
      ...doc,
      areas: mapById(
        doc.areas,
        id,
        areaOutline(() => from),
      ),
    }),
  },
} satisfies Pick<Handlers, 'add-area' | 'delete-area' | 'move-area-vertex' | 'resize-area'>;

const gradeHandlers = {
  terraform: {
    apply: (doc, { cells }) => ({ ...doc, gradeDelta: mergeGradeDelta(doc.gradeDelta, { cells }) }),
    revert: (doc, { cells }) => ({
      ...doc,
      gradeDelta: subtractGradeDelta(doc.gradeDelta, { cells }),
    }),
  },
} satisfies Pick<Handlers, 'terraform'>;

interface LockEdit {
  readonly target: 'item' | 'area';
  readonly id: string;
  readonly locked: boolean;
}

function withLock(doc: Doc, { target, id, locked }: LockEdit): Doc {
  return target === 'item'
    ? { ...doc, items: mapById(doc.items, id, (item) => ({ ...item, locked })) }
    : { ...doc, areas: mapById(doc.areas, id, (area) => ({ ...area, locked })) };
}

// Staff setup tools: lock an existing element and draw forbidden or no-grade zones.
const staffHandlers = {
  'set-locked': {
    apply: (doc, { target, id, locked }) => withLock(doc, { target, id, locked }),
    revert: (doc, { target, id, locked }) => withLock(doc, { target, id, locked: !locked }),
  },
  'add-zone': {
    apply: (doc, { zone }) => ({ ...doc, zones: [...doc.zones, zone] }),
    revert: (doc, { zone }) => ({ ...doc, zones: removeById(doc.zones, zone.id) }),
  },
} satisfies Pick<Handlers, 'set-locked' | 'add-zone'>;

const HANDLERS: Handlers = {
  ...itemHandlers,
  ...pathHandlers,
  ...areaHandlers,
  ...gradeHandlers,
  ...staffHandlers,
};

function run<K extends Kind>(kind: K, spec: SpecMap[K], doc: Doc, direction: 'apply' | 'revert') {
  const handler: Handler<K> = HANDLERS[kind];
  return direction === 'apply' ? handler.apply(doc, spec) : handler.revert(doc, spec);
}

export function applySingle(doc: Doc, spec: SingleCommandSpec): Doc {
  return run(spec.kind, spec, doc, 'apply');
}

export function revertSingle(doc: Doc, spec: SingleCommandSpec): Doc {
  return run(spec.kind, spec, doc, 'revert');
}
