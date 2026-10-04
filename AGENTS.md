# Agent instructions

CommonGround is a web app where the residents of a city design a park on real terrain and vote on each other's designs. This file is the working agreement for coding agents and people who change this repo.

## How to work here

Run `pnpm preflight --context <path>` before you edit an area you have not touched in this session. It prints the rules, ports and tests that apply to that path.

Run `pnpm preflight` before you finish any task. A task is not finished while preflight is red.

Every preflight run ends with a REMINDERS block. Read it each time. It lists the rules that people and agents break most often in this repo.

Keep each change small and inside the task you were given. Do not refactor code you were not asked to change. Note the problem in the PR instead.

## Test first

Write the failing test first. Run it and watch it fail for the reason you expect. Then write the code that makes it pass. Commit the test in the same commit as the implementation.

A commit with no test change needs `[no-test]` in the message and a link to an issue that explains why, for example `docs: fix typo in CONTENT.md [no-test] #12`. Preflight rejects `[no-test]` without an issue link.

## Commands

All commands run from the repo root.

| Command              | What it does                                                               |
| -------------------- | -------------------------------------------------------------------------- |
| `pnpm dev`           | Starts the web app and API in watch mode through turbo.                    |
| `pnpm build`         | Builds every package and app.                                              |
| `pnpm test`          | Runs unit, contract and integration tests through turbo, without coverage. |
| `pnpm test:coverage` | Runs the same tests with the coverage thresholds, as CI does.              |
| `pnpm test:quick`    | Runs the tests of changed packages and their dependents, without coverage. |
| `pnpm typecheck`     | Runs `tsc` on source and test programs in every package.                   |
| `pnpm lint`          | Runs `lint:code`, `lint:style`, `lint:content` and `lint:format` in turn.  |
| `pnpm lint:code`     | Builds, then runs ESLint with zero warnings allowed.                       |
| `pnpm lint:style`    | Runs Stylelint on every CSS file.                                          |
| `pnpm lint:content`  | Runs textlint on Markdown and seed text, then checks locale strings.       |
| `pnpm lint:format`   | Checks formatting with Prettier.                                           |
| `pnpm lint:deps`     | Runs dependency-cruiser, knip and jscpd.                                   |
| `pnpm preflight`     | Runs the repo rule checks. Add `--full` for the push and CI tier.          |
| `pnpm run doctor`    | Checks your local setup: Node, pnpm, hooks and env docs.                   |
| `pnpm seed`          | Seeds the demo project at `DATABASE_URL` through the API handler.          |
| `pnpm e2e`           | Runs the Playwright set in Chromium, on demand. See the Tests section.     |

To run one package, use a turbo filter: `pnpm turbo run test --filter=@parkshape/core`.

## Repo map

- `apps/web` is the React single-page app built with Vite. Pages, routes and locale strings live here.
- `apps/api` is the Hono HTTP handler. `src/entry.node.ts`, `src/entry.vercel.ts` and `src/entry.lambda.ts` adapt it to each host.
- `packages/core` has domain types, pure rules, constants and the clock and random ports.
- `packages/config` has the environment schema and the container that picks adapters.
- `packages/terrain` loads elevation grids and computes grade, cut and fill.
- `packages/db` has the database schema, the repositories and the seed data.
- `packages/ai` has the summary and "describe it" ports with a rule-based adapter.
- `packages/storage` has the blob store port and adapters.
- `packages/auth` has the identity port and the mock adapter.
- `packages/scene` wraps three.js and React Three Fiber for the 3D editor and viewer.
- `packages/ui` wraps the design system (the open-source BC Design System tokens and components). It also has the motion helpers.
- `packages/api-client` is the typed browser client for `apps/api`.
- `tools/preflight` is the rule checker behind `pnpm preflight` and `pnpm run doctor`.
- `tools/asset-pipeline` converts and compresses 3D models and terrain tiles.
- `tools/eslint-rules` has the custom ESLint rules and the package boundary list.
- `tools/textlint-rules` has the prose checker used by textlint, commitlint and the locale linter.
- `tools/seed` runs the seed from `packages/db/src/seed` through the API and draws the thumbnails.
- `e2e/` holds the resident and planner golden paths. `playwright.config.ts` at the root runs them.

## Dependency direction

Internal imports follow `tools/eslint-rules/package-boundaries.json`. ESLint and dependency-cruiser both read it. A package may import only itself and the packages listed for it.

