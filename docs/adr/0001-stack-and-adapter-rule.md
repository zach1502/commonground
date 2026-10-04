# ADR-0001: Stack and the adapter rule

Status: accepted, 2026-10-03.

## Context

CommonGround lets residents design a park on real terrain in the browser and vote on designs. The first deployment host is not decided. The app has to run on a laptop with no accounts and no network, on a Node server, on Vercel and on AWS Lambda.

The app talks to several outside services: elevation data, a database, blob storage, identity, a text model and map tiles. Each has more than one likely provider. Tests have to run fast and offline in CI.

The B.C. government is a likely partner, so the UI has to meet WCAG 2.1 AA and look like other B.C. government services.

## Decision

The web app is a single-page app built with Vite and React. It has no server rendering and deploys as static files.

The API is one Hono handler in `apps/api`. Thin entry files adapt it to Node, Vercel and Lambda.

Data access uses Drizzle ORM behind repository functions in `packages/db`. Nothing outside the repositories sees Drizzle types or raw rows. Tests use pglite, an embedded Postgres, so they need no database server.

Every outside service sits behind a port, which is a TypeScript interface. Adapters implement ports. Each port has an in-memory or static adapter and a contract test that every adapter must pass. The API chooses its adapters from config in `createApiContainer` in `apps/api/src/container.ts`, and the web app chooses its map tiles in `apps/web/src/app-deps.ts`. No other file does.

The UI uses the B.C. Design System: `@bcgov/design-tokens`, `@bcgov/bc-sans` and `@bcgov/design-system-react-components`, wrapped by `packages/ui`.

## Consequences

The whole app runs offline with the default `.env.example`. A new contributor needs no accounts.

Changing a provider means writing one adapter, passing its contract test and adding one config value. Domain code does not change.

ESLint restricts vendor SDK imports to adapter folders and the wrapper packages. This adds files and indirection for small features.

A single-page app has no server-rendered HTML. Each route sets its own title, description and Open Graph tags on the client, and link previews need a prerender step for shared design pages.

The BC Design System has a small component set. Editor controls such as the floating toolbar and sliders are built in `packages/ui` on top of its tokens.

## Alternatives considered

Next.js was rejected for portability. Its server features tie the app to hosts that support its runtime, and the Lambda and static targets would need extra adapters.

Unity WebGL was rejected for size and mobile support. Its builds are tens of megabytes before any terrain loads, and voting has to work on phones over mobile data.
