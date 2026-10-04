import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { apiServer, createTestDeps, TEST_API_URL } from '../test/api-server';

describe('createWebApi site context', () => {
  it('reads the site context through the generated client and asks once per project', async () => {
    let calls = 0;
    apiServer.use(
      http.get(`${TEST_API_URL}/projects/jrp/context`, () => {
        calls += 1;
        return HttpResponse.json({
          bufferM: 300,
          recordedAt: '2026-10-03T16:26:45.290Z',
          features: [
            {
              id: 'stop-60006',
              kind: 'busStop',
              name: 'Eastbound W Broadway @ Columbia St',
              source: { name: 'TransLink', datasetId: 'gtfs-stops' },
              geometry: { type: 'point', position: { x: 18.9, y: -97.6 } },
            },
          ],
        });
      }),
    );
    const { api } = createTestDeps();
    const context = await api.getContext('jrp');
    await api.getContext('jrp');
    expect(context.features.map((feature) => feature.name)).toEqual([
      'Eastbound W Broadway @ Columbia St',
    ]);
    expect(calls).toBe(1);
  });

  it('asks again after a failed context read', async () => {
    let calls = 0;
    apiServer.use(
      http.get(`${TEST_API_URL}/projects/jrp/context`, () => {
        calls += 1;
        return HttpResponse.json(
          { error: { kind: 'contextUnavailable', message: 'Street data did not load.' } },
          { status: 503 },
        );
      }),
    );
    const { api } = createTestDeps();
    await expect(api.getContext('jrp')).rejects.toMatchObject({ status: 503 });
    await expect(api.getContext('jrp')).rejects.toMatchObject({ status: 503 });
    expect(calls).toBe(2);
  });
});