| Package               | May import                                               |
| --------------------- | -------------------------------------------------------- |
| `packages/config`     | nothing internal                                         |
| `packages/core`       | nothing internal                                         |
| `packages/ui`         | nothing internal                                         |
| `packages/terrain`    | core, config                                             |
| `packages/db`         | core, config                                             |
| `packages/ai`         | core, config                                             |
| `packages/storage`    | core, config                                             |
| `packages/auth`       | core, config                                             |
| `packages/scene`      | core                                                     |
| `packages/api-client` | core                                                     |
| `apps/web`            | core, ui, scene, api-client, config                      |
| `apps/api`            | config, core, terrain, db, ai, storage, auth, api-client |
| `tools/*`             | any package or app                                       |

If a change needs a new edge, stop and ask. Do not edit the boundary file to make a lint error go away.

## Ports and adapters

Vendor SDKs are imported in a few places only. Those places are `packages/*/src/adapters/*`, the wrapper packages `packages/scene` and `packages/ui`, and `apps/api/src/entry.*.ts`. The restricted list is in `eslint.config.js` and covers three, `@react-three/*`, maplibre-gl, drizzle-orm, `@electric-sql/pglite`, geotiff, proj4, `@supabase/*`, openai, `@gltf-transform/*`, postprocessing, n8ao and fflate.

A port is a TypeScript interface in `packages/<pkg>/src/ports`. The one API-only port, `MetricsRunner`, is in `apps/api/src/ports`. Every port has an in-memory or static adapter, so the whole app runs offline with no accounts.

Every port has a contract test in the `__contracts__` folder next to it. The contract test is a function that takes an adapter factory. Every adapter for that port runs it and must pass.

The API chooses its adapters from the config values in one place, `createApiContainer` in `apps/api/src/container.ts`, which calls each package's own factory such as `createTerrainProvider`. The web app picks its one adapter, the map tiles, in `apps/web/src/app-deps.ts`.

## Configuration

`process.env` and `import.meta.env` are read only in `packages/config` and `tools`. Everything else receives config as a typed value from the container.

Every variable is listed in `.env.example` with a comment above it. The schema in `packages/config/src/env.ts` and `.env.example` have the same keys, and a test checks this.

## Code limits

ESLint enforces these limits. Fix the code, not the limit.

- Files are at most 300 lines, not counting blank lines and comments.
- Functions are at most 60 lines.
- Cyclomatic complexity is at most 10.
- Blocks nest at most 3 deep.
- Functions take at most 4 parameters. Use an options object past that.
- Numbers other than 0, 1 and -1 are named constants. Tests and config files are exempt.
- Parameters are never typed `boolean`. Use an options object or a union of string literals.
- Modules use named exports. Only `*.config.*` files have default exports.
- `any` is not allowed. Use `unknown` and narrow it.
- Non-null assertions (`value!`) are not allowed.
- File names are kebab-case. React component files in `.tsx` may be PascalCase.

A disable comment names the rule, gives a reason and links an issue: `// eslint-disable-next-line <rule> -- reason (#12)`. Each package has at most 5 disable comments. Preflight counts them.

## Code smells

| Smell                  | What we do instead                                                                |
| ---------------------- | --------------------------------------------------------------------------------- |
| Primitive obsession    | Branded types or small value objects for meters, grades, IDs and money.           |
| Magic numbers          | A named constant in `packages/core/src/constants.ts` or next to its one user.     |
| Long functions         | Split by step. Each function does one thing and has a name that says what.        |
| Boolean flags          | An options object or a string union such as `'raise' \| 'lower'`.                 |
| Duplication            | Extract after the second copy. jscpd fails the build at 3 percent.                |
| Dead code              | Delete it. knip reports unused files, exports and dependencies.                   |
| Shotgun surgery        | Keep a concept in one module so one change touches one place.                     |
| Feature envy           | Move the function to the module whose data it reads.                              |
| Leaky abstractions     | Ports return domain types, never vendor types or raw rows.                        |
| God stores             | One small store per concern. Derived values are selectors, not stored fields.     |
| Speculative generality | Build for the current task. Add the extension point when a second case arrives.   |
| Logic in UI            | Components render. Rules and calculations live in core or a package.              |
| Stringly-typed errors  | A discriminated union of error kinds with a `kind` field and typed data.          |
| Null sprawl            | Parse at the boundary with zod. Inside, values are present or the type says so.   |
| Comments               | Name things so the code reads plainly. Comments explain why, never what.          |
| Hidden globals         | Pass dependencies in through the container or parameters.                         |
| Test smells            | One behaviour per test, no sleeps, no shared mutable state, fake clock and RNG.   |
| Naming                 | Domain words from the planner's vocabulary. No `data`, `info`, `manager`, `util`. |

