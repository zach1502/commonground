import { lineOf } from './files.js';

/** Size an entry states: footprint width and depth (or a kit part's size) and height. */
export interface CatalogDims {
  readonly widthM?: number;
  readonly depthM?: number;
  readonly heightM?: number;
}

/** One catalog or module-kit object literal that names a modelKey. */
export interface CatalogEntry {
  readonly id?: string;
  readonly modelKey: string;
  readonly scalePolicy?: string;
  readonly dims: CatalogDims;
  /**
   * 'trunk' when the entry is a tree: its footprint is the trunk the metrics place, while the
   * model is the crown, which follows the model's proportions under one uniform scale.
   */
  readonly plan: 'footprint' | 'trunk';
  /** Line of the modelKey, for findings. */
  readonly line: number;
}

const CROWN_FIELD = /\bcrownRadiusMatureM\s*:/;
const MODEL_KEY = /\bmodelKey\s*:\s*['"]([^'"]+)['"]/g;
const FOOTPRINT_OPEN = /\bfootprint\s*:\s*\{/;
const NOT_FOUND = -1;

/** Index of the `{` that opens the object around `index`, or -1. */
function openingBrace(text: string, index: number): number {
  let depth = 0;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const char = text[cursor];
    if (char === '}') depth += 1;
    if (char === '{') {
      if (depth === 0) return cursor;
      depth -= 1;
    }
  }
  return NOT_FOUND;
}

/** Index of the `}` that closes the object opened at `start`, or the text length. */
function closingBrace(text: string, start: number): number {
  let depth = 0;
  for (let cursor = start; cursor < text.length; cursor += 1) {
    const char = text[cursor];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return cursor;
    }
  }
  return text.length;
}

/** The object's body with every nested object emptied, so fields are read at one level. */
function topLevel(body: string): string {
  let depth = 0;
  let out = '';
  for (const char of body) {
    if (char === '}') depth -= 1;
    if (depth === 0) out += char;
    if (char === '{') depth += 1;
  }
  return out;
}

function stringField(text: string, name: string): string | undefined {
  return new RegExp(`\\b${name}\\s*:\\s*['"]([^'"]+)['"]`).exec(text)?.[1];
}

function numberField(text: string, name: keyof CatalogDims): CatalogDims {
  const match = new RegExp(`\\b${name}\\s*:\\s*(\\d+(?:\\.\\d+)?)`).exec(text);
  return match?.[1] === undefined ? {} : { [name]: Number(match[1]) };
}

const planDims = (text: string) => ({
  ...numberField(text, 'widthM'),
  ...numberField(text, 'depthM'),
});

/** Width and depth from the footprint when there is one, else from the top level; height on top. */
function entryDims(body: string, level: string): CatalogDims {
  const height = numberField(level, 'heightM');
  const inBody = FOOTPRINT_OPEN.exec(body);
  if (FOOTPRINT_OPEN.exec(level) === null || inBody === null) {
    return { ...planDims(level), ...height };
  }
  const open = inBody.index + inBody[0].length - 1;
  return { ...planDims(topLevel(body.slice(open + 1, closingBrace(body, open)))), ...height };
}

/** Reads catalog entries from TypeScript source by brace matching; no TypeScript parser needed. */
export function catalogEntries(text: string): CatalogEntry[] {
  return [...text.matchAll(MODEL_KEY)].flatMap((match) => {
    const start = openingBrace(text, match.index);
    if (start === NOT_FOUND) return [];
    const body = text.slice(start + 1, closingBrace(text, start));
    const level = topLevel(body);
    const id = stringField(level, 'id');
    const scalePolicy = stringField(level, 'scalePolicy');
    return [
      {
        ...(id === undefined ? {} : { id }),
        modelKey: match[1] ?? '',
        ...(scalePolicy === undefined ? {} : { scalePolicy }),
        dims: entryDims(body, level),
        plan: CROWN_FIELD.test(level) ? 'trunk' : 'footprint',
        line: lineOf(text, match.index),
      },
    ];
  });
}
