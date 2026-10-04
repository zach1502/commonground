# Contributing

This guide covers setup, commits, tests and the two most common extension tasks. The rules for code live in [AGENTS.md](AGENTS.md), for UI in [DESIGN.md](DESIGN.md) and for words in [CONTENT.md](CONTENT.md).

## Setup

You need Node 20.18 or later. The exact version is in `.nvmrc`.

Enable corepack so the pinned pnpm version is used. The corepack 0.29.4 bundled with Node 20.18 fails with "Cannot find matching keyid" because npm rotated its signing keys. Run the newer corepack through npx instead:

```sh
npx corepack@0.34.7 corepack enable
```

If your bundled corepack is newer and works, `corepack enable` is enough.

Then install and check your setup:

```sh
pnpm install
pnpm run doctor
```

`pnpm run doctor` checks Node, pnpm, the git hooks and the env documentation. Fix what it reports before you start. Type `run`: pnpm 12 has a built-in `pnpm doctor` that checks pnpm itself and hides the repo script.

## Branches and commits

Branch from `main`. Name the branch after the change, for example `feat/path-grade-ribbon`.

Commits follow Conventional Commits. The header is in the imperative mood and at most 72 characters, for example `feat(terrain): compute cut and fill per cell`. commitlint checks the header length and the content rules on every commit.

## First commit

The repo starts with no commits. Make the first six commits in the order below, through the hooks. Do not pass `--no-verify`. Install first, so husky sets up the hooks:

```sh
pnpm install --frozen-lockfile
pnpm prepare
```

Then run each `git add` line and commit it with the message after it.

```sh
git add .dependency-cruiser.cjs .env.example .gitignore .jscpd.json .nvmrc .prettierignore .prettierrc .textlintignore .textlintrc.json commitlint.config.js eslint.config.js knip.json lint-staged.config.js package.json pnpm-lock.yaml pnpm-workspace.yaml stylelint.config.js tsconfig.base.json tsconfig.json tsconfig.web.json turbo.json vitest.config.ts vitest.shared.config.ts vitest.workspace.ts .husky .github tools/preflight tools/eslint-rules tools/textlint-rules tools/dev-local.sh AGENTS.md CONTENT.md CONTRIBUTING.md DESIGN.md README.md docs
git commit -m 'build: add workspace, preflight rules, hooks and CI'

git add packages/core packages/config
git commit -m 'feat(core): add design schema, metrics, solver and config'

git add packages/terrain tools/asset-pipeline apps/web/public/models
git commit -m 'feat(terrain): load HRDEM terrain and site data for the parcel'

git add packages/db ':(exclude)packages/db/seed' packages/storage packages/auth packages/ai packages/api-client apps/api ':(exclude)apps/api/vercel.json'
git commit -m 'feat(api): add repositories, blob store, auth, AI and the Hono API'

git add packages/ui packages/scene apps/web ':(exclude)apps/web/vercel.json'
git commit -m 'feat(web): add the editor, voting, planner and insights pages'

git add tools/seed packages/db/seed e2e playwright.config.ts apps/api/vercel.json apps/web/vercel.json
git commit -m 'feat(seed): seed the demo park, add golden paths and Vercel config'
```

Each commit keeps a package's tests with its source, so tdd-pairing passes without `[no-test]`. After the sixth commit, `git status --short` prints nothing.

On a laptop, the install takes about 50 seconds, or about 75 seconds with an empty pnpm store, and each commit takes 2 to 3 minutes. The first commit builds every package, which takes about 30 seconds. Later commits reuse the turbo cache. Most of the time goes to `vitest --changed`, about 90 seconds. It counts files that are not committed yet as changed, so it runs every test file on each of the six commits. That was 374 files in the rehearsal on 2026-10-03, and the tree now has 481.

If a hook fails, the commit is not made and the staged files stay staged. Fix the cause, run `git add` on the fixed files and commit again with the same message.

- turbo build: the hook builds the whole working tree, not only the staged files. Run `pnpm build` to see the error.
- lint-staged: on the first commit it skips its backup, so fixes from `eslint --fix` and `prettier --write` stay in your working tree. Check them with `git diff`, then stage them.
- `vitest --changed`: run the failing file with `pnpm vitest run <file>`.
- `preflight --quick`: each finding prints a fix line. Follow it.
- commit-msg: commitlint prints the rule and the word it rejected. Rewrite the message. For tdd-pairing, stage the package's tests with its source.

The pre-push hook runs `pnpm test:quick`, then `pnpm preflight --full`, which takes about 3 minutes together. It fails on `todo-audit` until the 5 placeholder designs under `packages/db/seed/showcase` are written.

## Test first

1. Write a test for the behaviour you want.
2. Run it and watch it fail for the reason you expect.
3. Write the code that makes it pass.
4. Commit the test and the code together.

A commit with no test change needs `[no-test]` and an issue link in the message, for example `docs: fix link in README [no-test] #12`.

## Tests

Pick the run that fits the moment.

| Command              | What it runs                                                                    | When to use it                      |
| -------------------- | ------------------------------------------------------------------------------- | ----------------------------------- |
| `pnpm test:quick`    | The unit tests of the packages you changed and the packages that depend on them | While you work, and on push         |
| `pnpm test`          | Every package's unit, contract and integration tests, without coverage          | Before you push                     |
| `pnpm test:coverage` | The same tests with the coverage thresholds                                     | In CI, or to check a coverage gap   |
| `pnpm e2e`           | The golden paths, the smoke, voting and editor bug specs, and the scene checks  | After a UI or API change, on demand |

