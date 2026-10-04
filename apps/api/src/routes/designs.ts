import { createRoute, z } from '@hono/zod-openapi';

import type { Session } from '@parkshape/auth';
import type { Design } from '@parkshape/db';

import {
  errorBodySchema,
  errorResponses,
  idParamsSchema,
  jsonBody,
  jsonContent,
} from '../contracts/common.js';
import {
  createDesignBodySchema,
  designListSchema,
  designSchema,
  draftChangedSchema,
  saveDraftBodySchema,
  submitResultSchema,
  thumbnailBodySchema,
} from '../contracts/projects-designs.js';
import type { ApiApp, AppDeps } from '../deps.js';
import { HTTP_CONFLICT, HTTP_CREATED, HTTP_OK } from '../http-status.js';
import { requireSession } from '../middleware/http.js';
import { authorsFor, presentDesign, presentSummaries, viewerFor } from '../presenters.js';
import { loadProject, loadVisibleDesign, takeToken } from '../services/access.js';
import {
  createDraft,
  saveDraft,
  setThumbnail,
  submitDesign,
  versionDesign,
} from '../services/designs.js';

/** The 409 body for a stale stamp: the error envelope every client reads, and the stored draft. */
function draftChanged(current: z.infer<typeof designSchema>, requestId: string) {
  const message = 'This draft was saved from another tab or device after the stamp you sent.';
  return {
    code: 'draftChanged' as const,
    error: { kind: 'draftChanged' as const, message, requestId },
    current,
  };
}

const designContent = (description: string) => jsonContent(designSchema, description);

const createDesign = createRoute({
  method: 'post',
  path: '/projects/{id}/designs',
  operationId: 'createDesign',
  tags: ['designs'],
  summary: 'Start a draft from blank, a fork of a live design, the baseline, or a description',
  request: { params: idParamsSchema, body: jsonBody(createDesignBodySchema) },
  responses: {
    [HTTP_CREATED]: designContent('The new draft.'),
    ...errorResponses(
      'invalid',
      'unauthenticated',
      'not-found',
      'conflict',
      'site-data-unavailable',
      'feature-off',
    ),
  },
});

const listDesigns = createRoute({
  method: 'get',
  path: '/projects/{id}/designs',
  operationId: 'listDesigns',
  tags: ['designs'],
  summary: 'The gallery: live designs, newest first',
  request: { params: idParamsSchema },
  responses: {
    [HTTP_OK]: jsonContent(designListSchema, 'Live designs.'),
    ...errorResponses('not-found'),
  },
});

const getDesign = createRoute({
  method: 'get',
  path: '/designs/{id}',
  operationId: 'getDesign',
  tags: ['designs'],
  summary: 'One design; drafts only for their author, except the baseline for signed-in users',
  request: { params: idParamsSchema },
  responses: { [HTTP_OK]: designContent('The design.'), ...errorResponses('not-found') },
});

const saveDesign = createRoute({
  method: 'put',
  path: '/designs/{id}',
  operationId: 'saveDesign',
  tags: ['designs'],
  summary: 'Save a draft',
  request: { params: idParamsSchema, body: jsonBody(saveDraftBodySchema) },
  responses: {
    [HTTP_OK]: designContent('The saved draft.'),
    ...errorResponses(
      'invalid',
      'unauthenticated',
      'forbidden',
      'not-found',
      'too-large',
      'rate-limited',
      'unavailable',
    ),
    [HTTP_CONFLICT]: jsonContent(
      z.union([draftChangedSchema, errorBodySchema]),
      'DraftChanged when expectedUpdatedAt is stale; otherwise the design is not a draft or the project is closed.',
    ),
  },
});

const submit = createRoute({
  method: 'post',
  path: '/designs/{id}/submit',
  operationId: 'submitDesign',
  tags: ['designs'],
  summary: 'Submit a draft; the server computes metrics, blocks hard failures and badges soft ones',
  request: { params: idParamsSchema },
  responses: {
    [HTTP_OK]: jsonContent(submitResultSchema, 'The submit result with metrics and any failures.'),
    ...errorResponses(
      'invalid',
      'unauthenticated',
      'forbidden',
      'not-found',
      'conflict',
      'unprocessable',
      'rate-limited',
      'unavailable',
    ),
  },
});

