import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { messages } from '../messages';
import { PATHS } from '../routing/paths';
import { apiServer, createTestDeps, RESIDENT, session, TEST_API_URL } from '../test/api-server';
import { renderApp } from '../test/render-app';

/** Bodies the page sent to PATCH /me/self-report during the current test. */
let savedReports: unknown[] = [];

beforeEach(() => {
  session.user = RESIDENT;
  savedReports = [];
  apiServer.use(
    http.get(`${TEST_API_URL}/projects`, () => HttpResponse.json({ projects: [] })),
    http.patch(`${TEST_API_URL}/me/self-report`, async ({ request }) => {
      const body = await request.json();
      savedReports.push(body);
      return HttpResponse.json(body);
    }),
  );
});

describe('self-report page', () => {
  it('asks for the postal code start and the age range', async () => {
    renderApp(PATHS.selfReport);
    expect(
      await screen.findByRole('textbox', { name: messages.selfReport.fsaLabel }),
    ).toHaveAccessibleDescription(messages.selfReport.fsaHelp);
    expect(
      screen.getByRole('button', { name: new RegExp(messages.selfReport.ageLabel) }),
    ).toBeVisible();
  });

  it('shows an inline error for a bad postal code', async () => {
    const deps = createTestDeps();
    renderApp(PATHS.selfReport, deps);
    await userEvent.type(
      await screen.findByRole('textbox', { name: messages.selfReport.fsaLabel }),
      '12',
    );
    await userEvent.click(screen.getByRole('button', { name: messages.selfReport.save }));
    expect(await screen.findByText(messages.selfReport.fsaError)).toBeVisible();
    expect(deps.selfReports.has(RESIDENT.id)).toBe(false);
    expect(savedReports).toEqual([]);
  });

  it('saves the answers and moves on to projects', async () => {
    const deps = createTestDeps();
    const { router } = renderApp(PATHS.selfReport, deps);
    await userEvent.type(
      await screen.findByRole('textbox', { name: messages.selfReport.fsaLabel }),
      'v5t',
    );
    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(messages.selfReport.ageLabel) }),
    );
    await userEvent.click(
      await screen.findByRole('option', { name: messages.selfReport.ageBands['30-44'] }),
    );
    await userEvent.click(screen.getByRole('button', { name: messages.selfReport.save }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(PATHS.projects);
    });
    expect(deps.selfReports.has(RESIDENT.id)).toBe(true);
    expect(savedReports).toEqual([{ fsa: 'V5T', ageBand: '30-44' }]);
    expect(await screen.findByText(messages.projects.empty)).toBeVisible();
  });
});

describe('self-report page and the API', () => {
  it('can be skipped without sending anything to the API', async () => {
    const deps = createTestDeps();
    const { router } = renderApp(PATHS.selfReport, deps);
    await userEvent.click(await screen.findByRole('button', { name: messages.selfReport.skip }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(PATHS.projects);
    });
    expect(deps.selfReports.has(RESIDENT.id)).toBe(true);
    expect(savedReports).toEqual([]);
  });

  it('stays on the page with an error when the API refuses the answers', async () => {
    apiServer.use(
      http.patch(`${TEST_API_URL}/me/self-report`, () =>
        HttpResponse.json(
          { error: { kind: 'validation', message: 'Bad FSA', requestId: 'r3' } },
          { status: 400 },
        ),
      ),
    );
    const deps = createTestDeps();
    renderApp(PATHS.selfReport, deps);
    await userEvent.type(
      await screen.findByRole('textbox', { name: messages.selfReport.fsaLabel }),
      'v5t',
    );
    await userEvent.click(screen.getByRole('button', { name: messages.selfReport.save }));
    expect(await screen.findByText(messages.selfReport.saveError)).toBeVisible();
    expect(deps.selfReports.has(RESIDENT.id)).toBe(false);
  });
});

describe('self-report carries the task from login (returnTo)', () => {
  it('sends a signed-out resident from the vote route to login with a returnTo', async () => {
    session.user = null;
    const { router } = renderApp(PATHS.vote('jrp'));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(PATHS.login);
    });
    expect(new URLSearchParams(router.state.location.search).get('returnTo')).toBe(
      PATHS.vote('jrp'),
    );
  });

  it('skips back to the task named in returnTo instead of projects', async () => {
    const target = PATHS.vote('jrp');
    const { router } = renderApp(`${PATHS.selfReport}?returnTo=${encodeURIComponent(target)}`);
    await userEvent.click(await screen.findByRole('button', { name: messages.selfReport.skip }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(target);
    });
  });

  it('saves then returns to the task named in returnTo', async () => {
    const target = PATHS.vote('jrp');
    const { router } = renderApp(`${PATHS.selfReport}?returnTo=${encodeURIComponent(target)}`);
    await userEvent.type(
      await screen.findByRole('textbox', { name: messages.selfReport.fsaLabel }),
      'v5t',
    );
    await userEvent.click(screen.getByRole('button', { name: messages.selfReport.save }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(target);
    });
  });

  it('ignores an off-site returnTo and falls back to projects', async () => {
    const { router } = renderApp(
      `${PATHS.selfReport}?returnTo=${encodeURIComponent('https://evil.test')}`,
    );
    await userEvent.click(await screen.findByRole('button', { name: messages.selfReport.skip }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(PATHS.projects);
    });
  });
});
