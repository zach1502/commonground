import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { PATHS } from '../../routing/paths';
import { apiServer, createTestDeps, RESIDENT, session, TEST_API_URL } from '../../test/api-server';
import { renderApp } from '../../test/render-app';
import { mockReviewApi, REVIEW_DESIGN, REVIEW_PROJECT } from '../../test/review-fixtures';

// The real viewer needs WebGL; Playwright covers it.
vi.mock('@parkshape/scene/viewer', () => {
  const ParkViewer = () => <div data-testid="park-viewer" />;
  const viewerScene = () => ({ heightmap: null, document: null, catalog: null });
  return { ParkViewer, viewerScene };
});

const LAZY_PAGE = { timeout: 15_000 };

function serveDesign(project = REVIEW_PROJECT) {
  apiServer.use(
    http.get(`${TEST_API_URL}/designs/d1`, () =>
      HttpResponse.json({ ...REVIEW_DESIGN, up: 0, down: 0, badges: [], metrics: null }),
    ),
    http.get(`${TEST_API_URL}/projects/jrp`, () => HttpResponse.json(project)),
  );
}

describe('review route', { timeout: 20_000 }, () => {
  it('carries the design id and names the design in its heading', async () => {
    serveDesign();
    const api = mockReviewApi();
    renderApp(PATHS.review('d1'), { ...createTestDeps(), review: api });
    expect(await screen.findByRole('heading', { level: 1 }, LAZY_PAGE)).toHaveTextContent(
      'Shady corner',
    );
    expect(api.listComments).toHaveBeenCalledWith('d1');
    expect(screen.getByRole('navigation', { name: 'Elements' })).toBeVisible();
  });

  it('goes back to the design page', async () => {
    serveDesign();
    const { router } = renderApp(PATHS.review('d1'), {
      ...createTestDeps(),
      review: mockReviewApi(),
    });
    await userEvent.click(
      await screen.findByRole('link', { name: 'Back to the design' }, LAZY_PAGE),
    );
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/designs/d1');
    });
  });

  it('is reached from the design page by its one primary action', async () => {
    serveDesign();
    const { router } = renderApp(PATHS.designView('d1'), {
      ...createTestDeps(),
      review: mockReviewApi(),
    });
    await screen.findByRole('heading', { level: 1, name: 'Shady corner' }, LAZY_PAGE);
    const main = screen.getByRole('main');
    const review = await within(main).findByRole('link', { name: 'Review this design' }, LAZY_PAGE);
    const primaries = within(main)
      .queryAllByRole('link')
      .concat(within(main).queryAllByRole('button'))
      .filter((control) => control.getAttribute('data-variant') === 'primary');
    expect(primaries).toEqual([review]);
    await userEvent.click(review);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/designs/d1/review');
    });
  });

  it('keeps Vote up secondary for a voter, so review stays the one primary action', async () => {
    serveDesign();
    session.user = RESIDENT;
    renderApp(PATHS.designView('d1'), { ...createTestDeps(), review: mockReviewApi() });
    await screen.findByRole('heading', { level: 1, name: 'Shady corner' }, LAZY_PAGE);
    const main = screen.getByRole('main');
    const voteUp = await within(main).findByRole('button', { name: 'Vote up' }, LAZY_PAGE);
    expect(voteUp).toHaveAttribute('data-variant', 'secondary');
    expect(within(main).getByRole('link', { name: 'Review this design' })).toHaveAttribute(
      'data-variant',
      'primary',
    );
  });
});
