# Status

This page records where CommonGround stands against the definition of done in [AGENTS.md](../AGENTS.md). Every result below comes from a verification report in `.yolo-sisyphus/handoff/`, named in the last column. The repo has no commits yet, and nothing has been deployed.

## Gates

All runs used Node 20.18.1 and pnpm 12.6.0 on a 10-core laptop.

| Gate                                 | Command                                                                    | Last result                                                                                                                                            | Date       | Report             |
| ------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------------------ |
| Lint                                 | `pnpm lint`                                                                | Exit 0, 0 ESLint warnings                                                                                                                              | 2026-10-03 | verify-security.md |
| Typecheck                            | `pnpm typecheck`                                                           | Exit 0, 27 of 27 tasks                                                                                                                                 | 2026-10-03 | verify-security.md |
| Unit, contract and integration tests | `pnpm turbo run test --force`                                              | Exit 0, 28 of 28 tasks, 4192 tests passed, 116 s. The metrics worker crash test now fires the pool's timers by hand, so it no longer races wall time   | 2026-10-04 | cut-tests.md       |
| The same tests with coverage         | `pnpm turbo run test:coverage --force`                                     | Exit 0, 28 of 28 tasks, 130 s. The thresholds are unchanged                                                                                            | 2026-10-04 | cut-tests.md       |
| API security and recovery probes     | `pnpm --filter @parkshape/api exec vitest run test/security test/recovery` | 151 passed and 1 skipped in 15 files: 115 security, 36 recovery. With `PARKSHAPE_TEST_DATABASE_URL` on a temp Postgres 16.15, 152 passed and 0 skipped | 2026-10-03 | verify-security.md |
| Dependency audit                     | `pnpm audit --audit-level high`                                            | Exit 0. 1 moderate, GHSA-67mh-4wv8-2f99 in esbuild under drizzle-kit. No high or critical                                                              | 2026-10-03 | verify-security.md |
| Build                                | `pnpm build`                                                               | Exit 0, 14 of 14 tasks                                                                                                                                 | 2026-10-03 | verify-security.md |
| Preflight, standard tier             | `pnpm preflight --standard`                                                | Exit 0, 19 rules, 0 failing, 0 warning, 1 info (gitleaks not installed), 16 s                                                                          | 2026-10-04 | cut-tests.md       |
| Preflight, full tier                 | `pnpm preflight --full`                                                    | Exit 1 as expected. 19 rules, only todo-audit fails, on the 5 placeholder files                                                                        | 2026-10-04 | cut-tests.md       |
| Playwright, kept set                 | `timeout 900 pnpm e2e`                                                     | Exit 0 in Chromium, 351 s. Golden paths 2 passed, web 21 passed with setup, scene 6 passed                                                             | 2026-10-04 | cut-tests.md       |

On 2026-10-03 the test set was cut to correctness: unit, contract and API integration tests, and a small Playwright set that runs on demand in Chromium. The performance probes, the screenshot and accessibility checks and the scripted usability rehearsal were removed, so their gates are gone. cut-tests.md lists what was kept and removed.

## Before the first push

