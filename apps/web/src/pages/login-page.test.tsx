import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { format, messages } from '../messages';
import { PATHS } from '../routing/paths';
import { apiServer, createTestDeps, projectFixture, TEST_API_URL } from '../test/api-server';
import { renderApp } from '../test/render-app';

describe('login page', () => {
  it('marks the mock BC Services Card button with a Demo tag', async () => {
    renderApp(PATHS.login);
    const button = await screen.findByRole('button', { name: 'Log in as Molly Swingset' });
    expect(button).toHaveTextContent(format(messages.login.asPersona, { name: 'Molly Swingset' }));
    expect(screen.getByText(messages.login.demoTag)).toHaveTextContent('Demo');
    expect(button).toHaveAccessibleDescription(messages.login.demoTag);
    expect(screen.getByText(messages.login.lede)).toHaveTextContent(/mock personas/);
  });

  it('lists resident personas only', async () => {
    renderApp(PATHS.login);
    expect(await screen.findByRole('radio', { name: /Molly Swingset/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Gail Marigold/ })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Paula Blueprint/ })).toBeNull();
  });

  it('asks for the self-report after the first login', async () => {
    const { router } = renderApp(PATHS.login);
    await userEvent.click(await screen.findByRole('radio', { name: /Gail Marigold/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Log in as Gail Marigold' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(PATHS.selfReport);
    });
    expect(await screen.findByRole('heading', { name: messages.selfReport.heading })).toBeVisible();
  });

  it('goes straight to projects once the self-report is done', async () => {
    const project = await projectFixture();
    apiServer.use(
      http.get(`${TEST_API_URL}/projects`, () => HttpResponse.json({ projects: [project] })),
    );
    const deps = createTestDeps();
    deps.selfReports.save('persona-molly-swingset', { kind: 'skipped' });
    const { router } = renderApp(PATHS.login, deps);
    await userEvent.click(await screen.findByRole('button', { name: /^Log in as / }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(PATHS.projects);
    });
    expect(await screen.findByRole('link', { name: 'Jonathan Rogers Park' })).toBeVisible();
  });

  it('shows an inline error when the login fails', async () => {
    apiServer.use(
      http.post(`${TEST_API_URL}/auth/login`, () =>
        HttpResponse.json({ error: { kind: 'x', message: 'x', requestId: 'r' } }, { status: 500 }),
      ),
    );
    renderApp(PATHS.login);
    await userEvent.click(await screen.findByRole('button', { name: /^Log in as / }));
    expect(await screen.findByRole('alert')).toHaveTextContent(messages.login.failed);
  });
});

describe('login page rate limit', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads Retry-After, says when to try again, disables and re-enables on time', async () => {
    apiServer.use(
      http.post(`${TEST_API_URL}/auth/login`, () =>
        HttpResponse.json(
          {
            error: { kind: 'rate-limited', message: 'slow', requestId: 'r', retryAfterSeconds: 30 },
          },
          { status: 429, headers: { 'Retry-After': '30' } },
        ),
      ),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp(PATHS.login);
    await user.click(await screen.findByRole('button', { name: /^Log in as / }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Too many sign-in tries. Try again in 30 seconds.');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Log in as / })).toBeDisabled();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByRole('button', { name: /^Log in as / })).toBeEnabled();
  });
});

describe('login page button', () => {
  it('names the chosen persona on the button, and follows a change', async () => {
    renderApp(PATHS.login);
    expect(await screen.findByRole('button', { name: 'Log in as Molly Swingset' })).toBeVisible();
    await userEvent.click(screen.getByRole('radio', { name: /Gail Marigold/ }));
    expect(screen.getByRole('button', { name: 'Log in as Gail Marigold' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Log in as Molly Swingset' })).toBeNull();
  });
});

describe('staff login page', () => {
  it('marks the mock IDIR button with a Demo tag', async () => {
    renderApp(PATHS.staffLogin);
    const button = await screen.findByRole('button', { name: messages.staffLogin.button });
    expect(screen.getByText(messages.login.demoTag)).toHaveTextContent('Demo');
    expect(button).toHaveAccessibleDescription(messages.login.demoTag);
  });

  it('sets Log in as in the same regular small type as the resident radio group label', async () => {
    renderApp(PATHS.staffLogin);
    const label = await screen.findByText(messages.staffLogin.personaLabel);
    expect(label).toHaveClass('web-field-label');
    expect(label).not.toHaveClass('web-label');
  });

  it('logs staff in and lands on the staff home', async () => {
    const { router } = renderApp(PATHS.staffLogin);
    expect(await screen.findByText('Paula Blueprint')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: messages.staffLogin.button }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(PATHS.staff);
    });
    expect(await screen.findByRole('heading', { name: messages.staff.heading })).toBeVisible();
  });
});
