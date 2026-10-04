import { createRoute } from '@hono/zod-openapi';

import { PERSONAS, findPersona } from '@parkshape/auth';
import { selfReportSchema as storedSelfReportSchema } from '@parkshape/core';
import type { User } from '@parkshape/db';

import { errorResponses, jsonBody, jsonContent } from '../contracts/common.js';
import {
  loginBodySchema,
  meSchema,
  personaListSchema,
  selfReportSchema,
} from '../contracts/participation.js';
import type { ApiApp, AppDeps } from '../deps.js';
import { notFound, unauthenticated } from '../errors.js';
import { HTTP_NO_CONTENT as NO_CONTENT, HTTP_OK as OK } from '../http-status.js';
import { clientAddress } from '../middleware/client-address.js';
import { requireSession } from '../middleware/http.js';
import { takeToken } from '../services/access.js';
import { checkStaffAccess } from '../services/staff-access.js';

const listPersonas = createRoute({
  method: 'get',
  path: '/auth/personas',
  operationId: 'listPersonas',
  tags: ['auth'],
  summary: 'People you can sign in as with the mock provider',
  responses: { [OK]: jsonContent(personaListSchema, 'The personas.') },
});

const login = createRoute({
  method: 'post',
  path: '/auth/login',
  operationId: 'login',
  tags: ['auth'],
  summary: 'Sign in as a persona; sets the session cookie',
  request: { body: jsonBody(loginBodySchema) },
  responses: {
    [OK]: jsonContent(meSchema, 'Signed in.'),
    ...errorResponses('invalid', 'access-code-refused', 'not-found', 'too-large', 'rate-limited'),
  },
});

const logout = createRoute({
  method: 'post',
  path: '/auth/logout',
  operationId: 'logout',
  tags: ['auth'],
  summary: 'Sign out; clears the session cookie',
  responses: { [NO_CONTENT]: { description: 'Signed out.' } },
});

const me = createRoute({
  method: 'get',
  path: '/me',
  operationId: 'getMe',
  tags: ['auth'],
  summary: 'The signed-in user',
  responses: {
    [OK]: jsonContent(meSchema, 'The signed-in user.'),
    ...errorResponses('unauthenticated'),
  },
});

const saveSelfReport = createRoute({
  method: 'patch',
  path: '/me/self-report',
  operationId: 'saveSelfReport',
  tags: ['auth'],
  summary: "Save the signed-in user's postal code start and age band",
  request: { body: jsonBody(selfReportSchema) },
  responses: {
    [OK]: jsonContent(selfReportSchema, 'The saved self report.'),
    ...errorResponses('invalid', 'unauthenticated'),
  },
});

/** The stored report was parsed on save; parsing again keeps the response typed. */
function presentMe(user: User) {
  const selfReport =
    user.selfReport === null ? null : storedSelfReportSchema.parse(user.selfReport);
  return { user: { id: user.id, role: user.role, displayName: user.displayName }, selfReport };
}

export function registerAuthRoutes(app: ApiApp, deps: AppDeps): void {
  app.openapi(listPersonas, (c) =>
    c.json(
      { personas: [...PERSONAS], staffCodeRequired: deps.config.staffLoginMode === 'code' },
      OK,
    ),
  );

  app.openapi(login, async (c) => {
    const address = clientAddress(c, { trustProxy: deps.config.TRUST_PROXY });
    await takeToken(deps.limits.logins, address, 'sign-ins');
    const body = c.req.valid('json');
    const persona = findPersona(body.persona);
    if (persona === undefined) {
      throw notFound('Persona');
    }
    checkStaffAccess(deps.config, persona, body.accessCode);
    const user = await deps.repos.users.upsert(persona);
    const { setCookie } = await deps.auth.createSession(user.id, user.role);
    c.header('Set-Cookie', setCookie);
    return c.json(presentMe(user), OK);
  });

  app.openapi(logout, async (c) => {
    const { setCookie } = await deps.auth.destroySession(c.req.header('Cookie'));
    c.header('Set-Cookie', setCookie);
    return c.body(null, NO_CONTENT);
  });

  app.openapi(saveSelfReport, async (c) => {
    const session = requireSession(c);
    const report = storedSelfReportSchema.parse(c.req.valid('json'));
    const user = await deps.repos.users.setSelfReport(session.userId, report);
    if (user === undefined) {
      throw unauthenticated();
    }
    return c.json(report, OK);
  });

  app.openapi(me, async (c) => {
    const session = requireSession(c);
    const user = await deps.repos.users.findById(session.userId);
    if (user === undefined) {
      throw unauthenticated();
    }
    return c.json(presentMe(user), OK);
  });
}
