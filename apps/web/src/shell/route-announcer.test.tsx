import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { createMemoryRouter, Link, Outlet, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { RouteAnnouncer } from './route-announcer';

const MAIN_ID = 'main-content';

function Page({ title, heading }: { readonly title: string; readonly heading: string }) {
  useEffect(() => {
    document.title = title;
  }, [title]);
  return <h1>{heading}</h1>;
}

function Shell() {
  return (
    <>
      <RouteAnnouncer mainId={MAIN_ID} />
      <main id={MAIN_ID} tabIndex={-1}>
        <Link to="/next">Go next</Link>
        <Outlet />
      </main>
    </>
  );
}

function renderRoutes() {
  const router = createMemoryRouter(
    [
      {
        element: <Shell />,
        children: [
          { index: true, element: <Page title="Home | CommonGround" heading="Home" /> },
          { path: 'next', element: <Page title="Next page | CommonGround" heading="Next page" /> },
        ],
      },
    ],
    { initialEntries: ['/'] },
  );
  return render(<RouterProvider router={router} />);
}

describe('RouteAnnouncer', () => {
  it('does not move focus or announce on the first load', async () => {
    renderRoutes();
    await screen.findByRole('heading', { level: 1, name: 'Home' });
    expect(document.activeElement).toBe(document.body);
    expect(screen.getByTestId('route-announcer')).toHaveTextContent('');
  });

  it('moves focus to the new h1 and announces the title once after a route change', async () => {
    renderRoutes();
    await screen.findByRole('heading', { level: 1, name: 'Home' });
    await userEvent.click(screen.getByRole('link', { name: 'Go next' }));
    const nextHeading = await screen.findByRole('heading', { level: 1, name: 'Next page' });
    await waitFor(() => {
      expect(document.activeElement).toBe(nextHeading);
    });
    expect(nextHeading).toHaveAttribute('tabindex', '-1');
    await waitFor(() => {
      expect(screen.getByTestId('route-announcer')).toHaveTextContent('Next page | CommonGround');
    });
  });
});

describe('RouteAnnouncer route change (J23)', () => {
  it('swaps the page with no animation and puts focus on the h1', async () => {
    const animate = vi.fn();
    Element.prototype.animate = animate;
    try {
      renderRoutes();
      await screen.findByRole('heading', { level: 1, name: 'Home' });
      await userEvent.click(screen.getByRole('link', { name: 'Go next' }));
      const nextHeading = await screen.findByRole('heading', { level: 1, name: 'Next page' });
      await waitFor(() => {
        expect(document.activeElement).toBe(nextHeading);
      });
      expect(animate).not.toHaveBeenCalled();
      expect(document.getElementById(MAIN_ID)?.className ?? '').not.toMatch(/motion/);
    } finally {
      delete (Element.prototype as Partial<Element>).animate;
    }
  });
});
