import { afterEach, describe, expect, it, vi } from 'vitest';

// These modules build schemas and a date formatter when they load. A static import would turn a
// load failure into a failed file with no tests, which Stryker counts as a surviving mutant, so
// each test imports the module itself and fails on its own.

// 31 October 2026 ends at 07:00 UTC on 1 November, since Vancouver is on PDT (UTC-7) until then.
const LAST_EVENING_IN_VANCOUVER = new Date('2026-11-01T06:59:59.000Z');

const NATIVE_DATE_TIME_FORMAT = Intl.DateTimeFormat;

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

/** Makes every date formatter without its own time zone use UTC, as a server in UTC would. */
function simulateUtcHost(): void {
  vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function utcByDefault(
    locales?: string | string[],
    options?: Intl.DateTimeFormatOptions,
  ) {
    return new NATIVE_DATE_TIME_FORMAT(locales, { timeZone: 'UTC', ...options });
  } as typeof Intl.DateTimeFormat);
}

describe('schema modules at load', () => {
  it('builds the park-day clock in Vancouver time even when the host runs on UTC', async () => {
    simulateUtcHost();
    const { projectPhase } = await import('./project.js');
    const project = { status: 'open', closesAt: '2026-10-31' } as const;
    expect(projectPhase(project, LAST_EVENING_IN_VANCOUVER)).toBe('open');
  });

  it('builds the catalog item schema for point, linear and area items', async () => {
    const { catalogItemSchema } = await import('./catalog.js');
    const shared = {
      category: 'seating',
      name: 'Bench',
      heightM: 0.9,
      unitCost: { perItemCad: 3500 },
      surface: 'pervious',
      scalePolicy: 'fixed',
    };
    const items = [
      {
        ...shared,
        id: 'bench',
        modelKey: 'bench',
        geometryKind: 'point',
        footprint: { widthM: 1.8, depthM: 0.6 },
      },
      {
        ...shared,
        id: 'edge',
        modelKey: 'edge',
        geometryKind: 'linear',
        footprint: { widthM: 0.3 },
      },
      {
        ...shared,
        id: 'lawn',
        modelKey: 'lawn',
        geometryKind: 'area',
        footprint: { minAreaM2: 10, defaultAreaM2: 40 },
      },
    ];
    expect(items.map((item) => catalogItemSchema.safeParse(item).success)).toEqual([
      true,
      true,
      true,
    ]);
  });
});
