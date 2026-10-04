import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { messages } from '../messages';
import { PATHS } from '../routing/paths';
import { apiServer, projectFixture, RESIDENT, session, TEST_API_URL } from '../test/api-server';
import { renderApp } from '../test/render-app';

describe('new design page closed project', () => {
  it('shows the closed state instead of start options that would fail', async () => {
    session.user = RESIDENT;
    const closed = await projectFixture({ phase: 'closed' });
    apiServer.use(http.get(`${TEST_API_URL}/projects/jrp`, () => HttpResponse.json(closed)));
    renderApp(PATHS.newDesign('jrp'));
    expect(await screen.findByText(messages.newDesign.closed)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: messages.newDesign.blank })).toBeNull();
    expect(screen.getByRole('link', { name: messages.project.vote })).toHaveAttribute(
      'href',
      PATHS.vote('jrp'),
    );
  });

  it('shows the start options on an open project', async () => {
    session.user = RESIDENT;
    const open = await projectFixture({ phase: 'open' });
    apiServer.use(http.get(`${TEST_API_URL}/projects/jrp`, () => HttpResponse.json(open)));
    renderApp(PATHS.newDesign('jrp'));
    expect(
      await screen.findByRole('button', { name: messages.newDesign.blank }),
    ).toBeInTheDocument();
    expect(screen.queryByText(messages.newDesign.closed)).toBeNull();
  });
});
