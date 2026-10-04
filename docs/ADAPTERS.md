# Adapters

Every outside service in CommonGround sits behind a port. A port is a TypeScript interface in `packages/<pkg>/src/ports`. An adapter implements the port in `packages/<pkg>/src/adapters`, and that folder is the only place its vendor code lives. Each port has a contract test in `src/ports/__contracts__`, and every adapter for that port runs it.

The two composition roots are `createApiContainer` in `apps/api/src/container.ts` for the API and `apps/web/src/app-deps.ts` for the web app's map tiles. Both read the typed config that `packages/config/src/env.ts` parses. The API container picks the blob store and rate-limit store itself, and calls each package's own factory for the rest: `createTerrainProvider`, `createSiteFeaturesProvider` and `createSiteContextProvider` in `packages/terrain/src/select-providers.ts`, and `createAi` in `packages/ai/src/create-ai.ts`. Only these files turn a provider name into an adapter.

## Ports and their adapters

| Port                                | Package   | Adapters                                                                             | Selected by                                                   |
| ----------------------------------- | --------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `TerrainProvider`                   | `terrain` | static, HRDEM COG, MRDEM COG, chain                                                  | `TERRAIN_PROVIDER`                                            |
| `SiteFeaturesProvider`              | `terrain` | static, Vancouver Open Data                                                          | `SITE_FEATURES_PROVIDER`                                      |
| `SiteContextProvider`               | `terrain` | static, Vancouver context with TransLink, in-memory                                  | `SITE_CONTEXT_PROVIDER`                                       |
| Repositories, with element comments | `db`      | Drizzle on pglite, Drizzle on postgres-js, in-memory                                 | `DATABASE_URL` scheme                                         |
| `RateLimitStore`                    | `db`      | in-memory, Postgres table `rate_limit_buckets`                                       | `RATE_LIMIT_STORE`                                            |
| `BlobStore`                         | `storage` | in-memory, Supabase Storage, local disk                                              | `BLOB_STORE`                                                  |
| `AuthProvider`                      | `auth`    | mock personas                                                                        | `AUTH_PROVIDER`, which has only `mock` today                  |
| `SummaryProvider`                   | `ai`      | rule-based, model-backed with the rule-based fallback                                | `AI_PROVIDER`                                                 |
| `IntentProvider`                    | `ai`      | rule-based, model-backed with the rule-based fallback                                | `AI_PROVIDER`                                                 |
| `LlmClient`                         | `ai`      | OpenAI-compatible HTTP, a model chain that moves on after a 429, fake canned answers | `AI_PROVIDER`, `AI_BASE_URL`, `AI_MODEL`, `AI_FALLBACK_MODEL` |
| `MapTileSource`                     | `ui`      | OpenStreetMap raster, static fill                                                    | `VITE_MAP_TILES`                                              |
| `Clock` and `Random`                | `core`    | system clock, fake clock, seeded random                                              | Tests pass the fakes through the container                    |
| `MetricsRunner`                     | `api`     | worker threads, inline                                                               | The container: threads in the API, inline in tests            |

Notes on the table:

