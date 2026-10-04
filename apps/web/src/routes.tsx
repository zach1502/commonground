import type { ComponentType } from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';

import type { WebDeps } from './app-deps';
import { ErrorPage, LoadingPage, RootErrorPage } from './pages/error-page';
import { LandingPage } from './pages/landing-page';
import { createActions } from './routing/actions';
import { describeAction, describeLoaders } from './routing/describe';
import { insightsLoader } from './routing/insights-loader';
import { createLoaders } from './routing/loaders';
import { NotFoundError } from './routing/not-found';
import { PATHS } from './routing/paths';
import { AppShell, BARE_CHROME, ROOT_ROUTE_ID } from './shell/app-shell';
import { stepPage } from './staff/step-routes';
import { stepHref, WIZARD_BASE, WIZARD_STEPS } from './staff/wizard-steps';

type DepsPage = ComponentType<{ readonly deps: WebDeps }>;
type LazyRoute = NonNullable<RouteObject['lazy']>;

/** A lazy route module for a page with no props. Only the landing page ships in the entry. */
function page(load: () => Promise<ComponentType>): LazyRoute {
  return async () => ({ Component: await load() });
}

/** A lazy route module for a page that takes the app dependencies. */
function depsPage(deps: WebDeps, load: () => Promise<DepsPage>): LazyRoute {
  return async () => {
    const Page = await load();
    function PageWithDeps() {
      return <Page deps={deps} />;
    }
    return { Component: PageWithDeps };
  };
}

/**
 * Starts a page's 3D code beside its page chunk and data. Left to the page, it starts only after
 * the data has rendered, which on a slow link is seconds later.
 */
function withScene<T>(load: () => Promise<T>, scene: () => Promise<unknown>): () => Promise<T> {
  return async () => {
    scene().catch(() => undefined);
    return load();
  };
}

/** Starting a design, voting and the editor. Each page loads only when opened. */
function designRoutes(
  deps: WebDeps,
  loaders: ReturnType<typeof createLoaders>,
  actions: ReturnType<typeof createActions>,
): RouteObject[] {
  const describe = describeLoaders(deps, loaders);
  return [
    {
      path: `${PATHS.projects}/:id/design/new`,
      loader: loaders.newDesign,
      action: actions.newDesign,
      lazy: page(async () => (await import('./pages/new-design-page')).NewDesignPage),
    },
    {
      path: `${PATHS.projects}/:id/design/describe`,
      loader: describe.describe,
      action: describeAction(deps),
      lazy: page(async () => (await import('./pages/describe-page')).DescribePage),
    },
    {
      path: `${PATHS.projects}/:id/design/describe/:designId`,
      loader: describe.describePreview,
      lazy: depsPage(
        deps,
        async () => (await import('./pages/describe-preview-page')).DescribePreviewPage,
      ),
    },
    {
      path: `${PATHS.projects}/:id/vote`,
      loader: loaders.vote,
      lazy: depsPage(deps, async () => (await import('./pages/vote-page')).VotePage),
    },
    {
      path: `${PATHS.projects}/:id/design/:designId`,
      loader: loaders.editor,
      handle: BARE_CHROME,
      lazy: depsPage(
        deps,
        withScene(
          async () => (await import('./pages/editor-page-loader')).EditorPageLoader,
          async () => Promise.all([import('./pages/editor-page'), import('@parkshape/scene')]),
        ),
      ),
    },
  ];
}

/** The public gallery, leaderboard and read-only design pages. */
function viewRoutes(deps: WebDeps, loaders: ReturnType<typeof createLoaders>): RouteObject[] {
  return [
    {
      path: `${PATHS.projects}/:id/designs`,
      loader: loaders.gallery,
      lazy: page(async () => (await import('./pages/gallery-page')).GalleryPage),
    },
    {
      path: `${PATHS.projects}/:id/leaderboard`,
      loader: loaders.leaderboard,
      lazy: depsPage(deps, async () => (await import('./pages/leaderboard-page')).LeaderboardPage),
    },
    {
      path: '/designs/:designId/review',
      loader: loaders.designView,
      lazy: depsPage(
        deps,
        withScene(
          async () => (await import('./pages/review-page')).ReviewPage,
          async () => import('./design/viewer-panel'),
        ),
      ),
    },
    {
      path: '/designs/:designId',
      loader: loaders.designView,
      lazy: depsPage(
        deps,
        withScene(
          async () => (await import('./pages/design-page')).DesignPage,
          async () => import('./design/viewer-panel'),
        ),
      ),
    },
  ];
}

