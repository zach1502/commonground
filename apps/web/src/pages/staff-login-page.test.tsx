import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { messages } from '../messages';
import { PATHS } from '../routing/paths';
import { apiServer, PERSONAS, session, STAFF, TEST_API_URL } from '../test/api-server';
import { renderApp } from '../test/render-app';

const ACCESS_CODE = 'harbour-otter-42';

function refused() {
  return HttpResponse.json(
    { error: { kind: 'access-code-refused', message: 'Wrong code', requestId: 'r3' } },
    { status: 403 },
  );
}

/** A hosted API: personas say a code is needed and login checks it. */
function useHostedApi() {
  apiServer.use(
    http.get(`${TEST_API_URL}/auth/personas`, () =>
      HttpResponse.json({ personas: PERSONAS, staffCodeRequired: true }),
    ),
    http.post(`${TEST_API_URL}/auth/login`, async ({ request }) => {
      const { accessCode } = (await request.json()) as { accessCode?: string };
      if (accessCode !== ACCESS_CODE) return refused();
      session.user = STAFF;
      return HttpResponse.json({ user: STAFF });
    }),
  );
}

describe('staff login access code', () => {
  it('leaves the access code field out when the API does not ask for it', async () => {
    renderApp(PATHS.staffLogin);
    expect(await screen.findByRole('button', { name: messages.staffLogin.button })).toBeVisible();
    expect(screen.queryByLabelText(messages.staffLogin.codeLabel)).toBeNull();
  });

  it('shows a password field with its label above and help below', async () => {
    useHostedApi();
    renderApp(PATHS.staffLogin);
    const field = await screen.findByLabelText(messages.staffLogin.codeLabel);
    expect(field).toHaveAttribute('type', 'password');
    expect(field).toHaveAccessibleDescription(messages.staffLogin.codeHelp);
  });

  it('shows an inline error on the field when the code is refused', async () => {
    useHostedApi();
    renderApp(PATHS.staffLogin);
    await userEvent.type(await screen.findByLabelText(messages.staffLogin.codeLabel), 'nope');
    await userEvent.click(screen.getByRole('button', { name: messages.staffLogin.button }));
    const field = screen.getByLabelText(messages.staffLogin.codeLabel);
    await waitFor(() => {
      expect(field).toHaveAttribute('aria-invalid', 'true');
    });
    expect(screen.getByText(messages.staffLogin.codeError)).toBeVisible();
    expect(screen.queryByText(messages.login.failed)).toBeNull();
  });

  it('logs staff in with the right code and lands on the staff home', async () => {
    useHostedApi();
    const { router } = renderApp(PATHS.staffLogin);
    await userEvent.type(await screen.findByLabelText(messages.staffLogin.codeLabel), ACCESS_CODE);
    await userEvent.click(screen.getByRole('button', { name: messages.staffLogin.button }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(PATHS.staff);
    });
  });
});
