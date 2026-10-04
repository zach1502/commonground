/** Scene colours: the domain palette plus the BC support colours for status. */
export interface ScenePalette {
  readonly terrainGrass: string;
  readonly terrainMeadow: string;
  readonly soil: string;
  readonly soilDark: string;
  readonly water: string;
  readonly pathSurface: string;
  /** Background and fog: a pale tint of the water blue. */
  readonly sky: string;
  /** Tree canopies, recoloured in the asset pipeline to sit by the grass hue. */
  readonly foliage: string;
  readonly foliageDark: string;
  /** The BC focus colour, for the selection outline. */
  readonly focus: string;
  readonly success: string;
  readonly warning: string;
  readonly danger: string;
  readonly info: string;
  /** Street ribbons around the parcel, a mid grey that sits below the design. */
  readonly contextStreet: string;
  /** Sidewalk ribbons, lighter than the streets. */
  readonly contextSidewalk: string;
  /** The parking stall hatch. */
  readonly contextParking: string;
  /** Bus stop pins and bike routes; apart from the focus blue. */
  readonly contextAccent: string;
}

export type Status = 'success' | 'warning' | 'danger' | 'info';

/** Custom properties the page may set; BC support tokens come from @bcgov/design-tokens. */
export const PALETTE_PROPERTIES: Readonly<Record<keyof ScenePalette, string>> = {
  terrainGrass: '--parkshape-terrain-grass',
  terrainMeadow: '--parkshape-terrain-meadow',
  soil: '--parkshape-soil',
  soilDark: '--parkshape-soil-dark',
  water: '--parkshape-water',
  pathSurface: '--parkshape-path-surface',
  sky: '--parkshape-sky',
  foliage: '--parkshape-foliage',
  foliageDark: '--parkshape-foliage-dark',
  focus: '--surface-color-border-active',
  success: '--support-border-color-success',
  warning: '--support-border-color-warning',
  danger: '--support-border-color-danger',
  info: '--support-border-color-info',
  contextStreet: '--theme-gray-60',
  contextSidewalk: '--theme-gray-30',
  contextParking: '--theme-gray-80',
  contextAccent: '--theme-blue-70',
};

/** Used when the page does not set the property; the status and theme values match design-tokens 5.0.0. */
export const PALETTE_FALLBACKS: ScenePalette = {
  terrainGrass: '#6b8f4e',
  terrainMeadow: '#8fa86a',
  soil: '#8a6a4a',
  soilDark: '#5e4632',
  water: '#3f7fa6',
  pathSurface: '#c9b99a',
  sky: '#cfe3f0',
  foliage: '#5a7d43',
  foliageDark: '#466134',
  focus: '#2e5dd7',
  success: '#42814a',
  warning: '#f8bb47',
  danger: '#ce3e39',
  info: '#053662',
  contextStreet: '#c6c5c3',
  contextSidewalk: '#eceae8',
  contextParking: '#605e5c',
  contextAccent: '#5595d9',
};

export type PropertyReader = (name: string) => string;

/** Reads custom properties from the document root, or nothing outside a browser. */
export function documentPropertyReader(): PropertyReader {
  if (typeof document === 'undefined') {
    return () => '';
  }
  const style = getComputedStyle(document.documentElement);
  return (name) => style.getPropertyValue(name);
}

export function readPalette(read: PropertyReader): ScenePalette {
  const pick = (key: keyof ScenePalette): string => {
    const value = read(PALETTE_PROPERTIES[key]).trim();
    return value === '' ? PALETTE_FALLBACKS[key] : value;
  };
  const keys = Object.keys(PALETTE_FALLBACKS) as (keyof ScenePalette)[];
  return Object.fromEntries(keys.map((key) => [key, pick(key)])) as unknown as ScenePalette;
}

export function statusColour(palette: ScenePalette, status: Status): string {
  return palette[status];
}