/** Sign-in, self-report, project and staff pages. */
function accountRoutes(
  loaders: ReturnType<typeof createLoaders>,
  actions: ReturnType<typeof createActions>,
): RouteObject[] {
  return [
    {
      path: PATHS.login,
      loader: loaders.login('resident'),
      action: actions.login,
      lazy: page(async () => (await import('./pages/login-page')).LoginPage),
    },
    {
      path: PATHS.staffLogin,
      loader: loaders.login('staff'),
      action: actions.login,
      lazy: page(async () => (await import('./pages/staff-login-page')).StaffLoginPage),
    },
    {
      path: PATHS.selfReport,
      loader: loaders.selfReport,
      action: actions.selfReport,
      lazy: page(async () => (await import('./pages/self-report-page')).SelfReportPage),
    },
    {
      path: PATHS.projects,
      loader: loaders.projects,
      lazy: page(async () => (await import('./pages/projects-page')).ProjectsPage),
    },
    {
      path: `${PATHS.projects}/:id`,
      loader: loaders.project,
      lazy: page(async () => (await import('./pages/project-page')).ProjectPage),
    },
  ];
}

/** Staff home and the six-step project setup wizard, each step on its own URL. */
function staffRoutes(
  deps: WebDeps,
  loaders: ReturnType<typeof createLoaders>,
  actions: ReturnType<typeof createActions>,
): RouteObject[] {
  return [
    {
      path: PATHS.staff,
      loader: loaders.staff,
      action: actions.projectStatus,
      lazy: page(async () => (await import('./pages/staff-home-page')).StaffHomePage),
    },
    {
      path: `${PATHS.staff}/projects/:id/insights`,
      // In the entry, so its requests start beside the session check, not after the page chunk.
      loader: insightsLoader(deps.api, loaders.sessionFor),
      lazy: depsPage(deps, async () => (await import('./pages/insights-page')).InsightsPage),
    },
    {
      path: WIZARD_BASE,
      loader: loaders.staffOnly,
      lazy: depsPage(deps, async () => (await import('./staff/wizard-layout')).WizardLayout),
      children: [
        { index: true, element: <Navigate to={stepHref('site')} replace /> },
        ...WIZARD_STEPS.map((step) => ({ path: step, lazy: stepPage(deps, step) })),
      ],
    },
  ];
}

/** The route tree. Loaders and actions close over deps so tests can pass fakes. */
export function createRoutes(deps: WebDeps): RouteObject[] {
  const loaders = createLoaders(deps);
  const actions = createActions(deps, loaders);
  return [
    {
      id: ROOT_ROUTE_ID,
      path: PATHS.home,
      loader: loaders.root,
      Component: AppShell,
      ErrorBoundary: RootErrorPage,
      HydrateFallback: LoadingPage,
      children: [
        {
          ErrorBoundary: ErrorPage,
          children: [
            { index: true, loader: loaders.landing, Component: LandingPage },
            ...accountRoutes(loaders, actions),
            ...staffRoutes(deps, loaders, actions),
            ...viewRoutes(deps, loaders),
            ...designRoutes(deps, loaders, actions),
            { path: PATHS.logout, action: actions.logout },
            {
              path: PATHS.styleguide,
              lazy: page(async () => (await import('./pages/styleguide-page')).StyleguidePage),
            },
            {
              path: '*',
              loader: () => {
                throw new NotFoundError();
              },
            },
          ],
        },
      ],
    },
  ];
}

export function createAppRouter(deps: WebDeps) {
  return createBrowserRouter(createRoutes(deps));
}
