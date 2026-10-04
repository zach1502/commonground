import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';

import type { WebDeps } from '../app-deps';
import { createRoutes } from '../routes';

import { createTestDeps } from './api-server';

/** Renders the whole route tree at a path with in-memory history. */
export function renderApp(path: string, deps: WebDeps = createTestDeps()) {
  const router = createMemoryRouter(createRoutes(deps), { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return { router, deps };
}
