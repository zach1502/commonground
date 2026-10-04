import type {
  DesignArea,
  DesignDocument,
  DesignItem,
  DesignPath,
  PlanePoint,
  Zone,
} from '@parkshape/core';

import { applySingle, revertSingle } from './command-handlers.js';
import {
  batchCommandSchema,
  singleCommandSchema,
  type CommandSpec,
  type SingleCommandSpec,
} from './command-schema.js';

export type { CommandSpec, SingleCommandSpec } from './command-schema.js';

/** One undoable edit. apply and revert return new documents and never change their input. */
export interface Command {
  readonly spec: CommandSpec;
  apply(doc: DesignDocument): DesignDocument;
  revert(doc: DesignDocument): DesignDocument;
}

const single = (spec: unknown): SingleCommandSpec => singleCommandSchema.parse(spec);

export function toCommand(spec: CommandSpec): Command {
  if (spec.kind !== 'batch') {
    return {
      spec,
      apply: (doc) => applySingle(doc, spec),
      revert: (doc) => revertSingle(doc, spec),
    };
  }
  return {
    spec,
    apply: (doc) => spec.commands.reduce(applySingle, doc),
    revert: (doc) => spec.commands.reduceRight(revertSingle, doc),
  };
}

/** Several edits undone as one, such as moving a multi-selection. */
export function batch(commands: readonly SingleCommandSpec[]): CommandSpec {
  return batchCommandSchema.parse({ kind: 'batch', commands });
}

export const addItem = (item: DesignItem) => single({ kind: 'add-item', item });
export const deleteItem = (item: DesignItem, index: number) =>
  single({ kind: 'delete-item', item, index });
export const moveItem = (id: string, from: PlanePoint, to: PlanePoint) =>
  single({ kind: 'move-item', id, from, to });
export const rotateItem = (id: string, from: number, to: number) =>
  single({ kind: 'rotate-item', id, from, to });

/** A copy of the item under a new id, shifted by offset. */
export function duplicateItem(item: DesignItem, newId: string, offset: PlanePoint) {
  const position = { x: item.position.x + offset.x, y: item.position.y + offset.y };
  return single({ kind: 'add-item', item: { ...item, id: newId, position, locked: false } });
}

export const addPath = (path: DesignPath) => single({ kind: 'add-path', path });
export const deletePath = (path: DesignPath, index: number) =>
  single({ kind: 'delete-path', path, index });
export const movePathVertex = (id: string, index: number, from: PlanePoint, to: PlanePoint) =>
  single({ kind: 'move-path-vertex', id, index, from, to });
export const insertPathVertex = (id: string, index: number, point: PlanePoint) =>
  single({ kind: 'insert-path-vertex', id, index, point });

export const addArea = (area: DesignArea) => single({ kind: 'add-area', area });
export const deleteArea = (area: DesignArea, index: number) =>
  single({ kind: 'delete-area', area, index });
export const moveAreaVertex = (id: string, index: number, from: PlanePoint, to: PlanePoint) =>
  single({ kind: 'move-area-vertex', id, index, from, to });
export const resizeArea = (id: string, from: readonly PlanePoint[], to: readonly PlanePoint[]) =>
  single({ kind: 'resize-area', id, from, to });

/** One drag session's coalesced grade increments, undone and redone as a single step. */
export const terraform = (cells: readonly { x: number; y: number; deltaM: number }[]) =>
  single({ kind: 'terraform', cells });

export const setLocked = (target: 'item' | 'area', id: string, locked: 'locked' | 'unlocked') =>
  single({ kind: 'set-locked', target, id, locked: locked === 'locked' });
export const addZone = (zone: Zone) => single({ kind: 'add-zone', zone });
