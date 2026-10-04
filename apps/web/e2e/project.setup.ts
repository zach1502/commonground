import { test } from '@playwright/test';

import { defaultParameters } from '@parkshape/core';

import { BASELINE } from './editor-fixtures.ts';
import { API_URL } from './urls.ts';

const STAFF_PERSONA = 'persona-paula-blueprint';
const PARCEL_SIDE_M = 120;

// Runs as the setup project, before every other test, against the fresh in-memory API.
test('create the demo project as staff', async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: API_URL });
  const login = await api.post('/auth/login', { data: { persona: STAFF_PERSONA } });
  if (!login.ok()) {
    throw new Error(`staff login failed: ${String(login.status())}`);
  }
  const created = await api.post('/projects', {
    data: {
      name: 'Jonathan Rogers Park',
      parameters: defaultParameters(),
      parcel: {
        id: 'jonathan-rogers',
        name: 'Jonathan Rogers Park',
        origin: { lat: 49.2637, lon: -123.0972 },
        polygon: [
          { x: 0, y: 0 },
          { x: PARCEL_SIDE_M, y: 0 },
          { x: PARCEL_SIDE_M, y: PARCEL_SIDE_M },
          { x: 0, y: PARCEL_SIDE_M },
        ],
      },
      heightmapRef: 'terrain/jonathan-rogers.bin',
      baselineDocument: BASELINE,
    },
  });
  if (!created.ok()) {
    throw new Error(`project setup failed: ${String(created.status())} ${await created.text()}`);
  }
  await api.dispose();
});
