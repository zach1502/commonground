# CommonGround

CommonGround is a web app where the residents of a city design a park on real terrain in 3D. Residents then vote on each other's designs, and the city's park planners see the results on an insights page. This repo is a demonstration built from public data. Nobody runs it as a service.

The demo parcel is Jonathan Rogers Park, a 1.4 ha neighbourhood park in Mount Pleasant, Vancouver. The terrain is a 176 by 86 m grid of bare-earth elevations at 1 m, recorded from NRCan HRDEM. The site has 22 public trees and a community garden with 56 plots. [docs/WHY.md](docs/WHY.md) explains why this park.

The editor and the design page draw the streets, sidewalks and bus stops around the park, and the Map layers button adds bike routes and parking. A path end placed near a sidewalk snaps to the park edge facing it.

On a submitted design, Review this design lets a resident tap an item, a path or an area and leave a comment such as Move or Keep. Planners see these comments under each element on the insights page and download them as CSV. Walk the park drops the camera to eye height at an entrance, and Escape returns to the overview. The vote card offers Walk the park too.

## Quick start on your laptop

You need Node 20.18 or later and pnpm through corepack. See [CONTRIBUTING.md](CONTRIBUTING.md) if `corepack enable` fails.

```sh
corepack enable
pnpm install
pnpm run doctor
pnpm dev:local
```

Open http://localhost:5173. The API listens on http://localhost:8787.

`pnpm dev:local` runs the whole app with no accounts. Until you add a Gemini key, only the browser's map tiles use the network:

- The terrain and site features come from the recorded files in `packages/terrain/fixtures/jonathan-rogers`.
- The database is pglite, an embedded Postgres kept in `.data/parkshape` at the repo root.
- Blobs are files in `.data/blobs`, through `BLOB_STORE=local-fs`, and sign-in uses the mock personas.
- With no `AI_API_KEY`, the fixed rules write the summary and read Describe it text. The API logs one line at start-up to say so.
- `PARKSHAPE_OFFLINE=1` makes every outbound request from the API fail, so a hidden network call shows up at once. A `.env` file can set it to `0`.
- `VITE_MAP_TILES=osm-raster` draws the OpenStreetMap basemap, which the new project wizard needs to find a park. Set `VITE_MAP_TILES=static` in `.env` for a plain fill with no network. The browser tests set `static`.
- With `AUTH_SECRET` empty, the API keeps a generated session secret in `.data/parkshape.auth-secret`, so you stay signed in across restarts.
- `dev:local` runs `pnpm seed` first. The seed writes the heightmap and thumbnails to `.data/blobs`, so the dev API serves the thumbnails and measures on the real heightmap. A seed rerun redraws any thumbnail that is missing. If a 3D thumbnail fails twice, the seed draws the plan poster for that design.

To have Gemini answer on your laptop, put your key from https://aistudio.google.com/apikey after `AI_API_KEY=` in `.env` at the repo root, and keep `PARKSHAPE_OFFLINE=0` there. Git ignores `.env`, and `pnpm dev:local` reads it before it starts. Only the Gemini calls and the browser's map tiles leave the laptop, because the terrain and site data stay static. The seed and the browser tests always use the fixed rules.

```sh
AI_API_KEY=
PARKSHAPE_OFFLINE=0
```

`pnpm dev` runs the same apps through turbo with the values in `.env.example`, which also need no accounts.

## Quick start on the hosted stack

The deployed setup has three parts:

- The web app is static files on Vercel.
- The API is one Vercel function in `yul1`, which is Montréal, AWS `ca-central-1`. Vercel lists the region codes at https://vercel.com/docs/regions.
- Postgres and blob storage are one Supabase project in `ca-central-1`, Canada (Central).

Nothing here has been deployed from this repo yet. The steps below are the checklist.

### Supabase

1. Create a project and choose the region Canada (Central), `ca-central-1`.
2. In Storage, create a private bucket named `parkshape`.
3. In Connect, copy the transaction pooler connection string on port 6543. Add `?sslmode=require` to the end. This is `DATABASE_URL`.
4. In Project settings, API, copy the project URL and the `service_role` secret. These are `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`.

