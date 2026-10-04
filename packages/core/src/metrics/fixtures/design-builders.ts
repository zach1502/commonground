import {
  designDocumentSchema,
  type DesignDocument,
  type DesignDocumentInput,
} from '../../schema/design.js';
import {
  defaultParameters,
  projectParametersSchema,
  type ProjectParameters,
  type ProjectParametersInput,
} from '../../schema/parameters.js';
import { parcelSchema, type Parcel } from '../../schema/parcel.js';

// Jonathan Rogers Park, Mount Pleasant, Vancouver.
const DEMO_LATITUDE = 49.2636;
const DEMO_LONGITUDE = -123.0995;

export type ItemInput = DesignDocumentInput['items'][number];
export type PathInput = DesignDocumentInput['paths'][number];
export type AreaInput = DesignDocumentInput['areas'][number];
export type ZoneInput = DesignDocumentInput['zones'][number];
export type GradeCellInput = DesignDocumentInput['gradeDelta']['cells'][number];
export type PolygonInput = AreaInput['polygon'];

export interface DesignParts {
  readonly items?: readonly ItemInput[];
  readonly paths?: readonly PathInput[];
  readonly areas?: readonly AreaInput[];
  readonly zones?: readonly ZoneInput[];
  readonly cells?: readonly GradeCellInput[];
}

/** A parsed design document built from the parts a test cares about. */
export function designOf(parts: DesignParts = {}): DesignDocument {
  return designDocumentSchema.parse({
    version: 1,
    items: parts.items ?? [],
    paths: parts.paths ?? [],
    areas: parts.areas ?? [],
    gradeDelta: { cells: parts.cells ?? [] },
    zones: parts.zones ?? [],
  });
}

/** An unlocked item with no rotation. */
export function itemAt(id: string, catalogId: string, x: number, y: number): ItemInput {
  return { id, catalogId, position: { x, y }, rotationDeg: 0, locked: false };
}

/** An axis-aligned rectangle, counter-clockwise from the lower-left corner. */
export function rectangle(minX: number, minY: number, maxX: number, maxY: number): PolygonInput {
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

/** A parcel covering x from 0 to widthM and y from 0 to heightM. */
export function rectangleParcel(widthM: number, heightM: number): Parcel {
  return parcelSchema.parse({
    id: 'test-parcel',
    name: 'Test parcel',
    polygon: rectangle(0, 0, widthM, heightM),
    origin: { lat: DEMO_LATITUDE, lon: DEMO_LONGITUDE },
  });
}

/** Demo parameters with some fields replaced. */
export function parametersWith(patch: Partial<ProjectParametersInput> = {}): ProjectParameters {
  return projectParametersSchema.parse({ ...defaultParameters(), ...patch });
}