`pnpm test:quick` reads `git status`, so new files count before the first commit. A change to a shared file such as `turbo.json`, `package.json` or `vitest.shared.config.ts` runs every package. It turns coverage off, as `pnpm test` does, so a coverage gap shows up only in `pnpm test:coverage`.

Turbo skips a package whose files have not changed since its last green run and replays that run's output. Files in a package's `e2e/` folder are not inputs to its unit tests. A test that reads a file outside its own package names that file in the package's `turbo.json`, so a change to it runs the test again. Run `pnpm turbo run test --force` to run everything anyway.

Packages whose tests leave `process.env`, the working directory and native addons alone run in worker threads (`pool: 'threads'` in their `vitest.config.ts`). Each test file still gets a fresh module graph. Keep a package on the default child processes if its tests change process state, start an embedded database or load a library that starts its own workers.

ESLint, Prettier, Stylelint and textlint keep caches in `node_modules/.cache`, so a second `pnpm lint` checks only the changed files. ESLint's cache can miss a typed-rule error that a change in another file's types causes, so `pnpm preflight --full`, which the pre-push hook and CI run, lints every file without it. Delete `node_modules/.cache/eslint` if a lint result looks stale.

## Preflight tiers

Preflight runs at three tiers.

| Tier     | When it runs                               | Command                  |
| -------- | ------------------------------------------ | ------------------------ |
| Quick    | On every commit, from the pre-commit hook  | `pnpm preflight --quick` |
| Standard | By hand                                    | `pnpm preflight`         |
| Full     | On push, from the pre-push hook, and in CI | `pnpm preflight --full`  |

The quick tier checks the staged files. The standard tier checks the working tree against HEAD. The full tier, and any run in CI, checks every file changed since the merge base with `origin/main`. When `PARKSHAPE_BASE_REF` names a commit, that commit is the base instead. CI sets it to the pull request's base commit or to the commit before a push. When `origin/main` is HEAD, as on a push to main, the base is `HEAD~1`.

The commit-msg hook runs `pnpm preflight --commit-msg`. It runs commitlint on the new message and checks test pairing for the staged files. Only the new message can carry `[no-test]`, so the quick tier warns about unpaired files and the commit-msg hook fails them. In the full tier, `[no-test]` covers only the files of the commit whose message carries it.

In CI, a tool that is not installed is an error. Locally the tool is skipped and the REMINDERS block says so. Install gitleaks to run the secret scan on your machine.

`--skip-preflight` exists for local emergencies. CI refuses it.

## Add an adapter

1. Find or write the port interface in `packages/<pkg>/src/ports`.
2. Add the adapter file in `packages/<pkg>/src/adapters`. This is the only place its vendor SDK is imported.
3. Add the adapter's value to the provider enum in `packages/config/src/env.ts`.
4. Add or update the variable in `.env.example`, with a comment above it.
5. Run the port's contract test from `packages/<pkg>/src/ports/__contracts__` against the new adapter.
6. Wire the adapter in `apps/api/src/container.ts`, or in `apps/web/src/app-deps.ts` for a browser adapter.

Tests that call the real service go under `__live__` and are tagged `@live`.

## Change the API or the database

1. Change the route in `apps/api/src/routes` and its zod schemas in `apps/api/src/contracts`.
2. Run `pnpm --filter @parkshape/api openapi:gen` to rewrite `apps/api/openapi.json`.
3. Run `pnpm --filter @parkshape/api-client generate` to rewrite the typed client and the MSW handlers in `packages/api-client/src/generated`.
4. After a schema change in `packages/db/src/adapters/drizzle/schema`, run `pnpm --filter @parkshape/db exec drizzle-kit generate` and commit the new files in `packages/db/drizzle`. The API applies them when it starts.

A test in `apps/api` fails when `openapi.json` is out of date, and the `openapi-drift` rule fails when the client is.

The db and API tests use pglite unless you set `PARKSHAPE_TEST_DATABASE_URL` to a Postgres server URL. Then each test file makes its own database there and drops it at the end, so the same contract and integration tests run on real Postgres. CI does this on a Postgres 16 service. To do it on your laptop, start a Postgres 16 server and run `PARKSHAPE_TEST_DATABASE_URL=postgres://localhost:5432/postgres pnpm turbo run test --filter=@parkshape/db --filter=@parkshape/api`. `pnpm --filter @parkshape/db migrate` applies the migrations at `DATABASE_URL`, the same step the API runs when it starts. `migrate:down` rolls back the newest one with its file in `packages/db/drizzle/down`, so write a down file for each new migration. Both commands need `AUTH_SECRET` for a `postgres://` URL. With the URL set and `initdb` and `pg_ctl` on your PATH, `apps/api/test/recovery/postgres-outage.test.ts` also starts a Postgres cluster of its own on a free port, stops it during a burst of votes, starts it again and deletes it. CI has no `pg_ctl`, so it skips that test.

## Add a preflight rule

1. Add a rule module in `tools/preflight/src/rules`.
2. Add a fixture that passes and a fixture that fails under `tools/preflight/fixtures`.
3. Write a test that runs the rule on both fixtures.
4. Run `pnpm preflight --docs` to regenerate the rule tables in the docs.

## Definition of done

- Tests were written first, and all tests are green.
- `pnpm preflight` is green.
- For UI work, `pnpm e2e` passes.
- Docs that describe the changed behaviour are updated.
- Every box in the PR template checklist is ticked or explained.