The API applies the migrations in `packages/db/drizzle` when it starts, so the tables need no manual step. The Postgres adapter is postgres-js with prepared statements off, which the transaction pooler needs. The blob adapter calls the Storage REST API with fetch. Neither uses the Supabase SDK.

### Vercel

Make two Vercel projects from this repo. Set Root Directory to `apps/api` for one and `apps/web` for the other. Keep "Include source files outside of the Root Directory" on, because both build the workspace packages.

`apps/web/vercel.json` proxies `/api/*` to `https://parkshape-api.vercel.app`. The browser then sees one origin, and the `SameSite=Lax` session cookie works. If your API project gets a different URL, change that rewrite.

Set `ENABLE_EXPERIMENTAL_COREPACK=1` on both projects, so Vercel installs the pnpm version pinned in `package.json`. Then set these variables on the API project:

| Variable                 | Value                                                     |
| ------------------------ | --------------------------------------------------------- |
| `DATABASE_URL`           | The Supabase pooler string, ending in `?sslmode=require`  |
| `BLOB_STORE`             | `supabase`                                                |
| `SUPABASE_URL`           | `https://<project-ref>.supabase.co`                       |
| `SUPABASE_SERVICE_KEY`   | The `service_role` secret. Mark it sensitive              |
| `SUPABASE_BUCKET`        | `parkshape`                                               |
| `AUTH_SECRET`            | 32 or more random characters. Mark it sensitive           |
| `STAFF_ACCESS_CODE`      | 8 or more random characters. Mark it sensitive            |
| `VITE_API_URL`           | `https://<web-project>.vercel.app/api`, for blob URLs     |
| `CORS_ORIGIN`            | `https://<web-project>.vercel.app`                        |
| `TERRAIN_PROVIDER`       | `static`, or `chain` to fetch HRDEM for new parcels       |
| `SITE_FEATURES_PROVIDER` | `static`, or `vancouver` for Vancouver Open Data          |
| `AI_PROVIDER`            | `openai-compatible` (default) for Gemini, or `rule-based` |
| `AI_FALLBACK_MODEL`      | `gemini-3.1-flash-lite` (default), asked after a 429      |
| `RATE_LIMIT_STORE`       | `postgres`, so every function instance shares the counts  |
| `TRUST_PROXY`            | `true`, so sign-in limits count by the address Vercel saw |

Set these variables on the web project. Vite reads them at build time.

| Variable                   | Value                                  |
| -------------------------- | -------------------------------------- |
| `VITE_API_URL`             | `https://<web-project>.vercel.app/api` |
| `VITE_MAP_TILES`           | `osm-raster`                           |
| `VITE_FEATURE_TERRAFORM`   | `true`                                 |
| `VITE_FEATURE_DESCRIBE_IT` | `true`                                 |

`AUTH_SECRET` signs the session cookie. Every function instance must share it, or residents are signed out when a request reaches another instance. Make one with `openssl rand -base64 48`. With a `https://` `CORS_ORIGIN` the cookie is `Secure`, and a session lasts 7 days.

`STAFF_ACCESS_CODE` is the code the planner types on `/staff/login`, and the API does not start without it unless `CORS_ORIGIN` is localhost or 127.0.0.1.

Gemini writes the summary and reads Describe it text once `AI_API_KEY` holds the Gemini API secret, marked sensitive. `AI_PROVIDER` defaults to `openai-compatible`, and `AI_BASE_URL` and `AI_MODEL` default to Gemini's OpenAI-compatible endpoint and `gemini-3.5-flash-lite`. When that model answers 429 (rate limited), the API asks `AI_FALLBACK_MODEL`, which defaults to `gemini-3.1-flash-lite`. Gemini counts free-tier limits per model, so the fallback model has its own quota. The API then skips the limited model for as long as Gemini asked, up to 15 minutes, or 60 s if Gemini did not say. Any other error goes straight to the fixed rules. With no key, or when both models fail, the API uses the fixed rules, and the pages say the rules wrote that answer. When a model answers, the pages name the model that did.

