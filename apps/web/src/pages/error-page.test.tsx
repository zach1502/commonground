import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';

import { messages } from '../messages';
import { PATHS } from '../routing/paths';
import { apiServer, RESIDENT, session, TEST_API_URL } from '../test/api-server';
import { renderApp } from '../test/render-app';

describe('not found page', () => {
  it('says the page does not exist and links home and to the projects list', async () => {
    renderApp('/no-such-page');
    await screen.findByRole('heading', { name: messages.errors.notFoundHeading });
    expect(screen.getByText(messages.errors.notFoundBody)).toBeVisible();
    expect(screen.getByRole('link', { name: messages.errors.home })).toHaveAttribute(
      'href',
      PATHS.home,
    );
    expect(screen.getByRole('link', { name: messages.errors.projects })).toHaveAttribute(
      'href',
      PATHS.projects,
    );
  });
});

describe('page load failure', () => {
  afterEach(() => {
    session.user = null;
  });

  it('announces the page-load failure once with the table copy and offers retry and home', async () => {
    session.user = RESIDENT;
    apiServer.use(
      http.get(`${TEST_API_URL}/projects`, () =>
        HttpResponse.json(
          { error: { kind: 'internal', message: 'boom', requestId: 'r' } },
          { status: 500 },
        ),
      ),
    );
    renderApp(PATHS.projects);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(messages.failure.pageLoad);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('button', { name: messages.errors.retry })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: messages.errors.home })).toHaveAttribute(
      'href',
      PATHS.home,
    );
  });
});
