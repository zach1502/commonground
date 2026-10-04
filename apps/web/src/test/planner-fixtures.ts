import { http, HttpResponse } from 'msw';

import type { SiteFeatures, TerrainLoad } from '../api/staff-api';

import { apiServer, TEST_API_URL } from './api-server';
import recorded from './planner-site.json' with { type: 'json' };

/** Jonathan Rogers Park, trimmed to three features, as the static site provider returns it. */
export const SITE = recorded.site as SiteFeatures;
export const TERRAIN = recorded.terrain as TerrainLoad;

/** Site and terrain routes that answer like the static providers do. */
export function usePlannerHandlers(): { readonly created: unknown[] } {
  const created: unknown[] = [];
  apiServer.use(
    http.post(`${TEST_API_URL}/site-features`, async ({ request }) => {
      const body = (await request.json()) as { parkName?: string };
      if (body.parkName !== undefined && body.parkName !== SITE.parkName) {
        return HttpResponse.json(
          { error: { kind: 'not-found', message: 'No park', requestId: 'r1' } },
          { status: 404 },
        );
      }
      return HttpResponse.json({ ...SITE, parkName: body.parkName ?? null });
    }),
    http.post(`${TEST_API_URL}/terrain`, () => HttpResponse.json(TERRAIN, { status: 201 })),
    http.post(`${TEST_API_URL}/projects`, async ({ request }) => {
      created.push(await request.json());
      const example = (await (await fetch(`${TEST_API_URL}/projects/example`)).json()) as object;
      return HttpResponse.json(example, { status: 201 });
    }),
  );
  return { created };
}