Each function instance keeps its own leaderboard for up to 5 s, the page's poll interval, and a vote clears it on the instance that took the vote. Another instance can show that vote up to 5 s later, which is when the next poll would show it anyway. Each instance also measures submits on up to 4 worker threads of its own, so the raster work never holds up other requests.

Every other variable keeps its default from `.env.example`. Then deploy, API first:

```sh
npm i -g vercel
vercel login
cd apps/api && vercel link && vercel --prod
cd ../web && vercel link && vercel --prod
```

After each deploy, check it:

1. `curl https://parkshape-api.vercel.app/health` returns `{"ok":true}`, and `/ready` returns `{"ready":true}` once the database answers. While it does not, `/ready` answers 503.
2. `curl https://<web-project>.vercel.app/api/auth/personas` returns 7 personas.
3. The web app loads `/projects` on a hard refresh, which proves the fallback to `/index.html`.
4. A staff persona can build the terrain for a new project. This proves the function bundle has the fixture files and migrations.

## Commands

All commands run from the repo root.

| Command              | What it does                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `pnpm dev:local`     | Runs the API on pglite and the web app. Reads `.env` for a Gemini key.                   |
| `pnpm seed`          | Seeds Jonathan Rogers Park: 30 designs, 350 votes, 26 self reports.                      |
| `pnpm e2e`           | Runs the golden paths, smoke, voting, editor bug, context layer, review and scene specs. |
| `pnpm dev`           | Runs the web app and API in watch mode through turbo.                                    |
| `pnpm build`         | Builds every package and app.                                                            |
| `pnpm test`          | Runs unit, contract and integration tests, without coverage.                             |
| `pnpm test:coverage` | Runs the same tests with the coverage thresholds, as CI does.                            |
| `pnpm typecheck`     | Runs `tsc` on source and test programs in every package.                                 |
| `pnpm lint`          | Runs ESLint, Stylelint, textlint and Prettier.                                           |
| `pnpm preflight`     | Runs the repo rule checks. Add `--full` for the push and CI tier.                        |
| `pnpm run doctor`    | Checks Node, pnpm, the git hooks and the env docs.                                       |

## Browser support

Browser support: the last 2 versions of Chrome, Edge, Firefox and Safari. The list is `browserslist` in the root `package.json`, and `apps/web/vite.config.ts` turns it into the esbuild `build.target`. The Playwright specs run in Chromium only. The 3D views need WebGL2. Without it they show a message and a link to the design pictures, and voting works from the pictures.

## Docs

- [AGENTS.md](AGENTS.md) has the working rules for code, tests and packages.
- [DESIGN.md](DESIGN.md) has the visual and interaction rules.
- [CONTENT.md](CONTENT.md) has the rules for UI text and docs.
- [CONTRIBUTING.md](CONTRIBUTING.md) has setup, commits and preflight.
- [docs/ADAPTERS.md](docs/ADAPTERS.md) lists each port and its adapters, and shows how to add one.
- [docs/DEMO.md](docs/DEMO.md) is the 3-minute demo script.
- [docs/WHY.md](docs/WHY.md) covers the park, the engagement and what planners get.
- [docs/SECURITY.md](docs/SECURITY.md) has the threat model, the tests behind it and what is not protected.
- [docs/STATUS.md](docs/STATUS.md) records each gate's last result and the steps left before the first push.

## Data

Site data is from Vancouver Open Data under the Open Government Licence - Vancouver. Streets, sidewalks, bikeways and parking meters are from Vancouver Open Data under the Open Government Licence - Vancouver. Bus stops are from TransLink GTFS, used by permission of TransLink. Garden and building outlines are from OpenStreetMap under the ODbL, for planner review only. Ground heights are from NRCan HRDEM, with NRCan MRDEM as the fallback, under the Open Government Licence - Canada. 3D models are CC0 from Kenney, Quaternius and Poly Pizza.
