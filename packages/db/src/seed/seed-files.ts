import { readdirSync, readFileSync } from 'node:fs';

// The seed data sits beside src in packages/db/seed, so both src and dist resolve it the same way.
const SEED_DIR = new URL('../../seed/', import.meta.url);
const JSON_EXTENSION = '.json';

/** Parses one JSON file under packages/db/seed. */
export function readSeedJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(new URL(relativePath, SEED_DIR), 'utf8')) as unknown;
}

/** The JSON files in a packages/db/seed subdirectory, sorted by name. */
export function seedJsonFiles(directory: string): string[] {
  return readdirSync(new URL(`${directory}/`, SEED_DIR))
    .filter((name) => name.endsWith(JSON_EXTENSION))
    .sort()
    .map((name) => `${directory}/${name}`);
}