- [ ] Write the 5 placeholder blurbs. The files are `packages/db/seed/showcase/01-cedar-shade.json` to `05-rain-garden-low.json`. In each file, replace the `blurb` value on line 6, which reads `TODO(#seed) First-person blurb with one concrete detail.`, with one first-person sentence that names one concrete detail of that design.
- [ ] Update the test at `packages/db/src/seed/plan.test.ts:146` in the same commit. It expects all 5 blurbs to read `Draft blurb`, which is what a placeholder becomes, so it fails once the blurbs are written.
- [ ] Run `pnpm lint:content` on the 5 files, because the banned words and patterns in [CONTENT.md](../CONTENT.md) apply to seed text.
- [ ] Run `pnpm preflight --full` and confirm that todo-audit passes. The rule fails the full tier, the pre-push hook and CI while any `TODO(#seed)` is left.
- [ ] Run `brew install gitleaks`. Preflight skips the secret scan until it is installed.
- [ ] Make the six commits in the order in [CONTRIBUTING.md, First commit](../CONTRIBUTING.md#first-commit), through the hooks and without `--no-verify`. The install takes about 50 s. Each commit takes 2 to 3 minutes, most of it `vitest --changed` running every test file, 481 today. After the sixth commit, `git status --short` prints nothing. The pre-push hook then runs `pnpm preflight --full`, about 6 minutes.
- [ ] Set `AUTH_SECRET` on the Vercel API project to 32 or more random characters from `openssl rand -base64 48`, and mark it sensitive. Every function instance must share it, or residents are signed out.
- [ ] Set `STAFF_ACCESS_CODE` on the Vercel API project to 8 or more random characters, mark it sensitive and give it to the project lead. The API does not start on a hosted `CORS_ORIGIN` without it, and staff type it on `/staff/login`.
- [ ] Set `RATE_LIMIT_STORE=postgres` on the Vercel API project, so every function instance counts against the same buckets in `DATABASE_URL`. The migration `0002_rate_limit_buckets.sql` makes the table when the API starts.
- [ ] Run the `@live` check of the Postgres rate-limit store against the Supabase database. The single-statement take has run only on pglite, which uses one connection.
- [ ] Set the other API and web variables from the tables in [README.md, Vercel](../README.md#vercel), then deploy the API first and run the four checks listed there.
- [ ] On the live deploy, check that Vercel accepts the `includeFiles` globs with `../../` above the Root Directory (F1). README check 4, a staff persona building the terrain for a new project, proves the bundle has the fixture files.
- [ ] On the live deploy, check that the catch-all `/(.*)` to `/api` rewrite keeps the original path for Hono (F2). README checks 1 and 2, `/health` and `/api/auth/personas`, go through this rewrite.

F1 and F2 come from verify-final-deploy.md and are still open in traceability.md.

## Known limits

- The rate limiter keeps its buckets in memory unless `RATE_LIMIT_STORE=postgres`. Old bucket rows are never deleted. Each person and action has one row, which refills to capacity, so a stale row does no harm.
- Under heavy parallel load, the pglite `beforeAll` hook in the api tests can time out. The api hook timeout is now 30 s (fix-ui-defects.md). If a forced run times out, rerun it with `--concurrency=2`. On 2026-10-03 the test `keeps the buckets in memory by default` timed out at 5 s at concurrency 4. Its harness now starts in `beforeAll`, and verify-latency.md found no harness started in a test body. On 2026-10-03 the db test `opens at once when the first migration works` in `start.test.ts` timed out the same way at 7.4 s and passed at concurrency 2 (verify-security.md).
- The Paths heatmap on the insights page draws heat across the 56 garden plots. This is real data, because designs that moved the garden put paths there.
- Root-zone hatching was a solid patch in final-review.md. It is now drawn as red stripes, with a test (verify-polish-final.md, traceability.md).
- Sign-in is a mock with 7 personas and no password, so one person can vote up to 7 times on a design. [docs/SECURITY.md](SECURITY.md) lists what is and is not protected.
- A request that times out on the database does not cancel its query, so a vote can be saved after the client got a 503 (fault-injection.md).
- The Postgres outage test runs only with `PARKSHAPE_TEST_DATABASE_URL`, `initdb` and `pg_ctl`, so CI skips it (fault-injection.md).
- The metrics worker's own failure text is no longer logged (fault-injection.md).
- The API has no CSRF token or `Origin` check. `SameSite=Lax` covers the 3 body-less writes only while the web app is on its own site, as each `*.vercel.app` name is today (docs/SECURITY.md).
- The project lead has 2 access rules to decide. Staff get 404 on a resident's draft. Guests cannot see the baseline (authz-fuzz.md).
- docs/TRACEABILITY.md lists 123 rows: 117 Present and 6 Partial, with no missing rows and no owner decisions. The partial rows are Vercel, Supabase, the seed text, todo-audit in the full tier, live meter timing and WCAG 2.1 AA.

## Known: internal identifiers still say parkshape

The product is now called CommonGround in every string a person reads. The names below are code identifiers, and they still say parkshape. Renaming one is a separate migration with deploy implications, because each is stored, deployed or imported somewhere, so it is deferred.

- The `@parkshape/*` package scope is in every import, the lockfile and the turbo filters.
- The `PARKSHAPE_*` env variables are set in CI, in `.env.example` and on hosts.
- The `.data/parkshape` pglite path holds each person's local database and session secret.
- The `parkshape_session` cookie name signs out every resident when it changes.
- The `parkshape.*` and `parkshape:*` browser storage keys hold drafts, hints and tutorial state on each device.
- The `parkshape` Supabase bucket holds the stored blobs.
- The `parkshape-api.vercel.app` host is the rewrite target in `apps/web/vercel.json`.
- The `parkshape/*` ESLint and textlint rule names are referenced from disable comments and configs.
- The `ps-` CSS class prefix and `--parkshape-*` custom properties are referenced by tests and the styleguide.
- The `window.__parkshape*` test hooks are read by the e2e and scene specs.
- The `parkshape-*` CSV download names and performance marks are read by tests.

Persona ids start with `persona-` and do not carry the old name.

## Where to look

- [AGENTS.md](../AGENTS.md) has the working rules for code, tests, packages and ports.
- [DESIGN.md](../DESIGN.md) has the visual and interaction rules.
- [CONTENT.md](../CONTENT.md) has the rules for UI text, docs and seed text, with the word list.
- [CONTRIBUTING.md](../CONTRIBUTING.md) has setup, the first six commits and preflight.
- [docs/ADAPTERS.md](ADAPTERS.md) lists each port and its adapters.
- [docs/DEMO.md](DEMO.md) is the 3-minute demo script.
- [docs/WHY.md](WHY.md) covers the park, the engagement and what planners get.
- [docs/SECURITY.md](SECURITY.md) has the threat model, its proofs and what is not protected.
- [docs/TRACEABILITY.md](TRACEABILITY.md) maps each requirement to its code and test, with status.
