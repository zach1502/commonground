import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { format, messages } from '../messages';
import { PATHS } from '../routing/paths';
import { apiServer, projectFixture, session, STAFF, TEST_API_URL } from '../test/api-server';
import { renderApp } from '../test/render-app';

const strings = messages.planner.home;

async function withProjects(status: 'open' | 'closed' = 'open') {
  const project = await projectFixture({ status });
  const changes: unknown[] = [];
  apiServer.use(
    http.get(`${TEST_API_URL}/projects`, () => HttpResponse.json({ projects: [project] })),
    http.patch(`${TEST_API_URL}/projects/jrp/status`, async ({ request }) => {
      changes.push(await request.json());
      return HttpResponse.json({ ...project, status: status === 'open' ? 'closed' : 'open' });
    }),
  );
  return changes;
}

describe('staff home', () => {
  it('has one primary action and a secondary close button per project', async () => {
    await withProjects();
    session.user = STAFF;
    renderApp(PATHS.staff);
    const start = await screen.findByRole('link', { name: strings.newProject });
    expect(start).toHaveAttribute('href', '/staff/projects/new/site');
    expect(start).toHaveAttribute('data-variant', 'primary');
    const close = screen.getByRole('button', {
      name: format(strings.close, { name: 'Jonathan Rogers Park' }),
    });
    expect(close).toHaveAttribute('data-variant', 'secondary');
    await waitFor(() => {
      expect(document.title).toBe(messages.meta.staff.title);
    });
  });

  it('closes an open project', async () => {
    const changes = await withProjects();
    session.user = STAFF;
    renderApp(PATHS.staff);
    await userEvent.click(
      await screen.findByRole('button', {
        name: format(strings.close, { name: 'Jonathan Rogers Park' }),
      }),
    );
    await waitFor(() => {
      expect(changes).toEqual([{ status: 'closed' }]);
    });
  });

  it('reopens a closed project and says when the change fails', async () => {
    await withProjects('closed');
    apiServer.use(
      http.patch(
        `${TEST_API_URL}/projects/jrp/status`,
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    session.user = STAFF;
    renderApp(PATHS.staff);
    await userEvent.click(
      await screen.findByRole('button', {
        name: format(strings.reopen, { name: 'Jonathan Rogers Park' }),
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      format(strings.failed, { name: 'Jonathan Rogers Park' }),
    );
  });
});

describe('staff home rows', () => {
  it('lays each project out on the same four-column row: name, status, insights, close', async () => {
    await withProjects();
    session.user = STAFF;
    renderApp(PATHS.staff);
    const name = await screen.findByRole('link', { name: 'Jonathan Rogers Park' });
    const row = name.closest('li');
    expect(row).toHaveClass('web-list__item--staff');
    const cells = row === null ? [] : [...row.children];
    expect(cells.map((cell) => cell.className)).toEqual([
      'web-list__link',
      'web-list__status',
      'web-list__insights',
      'web-list__action',
    ]);
    expect(screen.getByText(messages.projects.status.open)).not.toHaveClass('ps-badge');
  });

  it('says when there are no projects', async () => {
    apiServer.use(http.get(`${TEST_API_URL}/projects`, () => HttpResponse.json({ projects: [] })));
    session.user = STAFF;
    renderApp(PATHS.staff);
    expect(await screen.findByText(messages.staff.empty)).toBeVisible();
  });
});