## Tests

Unit tests sit next to the source as `*.test.ts` or `*.test.tsx`.

Contract tests for ports live in `packages/<pkg>/src/ports/__contracts__`, and for `MetricsRunner` in `apps/api/src/ports/__contracts__`.

API integration tests live in `apps/api/test`. They call the Hono handler directly with the in-memory adapters and pglite.

End-to-end tests run with Playwright in Chromium against the built app, only when you run `pnpm e2e`. No hook runs them, and neither does CI. The set is small: the two golden paths in `e2e/`, the smoke, voting, editor bug, context layer and review specs in `apps/web/e2e`, and the scene checks in `packages/scene/e2e/scene.spec.ts` and `review-walk.spec.ts`. Add a browser test only for behaviour that no unit or API test can reach.

Tests against real services are tagged `@live` and sit under `__live__` directories. They never run in PR CI. Run them by hand when you change an adapter that talks to a real service.

Use the fake clock and seeded random adapters from `packages/core` in tests. A test that depends on wall time or `Math.random` is a bug.

## Definition of done

- Tests were written first, and all tests are green.
- `pnpm preflight` is green.
- For UI work, `pnpm e2e` passes.
- Docs that describe the changed behaviour are updated.
- Every box in the PR template checklist is ticked or explained.

## Design system guidance for agents

The two lines below are cut from the design system's `AGENTS.example.md`, read at https://raw.githubusercontent.com/bcgov/design-system/main/AGENTS.example.md on 2026-10-03. They are the parts that apply to this repo.

```markdown
- **Design tokens**: get instructions for using the design tokens library from `node_modules/@bcgov/design-tokens/AGENTS.md`
- **Components**: in a React project, get instructions for using the React component library from `node_modules/@bcgov/design-system-react-components/AGENTS.md`
```

The published packages `@bcgov/design-tokens@5.0.0` and `@bcgov/design-system-react-components@0.8.1` do not ship the `AGENTS.md` files named above, so their package READMEs in `node_modules` are the reference.

UI text reads at Flesch-Kincaid grade 8 or lower, and the UI meets WCAG 2.1 AA. [CONTENT.md](CONTENT.md) and [DESIGN.md](DESIGN.md) hold those rules.

## Generated rules

<!-- preflight:begin section=agents -->

| Rule                     | Checks                                                                                                 | Tier     | Fix                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------- |
| `adapter-boundary`       | Vendor SDKs are imported only in adapters, the scene and ui wrappers and API entries.                  | quick    | Move the import into `packages/<pkg>/src/adapters` and expose it through a port.          |
| `port-contract-coverage` | Every adapter class or factory runs through its port contract test.                                    | standard | Pass the adapter factory to the contract function in `src/ports/__contracts__`.           |
| `tdd-pairing`            | Each changed source file comes with a changed test in the same package.                                | quick    | Write the failing test first, or add `[no-test]` and an issue link to the commit message. |
| `env-documented`         | The env schema and `.env.example` list the same keys, each with a comment above it.                    | quick    | Add the variable to both `packages/config/src/env.ts` and `.env.example`, with a comment. |
| `no-raw-env`             | Only `packages/config` and tools read `process.env` or `import.meta.env`.                              | quick    | Add the value to the env schema and pass it in from the container.                        |
| `constants-home`         | Numbers in `packages/core` are named constants in constants.ts or next to their one user.              | standard | Name the number in `packages/core/src/constants.ts` and import it.                        |
| `disable-audit`          | Each disable comment names the rule, gives a reason after -- and an issue link; at most 5 per package. | quick    | Fix the code, or write `<rule> -- reason (#12)` on the same line and stay under the cap.  |
| `todo-audit`             | TODO and FIXME comments link an issue; seed placeholders must be gone by the full tier.                | quick    | Write `TODO(#12)` with a real issue, or finish the work and delete the comment.           |
| `file-budget`            | CSS and SQL files stay under 300 lines, Markdown under 400 and JSON under 600.                         | quick    | Split the file by concern. Generated files belong under a generated directory.            |
| `docs-in-sync`           | The generated rule tables and word list in the docs match the rules and word list.                     | standard | Run `pnpm preflight --docs` and commit the changed docs.                                  |
| `openapi-drift`          | The generated API client names every path and operation in `apps/api/openapi.json`.                    | standard | Regenerate the client in `packages/api-client/src/generated` from the spec.               |

<!-- preflight:end -->