- `DATABASE_URL=pglite://memory` keeps the database in memory, `pglite://<dir>` keeps it on disk, and `postgres://` connects to a server. A Supabase database is a `postgres://` URL, so it needs no adapter of its own.
- The in-memory repositories back the OpenAPI generator and the fast unit tests. No env value picks them.
- Element comments are one more repository, `ElementCommentRepository`, with the same three adapters. Its contract in `packages/db/src/ports/__contracts__/element-comment-repository.contract.ts` runs on memory and on pglite, and the guarded write rechecks the project phase inside the statement, as votes do.
- Comments spend a `comments` bucket in the same `RateLimitStore`, keyed by person, at `RATE_LIMIT_COMMENTS_PER_MINUTE` (10 by default).
- `RATE_LIMIT_STORE=postgres` keeps the rate-limit buckets in the `DATABASE_URL` database, so every Vercel function instance counts against the same buckets. Each take is one `INSERT ... ON CONFLICT DO UPDATE`, so parallel requests cannot spend the same token. `memory` keeps them per process.
- `TERRAIN_PROVIDER` takes `static`, `hrdem` or `chain`. The MRDEM adapter runs only as the chain's second step, after HRDEM and before the static file.
- `BLOB_STORE=local-fs` selects the local disk blob store, which keeps files under `BLOB_DIR`. `BLOB_DIR` must be an absolute path, or the config does not load. `pnpm dev:local` uses `.data/blobs`.
- The AI adapters also include an in-memory cache and logger. They are internal to `packages/ai`.
- `AI_PROVIDER` defaults to `openai-compatible`, so the API calls Gemini once `AI_API_KEY` is set. With no key the fixed rules answer, and the API logs one line at start-up to say so. With `PARKSHAPE_OFFLINE=1` every model call fails and the fixed rules answer. `AI_BASE_URL` defaults to `https://generativelanguage.googleapis.com/v1beta/openai` and `AI_MODEL` to `gemini-3.5-flash-lite`. Set both to use OpenAI or another server with the same API.
- `AI_FALLBACK_MODEL` defaults to `gemini-3.1-flash-lite`. When it names another model, `createAi` wraps one HTTP client per model in `ModelChainClient`. The chain asks the next model only after an HTTP 429. Any other error goes to the fixed rules at once, so a bad request does not spend the second model's quota too. Gemini counts free-tier limits per model, so the fallback model has its own quota.
- After a 429 the chain skips that model until its cooldown ends on the injected clock. The cooldown comes from the `Retry-After` header in seconds, else the `retryDelay` in Gemini's error body, else 60 s. It is never more than 15 minutes, so a model held by a daily limit is tried again now and then. Each skip and each 429 logs one line with the model and the seconds left.
- Each completion names the model that answered, so a summary or intent from the fallback names `gemini-3.1-flash-lite`. Every model call gets its own 15 s timeout.
- `pnpm seed` and the e2e API in `tools/seed` set `AI_PROVIDER=rule-based` in code, whatever `.env` says. The seed sends no text to Describe it or the summary, and the browser tests never call Gemini.
- The client sends a cut-down copy of each JSON schema, with only the keywords Gemini accepts. zod still checks every answer against the full schema.
- Each summary and intent says who wrote it: the fixed rules, or the model by name. A failed model call falls back to the rules and says so. Only model answers are cached, so the next request asks the model again.
- A failed call logs one line with the error kind. For an HTTP error the line also has the status and the first 200 characters of the reply, with the secret taken out. Any copy of the prompt or the resident's text in the reply becomes `[prompt]` before the cut to 200 characters.
- The terrain `CacheStore` port keeps fetched grids between runs. It has the same `get` and `put` as `BlobStore`, so the API passes its blob store in.
- The worker-thread `MetricsRunner` starts one worker per core minus 1, at least 1 and at most 4. A worker starts on the first submit that needs it, so on a 1-vCPU Vercel function the first submit also pays for starting 1 worker. A job gives up after 10 s from when it was asked for, and a worker is replaced only after one job has run on it for 10 s.
- `PARKSHAPE_OFFLINE=1` swaps the fetch that every network adapter uses for one that always fails. It is a switch for the whole API, not an adapter.

## Where each adapter talks to the network

| Adapter                              | Calls                                               |
| ------------------------------------ | --------------------------------------------------- |
| HRDEM and MRDEM COG                  | The NRCan STAC catalogue and the COG files it names |
| Vancouver Open Data                  | The City of Vancouver open data API                 |
| Vancouver context and TransLink GTFS | The city API and the TransLink GTFS static zip      |
| Drizzle on postgres-js               | The Postgres server in `DATABASE_URL`               |
| Supabase Storage                     | `<SUPABASE_URL>/storage/v1/object/<bucket>/<key>`   |
| OpenAI-compatible client             | `<AI_BASE_URL>/chat/completions`, Gemini by default |
| OpenStreetMap raster                 | The OpenStreetMap tile servers, from the browser    |

Every other adapter works with no network.

## Add an adapter in five steps

1. Write the adapter in `packages/<pkg>/src/adapters/<name>.ts`. Import the vendor SDK or call the vendor API here and nowhere else. Take `fetch` as an option so tests can replace it.
2. Write the adapter's test next to it. Call the port's contract function from `src/ports/__contracts__` with a factory that builds your adapter. Run it and watch it fail before the adapter exists.
3. Add the adapter's name to the provider enum in `packages/config/src/env.ts`. Add any new variables to the schema and to `.env.example`, each with a comment above it.
4. Add a `case` for the new name where that port is chosen: the package's factory, such as `createTerrainProvider`, `selectBlobStore` in `apps/api/src/container.ts`, or `apps/web/src/app-deps.ts` for a browser adapter. Add a test that the container returns your adapter for that config.
5. Run `pnpm preflight`. The `port-contract-coverage` rule fails if an exported adapter never runs the contract, and `env-documented` fails if the schema and `.env.example` disagree.

