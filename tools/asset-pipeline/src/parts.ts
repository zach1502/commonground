import type { ShapeKind } from './geometry.js';

export type PartColour =
  | 'bark'
  | 'leaf'
  | 'wood'
  | 'metal'
  | 'concrete'
  | 'court'
  | 'play'
  | 'roof'
  | 'soil'
  | 'seat'
  | 'slide'
  | 'net'
  | 'hoop'
  | 'mulch';

/** One shape in a stand-in model, placed by the centre of its base. */
export interface Part {
  readonly shape: ShapeKind;
  readonly widthM: number;
  readonly depthM: number;
  readonly heightM: number;
  readonly x: number;
  readonly baseY: number;
  readonly z: number;
  readonly colour: PartColour;
}

// Linear RGB base colours, muted to sit with the B.C. Design System palette.
interface LinearRgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export const COLOURS: Readonly<Record<PartColour, LinearRgb>> = {
  bark: { r: 0.2, g: 0.12, b: 0.06 },
  leaf: { r: 0.12, g: 0.32, b: 0.1 },
  wood: { r: 0.45, g: 0.28, b: 0.14 },
  metal: { r: 0.35, g: 0.37, b: 0.4 },
  concrete: { r: 0.6, g: 0.6, b: 0.58 },
  court: { r: 0.12, g: 0.3, b: 0.22 },
  play: { r: 0.8, g: 0.45, b: 0.05 },
  roof: { r: 0.25, g: 0.2, b: 0.2 },
  soil: { r: 0.3, g: 0.2, b: 0.12 },
  // The slide is the BC gold; seats and hoop are wood browns and the net is a light grey.
  seat: { r: 0.25, g: 0.14, b: 0.07 },
  slide: { r: 0.94, g: 0.5, b: 0.06 },
  net: { r: 0.85, g: 0.85, b: 0.83 },
  hoop: { r: 0.6, g: 0.25, b: 0.05 },
  // Engineered wood fibre, the pervious surface under play equipment.
  mulch: { r: 0.36, g: 0.2, b: 0.09 },
};

export type PartInput = Omit<Part, 'x' | 'baseY' | 'z'> & Partial<Pick<Part, 'x' | 'baseY' | 'z'>>;

export function part(input: PartInput): Part {
  return { x: 0, baseY: 0, z: 0, ...input };
}

// Thin enough to read as a surface, thick enough to clear the terrain it sits on.
const SURFACE_PAD_M = 0.05;

/** A thin pad that fills the whole catalog footprint, so the model's plan matches the catalog. */
export function surfacePad(dims: Pick<Part, 'widthM' | 'depthM'>, colour: PartColour): Part {
  const { widthM, depthM } = dims;
  return part({ shape: 'box', widthM, depthM, heightM: SURFACE_PAD_M, colour });
}
