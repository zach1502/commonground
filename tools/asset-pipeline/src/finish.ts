import type { Document, Material, vec4 } from '@gltf-transform/core';

// The scene palette in packages/scene/src/palette/colours.ts, as sRGB hex.
const FOLIAGE = '#5a7d43';
const FOLIAGE_DARK = '#466134';
const SOIL = '#8a6a4a';
const SOIL_DARK = '#5e4632';
const PLAY_GOLD = '#f8bb47';
const WATER = '#3f7fa6';
const MEADOW = '#8fa86a';
const GRASS = '#6b8f4e';
const PATH_SURFACE = '#c9b99a';

// Kenney and Poly Pizza material names mapped to a palette colour.
const RECOLOUR: Readonly<Record<string, string>> = {
  leafsGreen: FOLIAGE,
  leafsFall: FOLIAGE,
  grass: FOLIAGE,
  leaf: FOLIAGE,
  leafsDark: FOLIAGE_DARK,
  woodBark: SOIL,
  dirt: SOIL,
  dirtDark: SOIL_DARK,
  water: WATER,
  stone: PATH_SURFACE,
  woodBarkDark: SOIL_DARK,
  DarkRed: SOIL_DARK,
  LightRed: SOIL,
  play: PLAY_GOLD,
  RoofTiles_Red: SOIL_DARK,
};

// DESIGN.md "Ground, paths and water": metalness 0, roughness 0.5 or more except on water.
const FOLIAGE_ROUGHNESS = 0.9;
const BARK_ROUGHNESS = 0.85;
const ROOF_ROUGHNESS = 0.6;
const ROUGHNESS_BY_NAME: readonly (readonly [RegExp, number])[] = [
  [/leaf|grass/i, FOLIAGE_ROUGHNESS],
  [/bark|wood|birch/i, BARK_ROUGHNESS],
  [/roof/i, ROOF_ROUGHNESS],
];
const DEFAULT_ROUGHNESS = 0.8;
// Models whose texture atlas carries off-palette colours; they get one flat tint instead.
const FLAT_TINT: Readonly<Record<string, string>> = {
  bench: SOIL,
  'kit-gate': SOIL,
  'kit-fence-post': SOIL,
  meadow: MEADOW,
  'off-leash-area': GRASS,
  hedge: FOLIAGE_DARK,
  'wayfinding-sign': SOIL,
  'compost-bin': SOIL_DARK,
  // Blue sets the recycling bin apart from the waste bin beside it.
  'recycling-bin': WATER,
};

const HEX_RADIX = 16;
const BYTE = 255;
const SRGB_KNEE = 0.04045;
const SRGB_LINEAR_SLOPE = 12.92;
const SRGB_OFFSET = 0.055;
const SRGB_SCALE = 1.055;
const SRGB_GAMMA = 2.4;
const LINEAR_KNEE = 0.0031308;
const FULL_TURN_DEG = 360;
const SIXTH_TURN_DEG = 60;
const HUE_SECTORS = 6;
const GREEN_SECTOR = 2;
const BLUE_SECTOR = 4;
const HEX_CHANNEL_CHARS = 2;
const RED = 0;
const GREEN = 1;
const BLUE = 2;

function toLinear(value: number): number {
  return value <= SRGB_KNEE
    ? value / SRGB_LINEAR_SLOPE
    : ((value + SRGB_OFFSET) / SRGB_SCALE) ** SRGB_GAMMA;
}

function toSrgb(value: number): number {
  return value <= LINEAR_KNEE
    ? value * SRGB_LINEAR_SLOPE
    : SRGB_SCALE * value ** (1 / SRGB_GAMMA) - SRGB_OFFSET;
}

/** glTF base colours are linear; the palette is sRGB hex. */
function linearFactor(hex: string): vec4 {
  const channel = (index: number) =>
    toLinear(
      Number.parseInt(
        hex.slice(1 + index * HEX_CHANNEL_CHARS, 1 + (index + 1) * HEX_CHANNEL_CHARS),
        HEX_RADIX,
      ) / BYTE,
    );
  return [channel(RED), channel(GREEN), channel(BLUE), 1];
}

function hueSector(rgb: { red: number; green: number; blue: number }, max: number, spread: number) {
  const { red, green, blue } = rgb;
  if (max === red) return ((green - blue) / spread + HUE_SECTORS) % HUE_SECTORS;
  if (max === green) return (blue - red) / spread + GREEN_SECTOR;
  return (red - green) / spread + BLUE_SECTOR;
}

/** Hue in degrees of a linear glTF colour, measured on its sRGB value as a designer sees it. */
export function hueOfLinear(factor: readonly number[]): number {
  const [r, g, b] = factor.slice(0, HEX_CHANNEL_CHARS + 1).map((value) => toSrgb(value));
  const red = r ?? 0;
  const green = g ?? 0;
  const blue = b ?? 0;
  const max = Math.max(red, green, blue);
  const spread = max - Math.min(red, green, blue);
  if (spread === 0) return 0;
  const sector = hueSector({ red, green, blue }, max, spread);
  return (sector * SIXTH_TURN_DEG) % FULL_TURN_DEG;
}

function roughnessFor(name: string): number {
  return ROUGHNESS_BY_NAME.find(([pattern]) => pattern.test(name))?.[1] ?? DEFAULT_ROUGHNESS;
}

function finishOne(material: Material, flatTint: string | undefined): void {
  const name = material.getName();
  material.setMetallicFactor(0).setRoughnessFactor(roughnessFor(name));
  const colour = flatTint ?? RECOLOUR[name];
  if (colour !== undefined) material.setBaseColorFactor(linearFactor(colour));
  if (flatTint !== undefined) material.setBaseColorTexture(null);
}

/** Palette colours and a matte finish on every material of a model. */
export function finishMaterials(document: Document, modelKey: string): void {
  const flatTint = FLAT_TINT[modelKey];
  document
    .getRoot()
    .listMaterials()
    .forEach((material) => {
      finishOne(material, flatTint);
    });
}
