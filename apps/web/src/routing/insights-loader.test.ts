import { describe, expect, it, vi } from 'vitest';

import { ApiRequestError } from '@parkshape/api-client';

import type { WebApi } from '../api/web-api';

import { insightsLoader, type InsightsData } from './insights-loader';
import { NotFoundError } from './not-found';

const BLANK = { version: 1, items: [], paths: [], areas: [], gradeDelta: { cells: [] }, zones: [] };
const INSIGHTS = { headline: { designsSubmitted: 1, uniqueVoters: 0, votesCast: 0 } };

const SUMMARY = { themes: [], tradeoffs: [], source: 'rule-based', designsRead: 0 };

const TERRAIN = { width: 176, height: 86 };

const getDesign = vi.fn().mockResolvedValue({ document: BLANK });

function api(baselineDesignId: string | null) {
  return {
    getProject: vi.fn().mockResolvedValue({ id: 'jrp', baselineDesignId }),
    getInsights: vi.fn().mockResolvedValue(INSIGHTS),
    getSummary: vi.fn().mockResolvedValue(SUMMARY),
    getDesign,
    getTerrain: vi.fn().mockResolvedValue(TERRAIN),
  } as unknown as WebApi;
}

async function terrainOf(data: InsightsData | Response): Promise<unknown> {
  if (data instanceof Response) throw new Error('unexpected redirect');
  return data.terrain;
}

const staff = () => Promise.resolve({ id: 's', displayName: 'S', role: 'staff' as const });

describe('insightsLoader', () => {
  it('loads the project, its insights and the baseline document', async () => {
    const fake = api('base');
    const data = await insightsLoader(fake, staff)({ params: { id: 'jrp' } });
    expect(data).toMatchObject({ insights: INSIGHTS, baseline: BLANK, summary: SUMMARY });
    expect(getDesign).toHaveBeenCalledWith('base');
  });

  it('hands the baseline on as the API sent it, so the loader ships in the entry without zod', async () => {
    const raw = { version: 1, notADocument: true };
    const fake = { ...api('base'), getDesign: vi.fn().mockResolvedValue({ document: raw }) };
    const data = await insightsLoader(fake, staff)({ params: { id: 'jrp' } });
    expect(data).toMatchObject({ baseline: raw });
  });

  it('loads the recorded terrain the heatmap drapes over', async () => {
    const data = await insightsLoader(api('base'), staff)({ params: { id: 'jrp' } });
    expect(await terrainOf(data)).toEqual(TERRAIN);
  });

  it('draws flat ground when the terrain does not load', async () => {
    const fake = { ...api(null), getTerrain: vi.fn().mockRejectedValue(new Error('down')) };
    const data = await insightsLoader(fake, staff)({ params: { id: 'jrp' } });
    expect(await terrainOf(data)).toBeNull();
  });
});

describe('insightsLoader on a slow link', () => {
  it('leaves the terrain until the insights have arrived, so it does not slow the numbers', async () => {
    const getTerrain = vi.fn().mockResolvedValue(TERRAIN);
    const fake = {
      ...api('base'),
      getTerrain,
      getInsights: vi.fn().mockReturnValue(new Promise(() => undefined)),
    };
    void insightsLoader(fake, staff)({ params: { id: 'jrp' } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getTerrain).not.toHaveBeenCalled();
  });

  it('asks for the baseline while the insights are still on the way', async () => {
    const baselineDesign = vi.fn().mockResolvedValue({ document: BLANK });
    const fake = {
      ...api('base'),
      getDesign: baselineDesign,
      getInsights: vi.fn().mockReturnValue(new Promise(() => undefined)),
    };
    void insightsLoader(fake, staff)({ params: { id: 'jrp' } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(baselineDesign).toHaveBeenCalledWith('base');
  });

  it('draws bare terrain when there is no baseline', async () => {
    const data = await insightsLoader(api(null), staff)({ params: { id: 'jrp' } });
    expect(data).toMatchObject({ baseline: null });
  });

  it('leaves the summary out when it is off or fails, and still loads the page', async () => {
    const off = new ApiRequestError(503, 'feature-off', 'Off');
    const fake = { ...api(null), getSummary: vi.fn().mockRejectedValue(off) } as unknown as WebApi;
    const data = await insightsLoader(fake, staff)({ params: { id: 'jrp' } });
    expect(data).toMatchObject({ insights: INSIGHTS, summary: null });
  });

  it('sends people who are not staff away', async () => {
    const away = new Response(null, { status: 302 });
    const data = await insightsLoader(api(null), () => Promise.resolve(away))({ params: {} });
    expect(data).toBe(away);
  });

  it('turns a 404 into the not found page', async () => {
    const missing = {
      getProject: vi.fn().mockRejectedValue(new ApiRequestError(404, 'not-found', 'No project')),
      getInsights: vi.fn().mockResolvedValue(INSIGHTS),
      getSummary: vi.fn().mockResolvedValue(SUMMARY),
      getTerrain: vi.fn().mockResolvedValue(TERRAIN),
    } as unknown as WebApi;
    await expect(insightsLoader(missing, staff)({ params: { id: 'x' } })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
