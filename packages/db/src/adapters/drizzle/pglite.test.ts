import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resultRows } from './migrations.js';
import { connectPglite, type OpenDatabase } from './pglite.js';

// A demo room's worth of requests reaching the embedded database at once.
const BACKLOG = 400;
const START_TIMEOUT_MS = 60_000;

let connection: OpenDatabase;

beforeAll(async () => {
  connection = connectPglite('pglite://memory');
  await connection.db.execute(sql`create table counter (id int primary key, n int not null)`);
  await connection.db.execute(sql`insert into counter values (1, 0)`);
}, START_TIMEOUT_MS);

afterAll(async () => {
  await connection.close();
});

function bump(db: OpenDatabase['db']) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select n from counter where id = 1 for update`);
    await tx.execute(sql`update counter set n = n + 1 where id = 1`);
  });
}

describe('pglite under a backlog', () => {
  it('lets the event loop run timers and I/O while queued queries drain', async () => {
    let timerRan = false;
    let queriesLeftWhenTimerRan = -1;
    let left = BACKLOG;
    setTimeout(() => {
      timerRan = true;
      queriesLeftWhenTimerRan = left;
    }, 0);
    await Promise.all(
      Array.from({ length: BACKLOG }, async () => {
        await bump(connection.db);
        left -= 1;
      }),
    );
    expect(timerRan).toBe(true);
    expect(queriesLeftWhenTimerRan).toBeGreaterThan(0);
  });

  it('still runs each transaction alone, so no update is lost', async () => {
    const rows = resultRows(await connection.db.execute(sql`select n from counter where id = 1`));
    expect(rows).toEqual([{ n: BACKLOG }]);
  });
});
