import { describe, expect, it } from 'vitest';

import { loadConfigFromProcess } from '@parkshape/config';

import { connectDatabase } from '../adapters/drizzle/index.js';
import { resultRows } from '../adapters/drizzle/migrations.js';

import { createScratchDatabase } from './scratch-database.js';

// Port 1 on loopback refuses at once, so the failure path needs no server.
const REFUSED_URL = 'postgres://parkshape:unused@127.0.0.1:1/parkshape';
const SERVER_URL = loadConfigFromProcess().PARKSHAPE_TEST_DATABASE_URL;
const SCRATCH_NAME = /\/parkshape_test_[0-9a-f]{32}$/;

describe('createScratchDatabase', () => {
  it('fails when the server refuses the connection', async () => {
    await expect(createScratchDatabase(REFUSED_URL)).rejects.toMatchObject({
      code: 'ECONNREFUSED',
    });
  });

  it.skipIf(SERVER_URL === '')(
    'creates an empty database on the server and drops it again',
    async () => {
      const scratch = await createScratchDatabase(SERVER_URL);
      expect(scratch.url).toMatch(SCRATCH_NAME);
      const connection = await connectDatabase(scratch.url);
      const rows = resultRows(await connection.db.execute('select current_database() as name'));
      expect(scratch.url.endsWith(`/${String(rows[0]?.name)}`)).toBe(true);
      await connection.close();
      await scratch.drop();
      await expect(connectDatabase(scratch.url).then((c) => c.migrate())).rejects.toMatchObject({
        cause: { code: '3D000' },
      });
    },
  );
});
