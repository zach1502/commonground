import type { DesignDocument, PathSurface, PlanePoint, ZoneKind } from '@parkshape/core';

import type { HistoryChange } from '../../motion/placement-motion.js';
import type { CommandSpec } from '../command-schema.js';
import type { CommandStack } from '../command-stack.js';
import type { HintEvent, HintId, HintsState } from '../hints.js';
import type { PlacementValidity } from '../placement-validity.js';
import type { TerraformMode } from '../terraform/types.js';
import type { ElementRef } from '../types.js';

export type SelectMode = 'replace' | 'add' | 'toggle';

/** Terraform brush settings, kept on the tool slice and edited by the controls panel. */
export interface TerraformSettings {
  readonly mode: TerraformMode;
  readonly radiusM: number;
  /** A unitless 0 to 1 brush strength. */
  readonly strength: number;
}

export type Tool =
  | { readonly kind: 'select' }
  | { readonly kind: 'place'; readonly catalogId: string }
  | { readonly kind: 'terraform' }
  | {
      readonly kind: 'path';
      readonly surface: PathSurface;
      readonly draft: readonly PlanePoint[];
    }
  | {
      readonly kind: 'area';
      readonly catalogId: string;
      readonly draft: { readonly start: PlanePoint; readonly end: PlanePoint } | null;
    }
  | {
      readonly kind: 'zone';
      readonly zoneKind: ZoneKind;
      readonly label: string;
      readonly draft: { readonly start: PlanePoint; readonly end: PlanePoint } | null;
    }
  | { readonly kind: 'add-corner'; readonly areaId: string };

/** The parcel and the sidewalks an entrance snaps toward; null until the site context loads. */
export interface EntranceTargets {
  readonly parcel: readonly PlanePoint[];
  readonly sidewalks: readonly (readonly PlanePoint[])[];
}

export interface Ghost {
  readonly position: PlanePoint;
  readonly validity: PlacementValidity;
}

/** A rejected placement, kept as a lasting notice so a blocked click is never silent. */
export type RejectedPlacement = Extract<PlacementValidity, { readonly valid: false }>;

/** One message beside the canvas at a time; DESIGN.md allows no toasts. */
export type Notice =
  | { readonly kind: 'locked'; readonly id: string }
  | { readonly kind: 'area-too-small'; readonly minAreaM2: number }
  | { readonly kind: 'path-too-short' }
  | { readonly kind: 'rejected'; readonly validity: RejectedPlacement };

export interface DocumentSlice {
  readonly document: DesignDocument;
  /** Swaps the document without history, for loading and for undo. */
  readonly replaceDocument: (document: DesignDocument) => void;
}

export interface HistorySlice {
  readonly history: CommandStack;
  /** The last execute, undo or redo, so the canvas can play its placement motion. */
  readonly change: HistoryChange | null;
  readonly execute: (spec: CommandSpec) => void;
  readonly undo: () => void;
  readonly redo: () => void;
}

export interface SelectionSlice {
  readonly selection: readonly ElementRef[];
  readonly select: (refs: readonly ElementRef[], mode: SelectMode) => void;
  readonly clearSelection: () => void;
}

export interface ToolSlice {
  readonly tool: Tool;
  readonly paint: 'on' | 'off';
  readonly snap: 'on' | 'off';
  readonly alt: 'held' | 'released';
  readonly ghost: Ghost | null;
  /** The unlocked element under the pointer in the select tool, so it reads as selectable. */
  readonly hovered: string | null;
  readonly guides: readonly { readonly axis: 'x' | 'y'; readonly value: number }[];
  /** How far the selection is being dragged; committed as one command on release. */
  readonly drag: PlanePoint | null;
  readonly terraform: TerraformSettings;
  readonly entranceSnap: EntranceTargets | null;
  /** The sidewalk point the last entrance snapped toward, drawn as a small marker. */
  readonly entranceMarker: PlanePoint | null;
  readonly setTool: (tool: Tool) => void;
  readonly setPaint: (paint: 'on' | 'off') => void;
  readonly setSnap: (snap: 'on' | 'off') => void;
  readonly setAlt: (alt: 'held' | 'released') => void;
  readonly setGhost: (ghost: Ghost | null) => void;
  readonly setHovered: (hovered: string | null) => void;
  readonly setGuides: (guides: ToolSlice['guides']) => void;
  readonly setDrag: (drag: PlanePoint | null) => void;
  readonly setTerraform: (settings: TerraformSettings) => void;
  readonly setEntranceSnap: (targets: EntranceTargets | null) => void;
  readonly setEntranceMarker: (marker: PlanePoint | null) => void;
}

export interface UiSlice {
  readonly shortcuts: 'open' | 'closed';
  readonly itemsList: 'shown' | 'hidden';
  readonly notice: Notice | null;
  readonly hints: HintsState;
  readonly setShortcuts: (shortcuts: 'open' | 'closed') => void;
  readonly setItemsList: (itemsList: 'shown' | 'hidden') => void;
  readonly setNotice: (notice: Notice | null) => void;
  readonly setHints: (hints: HintsState) => void;
  readonly hintEvent: (event: HintEvent) => void;
  readonly dismissHint: (id: HintId) => void;
}

export type EditorState = DocumentSlice & HistorySlice & SelectionSlice & ToolSlice & UiSlice;