Tests that call the real service go in a `__live__` folder, are tagged `@live`, and run only with `PARKSHAPE_LIVE=1`.

## Worked example: swap the blob store to a sponsor product

This example adds a blob store for a sponsor's object storage, called Acme Objects here. Acme Objects has a REST API: `PUT /buckets/<bucket>/objects/<key>` stores bytes, and `GET` on the same path returns them or HTTP 404. The Supabase Storage adapter in `packages/storage/src/adapters/supabase-storage-blob-store.ts` follows the same shape and is a good model.

Step 1 is the adapter, `packages/storage/src/adapters/acme-objects-blob-store.ts`:

```ts
import { assertBlobKey, BlobStoreRequestError, blobUrl } from '../ports/blob-store.js';
import type { BlobStore, StoredBlob } from '../ports/blob-store.js';

export interface AcmeObjectsBlobStoreOptions {
  readonly endpoint: string;
  readonly token: string;
  readonly bucket: string;
  readonly publicBaseUrl: string;
  readonly fetch: (url: string, init?: RequestInit) => Promise<Response>;
}

const HTTP_NOT_FOUND = 404;

export class AcmeObjectsBlobStore implements BlobStore {
  constructor(private readonly options: AcmeObjectsBlobStoreOptions) {}

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const response = await this.options.fetch(this.objectUrl(key), {
      method: 'PUT',
      headers: { authorization: `Bearer ${this.options.token}`, 'content-type': contentType },
      body: bytes.slice(),
    });
    if (!response.ok) throw new BlobStoreRequestError('put', key, response.status);
  }

  async get(key: string): Promise<StoredBlob | undefined> {
    const response = await this.options.fetch(this.objectUrl(key), {
      headers: { authorization: `Bearer ${this.options.token}` },
    });
    if (response.status === HTTP_NOT_FOUND) return undefined;
    if (!response.ok) throw new BlobStoreRequestError('get', key, response.status);
    const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
    return { bytes: new Uint8Array(await response.arrayBuffer()), contentType };
  }

  url(key: string): string {
    return blobUrl(this.options.publicBaseUrl, key);
  }

  private objectUrl(key: string): string {
    return `${this.options.endpoint}/buckets/${this.options.bucket}/objects/${assertBlobKey(key)}`;
  }
}
```

Step 2 is the test, `acme-objects-blob-store.test.ts`. It fakes the two endpoints with a `Map` and runs the contract:

```ts
blobStoreContract('AcmeObjectsBlobStore', () =>
  Promise.resolve(
    new AcmeObjectsBlobStore({
      endpoint: 'https://objects.acme.test',
      token: 'test-token',
      bucket: 'parkshape',
      publicBaseUrl: 'http://localhost:8787/blobs',
      fetch: fakeAcmeApi(),
    }),
  ),
);
```

The contract checks that a blob comes back with its bytes and content type. It checks that an object that was never stored returns `undefined`, and that a second put replaces the first. It also checks that the store keeps its own copy of the bytes and refuses bad object names.

Step 3 is the config. In `packages/config/src/env.ts`, change `BLOB_STORE` to `z.enum(['memory', 'local-fs', 'supabase', 'acme'])` and add `ACME_ENDPOINT`, `ACME_TOKEN` and `ACME_BUCKET`. Add the same three keys to `.env.example`:

```sh
# Acme Objects endpoint, such as https://objects.acme.example; empty unless BLOB_STORE=acme.
ACME_ENDPOINT=
# Acme Objects API token. Server only; empty unless BLOB_STORE=acme.
ACME_TOKEN=
# Acme Objects bucket that holds the blobs.
ACME_BUCKET=parkshape
```

Step 4 is the container. Add a case to `selectBlobStore` in `apps/api/src/container.ts`:

```ts
case 'acme':
  return new AcmeObjectsBlobStore({
    endpoint: config.ACME_ENDPOINT,
    token: config.ACME_TOKEN,
    bucket: config.ACME_BUCKET,
    publicBaseUrl,
    fetch,
  });
```

Then extend `apps/api/test/offline-and-storage.test.ts` with a test that `BLOB_STORE=acme` gives an `AcmeObjectsBlobStore`.

Step 5 is `pnpm preflight`, then `pnpm test`. To switch a deployment, set `BLOB_STORE=acme` and the three `ACME_` values on the API project. No route, service or UI code changes, because every caller holds a `BlobStore`.
