import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { matchesAny } from './glob.js';

// Directory names that never hold source: installs, build output, caches and scratch space.
const IGNORED_DIR_NAMES = new Set([
  '.git',
  '.turbo',
  '.yolo-sisyphus',
  '.data',
  '.terrain-cache',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
]);
// Repo-relative directories skipped only at the repo root: rule fixtures break rules on purpose.
const IGNORED_PREFIXES = ['tools/preflight/fixtures/', 'tools/asset-pipeline/sources/'];

const NEWLINE = 10;
// A file inside a package has at least a top folder, a package folder and a name.
const PACKAGE_PATH_DEPTH = 2;

const listCache = new Map<string, readonly string[]>();

function walk(rootDir: string, relativeDir: string, out: string[]): void {
  const entries = readdirSync(path.join(rootDir, relativeDir), { withFileTypes: true });
  for (const entry of entries) {
    const relative = relativeDir === '' ? entry.name : `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) {
      const skip =
        IGNORED_DIR_NAMES.has(entry.name) ||
        IGNORED_PREFIXES.some((prefix) => `${relative}/` === prefix);
      if (!skip) {
        walk(rootDir, relative, out);
      }
    } else if (entry.isFile()) {
      out.push(relative);
    }
  }
}

/** Every file under rootDir as a sorted repo-relative path with forward slashes. */
export function listRepoFiles(rootDir: string): readonly string[] {
  const cached = listCache.get(rootDir);
  if (cached !== undefined) {
    return cached;
  }
  const out: string[] = [];
  walk(rootDir, '', out);
  const sorted = out.sort();
  listCache.set(rootDir, sorted);
  return sorted;
}

/** Drops files the walker ignores, for lists that come from git. */
export function isScannable(file: string): boolean {
  const segments = file.split('/');
  return (
    !segments.slice(0, -1).some((segment) => IGNORED_DIR_NAMES.has(segment)) &&
    !IGNORED_PREFIXES.some((prefix) => file.startsWith(prefix))
  );
}

export function readText(rootDir: string, file: string): string {
  return readFileSync(path.join(rootDir, file), 'utf8');
}

export function fileExists(rootDir: string, file: string): boolean {
  return existsSync(path.join(rootDir, file));
}

/** Parses a JSON file under rootDir, or returns undefined when it is missing. */
export function readJson(rootDir: string, file: string): unknown {
  if (!fileExists(rootDir, file)) {
    return undefined;
  }
  return JSON.parse(readText(rootDir, file)) as unknown;
}

/** Files from `files` that match the globs and none of the exclusions. */
export function selectFiles(
  files: readonly string[],
  globs: readonly string[],
  exclude: readonly string[] = [],
): string[] {
  return files.filter((file) => matchesAny(file, globs) && !matchesAny(file, exclude));
}

/** The workspace package a file belongs to (apps/web, packages/core, tools/preflight) or '.'. */
export function packageOf(file: string): string {
  const [top, name] = file.split('/');
  const isWorkspace = top === 'apps' || top === 'packages' || top === 'tools';
  return isWorkspace && name !== undefined && file.split('/').length > PACKAGE_PATH_DEPTH
    ? `${top}/${name}`
    : '.';
}

/** 1-based line number of a character offset. */
export function lineOf(text: string, index: number): number {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (text.charCodeAt(cursor) === NEWLINE) {
      line += 1;
    }
  }
  return line;
}

/** Each line with its 1-based number. */
export function numberedLines(text: string): { line: number; text: string }[] {
  return text.split('\n').map((lineText, index) => ({ line: index + 1, text: lineText }));
}
