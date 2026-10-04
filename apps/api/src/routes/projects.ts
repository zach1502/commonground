import { createRoute, type z } from '@hono/zod-openapi';

import type { Session } from '@parkshape/auth';
import type { Project } from '@parkshape/db';

import { errorResponses, idParamsSchema, jsonBody, jsonContent } from '../contracts/common.js';
import {
  createProjectBodySchema,
  designSchema,
  projectListSchema,
  projectSchema,
  projectStatusBodySchema,
} from '../contracts/projects-designs.js';
import type { ApiApp, AppDeps } from '../deps.js';
import { notFound, projectExists } from '../errors.js';
import { HTTP_CREATED, HTTP_OK } from '../http-status.js';
import { requireSession, requireStaff } from '../middleware/http.js';
import { presentProject } from '../presenters.js';
import { loadProject, loadVisibleDesign } from '../services/access.js';
import { applyStatusChange } from '../services/project-status.js';

import { presentOne } from './designs.js';

const listProjects = createRoute({
  method: 'get',
  path: '/projects',
  operationId: 'listProjects',
  tags: ['projects'],
  summary: 'Every project, oldest first',
  responses: { [HTTP_OK]: jsonContent(projectListSchema, 'The projects.') },
});

const createProject = createRoute({
  method: 'post',
  path: '/projects',
  operationId: 'createProject',
  tags: ['projects'],
  summary: 'Start a project (staff only)',
  request: { body: jsonBody(createProjectBodySchema) },
  responses: {
    [HTTP_CREATED]: jsonContent(projectSchema, 'The new project.'),
    ...errorResponses('invalid', 'unauthenticated', 'forbidden', 'project-exists'),
  },
});

const getProject = createRoute({
  method: 'get',
  path: '/projects/{id}',
  operationId: 'getProject',
  tags: ['projects'],
  summary: 'One project',
  request: { params: idParamsSchema },
  responses: {
    [HTTP_OK]: jsonContent(projectSchema, 'The project.'),
    ...errorResponses('not-found'),
  },
});

const setProjectStatus = createRoute({
  method: 'patch',
  path: '/projects/{id}/status',
  operationId: 'setProjectStatus',
  tags: ['projects'],
  summary: 'Open or close a project (staff only)',
  request: { params: idParamsSchema, body: jsonBody(projectStatusBodySchema) },
  responses: {
    [HTTP_OK]: jsonContent(projectSchema, 'The updated project.'),
    ...errorResponses('invalid', 'unauthenticated', 'forbidden', 'not-found', 'conflict'),
  },
});

const getBaseline = createRoute({
  method: 'get',
  path: '/projects/{id}/baseline',
  operationId: 'getProjectBaseline',
  tags: ['projects'],
  summary: 'The baseline design: the park as it is today',
  request: { params: idParamsSchema },
  responses: {
    [HTTP_OK]: jsonContent(designSchema, 'The baseline design.'),
    ...errorResponses('unauthenticated', 'not-found'),
  },
});

type CreateProjectBody = z.infer<typeof createProjectBodySchema>;

/**
 * Creates the project, and its baseline when the wizard sent one. A second project with a name
 * this staff member already uses is refused, so a double-submitted wizard makes one project.
 */
async function createStaffProject(
  deps: AppDeps,
  staff: Session,
  body: CreateProjectBody,
): Promise<Project> {
  const { baselineDocument, zones = [], closesAt = null, ...input } = body;
  const parameters = {
    ...input.parameters,
    forbiddenZones: [...input.parameters.forbiddenZones, ...zones],
  };
  const created = await deps.repos.projects.create({
    ...input,
    authorId: staff.userId,
    parameters,
    closesAt,
  });
  if (created.kind === 'name-taken') throw projectExists(input.name);
  const { project } = created;
  if (baselineDocument === undefined) return project;
  // The baseline stays a staff-owned draft, so it never shows in the gallery or queue.
  const baseline = await deps.repos.designs.create({
    projectId: project.id,
    authorId: staff.userId,
    title: 'Current park',
    blurb: 'The park as it is today.',
    document: baselineDocument,
    forkedFrom: null,
  });
  return (await deps.repos.projects.setBaselineDesign(project.id, baseline.id)) ?? project;
}

export function registerProjectRoutes(app: ApiApp, deps: AppDeps): void {
  const present = (project: Project) => presentProject(project, deps.clock.now());

  app.openapi(listProjects, async (c) => {
    const projects = await deps.repos.projects.list();
    return c.json({ projects: projects.map(present) }, HTTP_OK);
  });

  app.openapi(createProject, async (c) => {
    const project = await createStaffProject(deps, requireStaff(c), c.req.valid('json'));
    return c.json(present(project), HTTP_CREATED);
  });

  app.openapi(getProject, async (c) => {
    const project = await loadProject(deps.repos, c.req.valid('param').id);
    return c.json(present(project), HTTP_OK);
  });

  app.openapi(setProjectStatus, async (c) => {
    requireStaff(c);
    const current = await loadProject(deps.repos, c.req.valid('param').id);
    const change = c.req.valid('json');
    const project = await applyStatusChange(deps, current, change);
    return c.json(present(project), HTTP_OK);
  });

  app.openapi(getBaseline, async (c) => {
    const session = requireSession(c);
    const project = await loadProject(deps.repos, c.req.valid('param').id);
    if (project.baselineDesignId === null) {
      throw notFound('The baseline design');
    }
    const design = await loadVisibleDesign(deps.repos, project.baselineDesignId, session.userId);
    return c.json(await presentOne(deps, design, session), HTTP_OK);
  });
}
