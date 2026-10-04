import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { FakeClock } from '@parkshape/core';

import { replayFetch } from '../adapters/http/recorded-fetch.js';
import { siteContextFileSchema } from '../adapters/static/context-fixture.js';

import { fetchContext, FETCH_CONTEXT_USAGE } from './fetch-context-command.js';

const FIXTURE = new URL('../../fixtures/jonathan-rogers/', import.meta.url);
const RAW = new URL('raw/', FIXTURE);
const recorded = replayFetch(async (name) =>
  readFile(new URL(name, RAW), 'utf8').catch(() => undefined),
);
const clock = new FakeClock(new Date('2026-10-03T16:30:00.000Z'));

const tempDirs: string[] = [];
afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

/** A scratch fixture folder holding the recorded features.json, so the CLI finds the parcel. */
async function siteDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'parkshape-context-'));
  tempDirs.push(dir);
  await writeFile(join(dir, 'features.json'), await readFile(new URL('features.json', FIXTURE)));
  return dir;
}

function logger() {
  const lines: string[] = [];
  return { lines, log: (line: string) => lines.push(line) };
}

describe('fetchContext', () => {
  it('writes context.json for the recorded parcel and reports the count of each layer', async () => {
    const out = await siteDir();
    const { lines, log } = logger();
    expect(await fetchContext(['--out', out], { fetch: recorded, log, clock })).toBe(0);
    const file = siteContextFileSchema.parse(
      JSON.parse(await readFile(join(out, 'context.json'), 'utf8')),
    );
    expect(file.parkName).toBe('Jonathan Rogers Park');
    expect(file.context.recordedAt).toBe('2026-10-03T16:30:00.000Z');
    expect(file.context.features.length).toBeGreaterThan(0);
    expect(lines.some((line) => line.startsWith('street: '))).toBe(true);
    expect(lines.some((line) => line.startsWith('busStop: '))).toBe(true);
  });

  it('records the Vancouver responses and the TransLink stops when asked', async () => {
    const out = await siteDir();
    const { log } = logger();
    expect(await fetchContext(['--out', out, '--record'], { fetch: recorded, log, clock })).toBe(0);
    const stops = JSON.parse(await readFile(join(out, 'raw', 'translink-stops.json'), 'utf8')) as {
      stops: unknown[];
    };
    expect(stops.stops.length).toBeGreaterThan(0);
    await expect(
      readFile(join(out, 'raw', 'vancouver-public-streets.json'), 'utf8'),
    ).resolves.toContain('hblock');
  });

  it('fails without a features.json to read the parcel from', async () => {
    const out = await mkdtemp(join(tmpdir(), 'parkshape-context-'));
    tempDirs.push(out);
    const { lines, log } = logger();
    expect(await fetchContext(['--out', out], { fetch: recorded, log, clock })).toBe(1);
    expect(lines.join('\n')).toContain('run fetch-site first');
  });

  it('prints the usage for an unknown flag', async () => {
    const { lines, log } = logger();
    expect(await fetchContext(['--nope'], { fetch: recorded, log, clock })).toBe(2);
    expect(lines).toEqual([FETCH_CONTEXT_USAGE]);
  });
});