const thumbnail = createRoute({
  method: 'post',
  path: '/designs/{id}/thumbnail',
  operationId: 'setDesignThumbnail',
  tags: ['designs'],
  summary: 'Store the design thumbnail, WebP or PNG, captured after submit',
  request: { params: idParamsSchema, body: jsonBody(thumbnailBodySchema) },
  responses: {
    [HTTP_OK]: designContent('The design with its thumbnail URL.'),
    ...errorResponses(
      'invalid',
      'unauthenticated',
      'forbidden',
      'not-found',
      'conflict',
      'too-large',
      'rate-limited',
      'unavailable',
    ),
  },
});

const version = createRoute({
  method: 'post',
  path: '/designs/{id}/version',
  operationId: 'versionDesign',
  tags: ['designs'],
  summary: 'Start a new draft version of a live design; the old one is superseded',
  request: { params: idParamsSchema },
  responses: {
    [HTTP_CREATED]: designContent('The new draft version.'),
    ...errorResponses('unauthenticated', 'forbidden', 'not-found', 'conflict'),
  },
});

export async function presentOne(deps: AppDeps, design: Design, session: Session | undefined) {
  const viewer = await viewerFor(deps.repos, session);
  const authors = await authorsFor(deps.repos, [design], viewer);
  const successor = await deps.repos.designs.findVersionOf(design.id);
  const urlFor = (key: string) => deps.blobStore.url(key);
  return presentDesign(design, authors.get(design.id) ?? null, urlFor, successor?.id ?? null);
}

/** PUT /designs/{id}: a save with a stale expectedUpdatedAt answers 409 with the stored draft. */
function registerSaveRoute(app: ApiApp, deps: AppDeps): void {
  app.openapi(saveDesign, async (c) => {
    const session = requireSession(c);
    await takeToken(deps.limits.draftSaves, session.userId, 'saves');
    const result = await saveDraft(deps, session, c.req.valid('param').id, c.req.valid('json'));
    if (result.kind === 'changed') {
      const current = await presentOne(deps, result.current, session);
      return c.json(draftChanged(current, c.get('requestId')), HTTP_CONFLICT);
    }
    return c.json(await presentOne(deps, result.design, session), HTTP_OK);
  });
}

export function registerDesignRoutes(app: ApiApp, deps: AppDeps): void {
  const urlFor = (key: string) => deps.blobStore.url(key);
  const present = (design: Design, session: Session | undefined) =>
    presentOne(deps, design, session);

  app.openapi(createDesign, async (c) => {
    const session = requireSession(c);
    const design = await createDraft(deps, session, c.req.valid('param').id, c.req.valid('json'));
    return c.json(await present(design, session), HTTP_CREATED);
  });

  app.openapi(listDesigns, async (c) => {
    const { id } = c.req.valid('param');
    await loadProject(deps.repos, id);
    const designs = await deps.repos.designs.listByProject(id, 'submitted');
    const viewer = await viewerFor(deps.repos, c.get('session'));
    return c.json(
      { designs: await presentSummaries(deps.repos, designs, viewer, urlFor) },
      HTTP_OK,
    );
  });

  app.openapi(getDesign, async (c) => {
    const session = c.get('session');
    const design = await loadVisibleDesign(deps.repos, c.req.valid('param').id, session?.userId);
    return c.json(await present(design, session), HTTP_OK);
  });

  registerSaveRoute(app, deps);

  app.openapi(submit, async (c) => {
    const session = requireSession(c);
    const outcome = await submitDesign(deps, session, c.req.valid('param').id);
    return c.json(outcome, HTTP_OK);
  });

  app.openapi(thumbnail, async (c) => {
    const session = requireSession(c);
    await takeToken(deps.limits.thumbnails, session.userId, 'thumbnails');
    const design = await setThumbnail(
      deps,
      session,
      c.req.valid('param').id,
      c.req.valid('json').image,
    );
    return c.json(await present(design, session), HTTP_OK);
  });

  app.openapi(version, async (c) => {
    const session = requireSession(c);
    const design = await versionDesign(deps, session, c.req.valid('param').id);
    return c.json(await present(design, session), HTTP_CREATED);
  });
}
