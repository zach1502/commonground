import { redirect, type LoaderFunctionArgs } from 'react-router';

import { ApiRequestError } from '@parkshape/api-client';
import { QUEUE_BATCH_SIZE, type Heightmap } from '@parkshape/core';

import { failureKind } from '../api/link-failure';
import type { Design, Project, Role, User } from '../api/web-api';
import type { WebDeps } from '../app-deps';
import { editorSnapshotFor, keepEditorSnapshot, type EditorData } from '../editor/offline-editor';
import { prefetchDesign } from '../features/vote/prefetch';
import { preloadPoster } from '../features/vote/preload-poster';

import { earlyQueueOr } from './early-queue';
import {
  guardRedirect,
  loginRedirect,
  nextAfterLogin,
  RETURN_TO_PARAM,
  safeReturnTo,
} from './guards';
import { NotFoundError } from './not-found';
import { PATHS } from './paths';

const NOT_FOUND = 404;

type ProjectArgs = Pick<LoaderFunctionArgs, 'params' | 'request'>;

/** The task a person aimed at, read from the current URL and kept only when same-origin. */
function returnToFrom(request: Request | undefined): string | null {
  if (request === undefined) return null;
  return safeReturnTo(new URL(request.url).searchParams.get(RETURN_TO_PARAM));
}

export async function notFoundOn404<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    throw error instanceof ApiRequestError && error.status === NOT_FOUND
      ? new NotFoundError()
      : error;
  }
}

type SessionFor = (audience: Role, request?: Request) => Promise<User | Response>;

export interface LandingStats {
  readonly designs: number;
  readonly votes: number;
}

/** Every project with its design count, for the project list. */
async function projectsWithCounts(api: WebDeps['api']) {
  const projects = await api.listProjects();
  const designCounts = await Promise.all(projects.map((project) => api.countDesigns(project.id)));
  return { projects, designCounts };
}

/** Designs and votes so far on the open project; the page opens without them if they fail. */
type Deadline = Pick<Project, 'phase' | 'closesAt'>;
const deadlineOf = ({ phase, closesAt }: Deadline): Deadline => ({ phase, closesAt });

/**
 * Voting links to the first project in its open phase. With none open, the landing line still
 * reports the newest project's deadline, so it can say design is closed.
 */
async function landingData(api: WebDeps['api']) {
  const projects = await api.listProjects();
  const open = projects.find((project) => project.phase === 'open');
  if (open === undefined) {
    const latest = projects.at(-1);
    const deadline = latest === undefined ? null : deadlineOf(latest);
    return { voteHref: PATHS.projects, galleryHref: null, stats: null, deadline };
  }
  const stats = await landingStats(api, open.id);
  return {
    voteHref: PATHS.vote(open.id),
    galleryHref: PATHS.gallery(open.id),
    stats,
    deadline: deadlineOf(open),
  };
}

async function landingStats(api: WebDeps['api'], projectId: string): Promise<LandingStats | null> {
  try {
    const designs = await api.listDesigns(projectId);
    const votes = designs.reduce((sum, design) => sum + design.up + design.down, 0);
    return { designs: designs.length, votes };
  } catch {
    return null;
  }
}

/** The park today, for the project page picture; null with no baseline or when it fails. */
async function baselineOf(api: WebDeps['api'], project: Project): Promise<Design | null> {
  const id = project.baselineDesignId;
  // An empty id, like a null one, names no design.
  if (id === null || id === '') return null;
  try {
    return await api.getDesign(id);
  } catch {
    return null;
  }
}

/** The project's recorded ground; null when it fails, so the view falls back to flat ground. */
async function terrainOf(api: WebDeps['api'], projectId: string): Promise<Heightmap | null> {
  try {
    return await api.getTerrain(projectId);
  } catch {
    return null;
  }
}

/** The editor's data from the API: the user, project, draft, baseline and ground. */
async function editorData(
  api: WebDeps['api'],
  sessionFor: SessionFor,
  { params, request }: ProjectArgs,
): Promise<EditorData | Response> {
  const user = await sessionFor('resident', request);
  if (user instanceof Response) return user;
  const id = params.id ?? '';
  const terrain = terrainOf(api, id);
  const [project, design] = await notFoundOn404(() =>
    Promise.all([api.getProject(id), api.getDesign(params.designId ?? '')]),
  );
  // The baseline lets the meters count a kept garden's recorded plots, as the server does.
  return {
    user,
    project,
    design,
    baseline: await baselineOf(api, project),
    terrain: await terrain,
  };
}

/**
 * The editor keeps its last load on this device. With no link to the API it opens from that
 * copy, and the draft's own changes come from the local draft cache.
 */
function editorLoader(api: WebDeps['api'], storage: Storage, sessionFor: SessionFor) {
  return async ({ params, request }: ProjectArgs) => {
    try {
      const data = await editorData(api, sessionFor, { params, request });
      if (!(data instanceof Response)) keepEditorSnapshot(storage, data);
      return data;
    } catch (error) {
      const kept =
        failureKind(error) === 'link' ? editorSnapshotFor(storage, params.designId ?? '') : null;
      if (kept === null) throw error;
      return kept;
    }
  };
}

/** Loaders for starting and editing a design. */
function designLoaders(
  { api, describeIt, editor }: Pick<WebDeps, 'api' | 'describeIt' | 'editor'>,
  sessionFor: SessionFor,
) {
  return {
    newDesign: async ({ params, request }: ProjectArgs) => {
      const user = await sessionFor('resident', request);
      if (user instanceof Response) return user;
      return { project: await notFoundOn404(() => api.getProject(params.id ?? '')), describeIt };
    },
    vote: async ({ params, request }: ProjectArgs) => {
      // The queue starts beside the session check and carries the project and the first
      // picture, so the page waits for one round trip, not three. On a first visit index.html
      // has started it already.
      const id = params.id ?? '';
      const queue = earlyQueueOr(window, id, () => api.getQueue(id, QUEUE_BATCH_SIZE));
      queue.catch(() => undefined);
      const user = await sessionFor('resident', request);
      if (user instanceof Response) return user;
      const batch = await notFoundOn404(() => queue);
      preloadPoster(document.head, batch.poster);
      // Only a card with no stored picture needs its document before it can draw.
      const first = batch.designs[0];
      return {
        project: batch.project,
        queue: batch,
        prefetched: prefetchDesign(api, first?.thumbnailUrl === null ? first.id : undefined),
      };
    },
    editor: editorLoader(api, editor.storage.local, sessionFor),
  };
}

/** Public loaders for the gallery and the read-only design page. */
function viewLoaders(api: WebDeps['api']) {
  return {
    gallery: async ({ params }: ProjectArgs) => {
      const id = params.id ?? '';
      return notFoundOn404(async () => {
        const [project, designs] = await Promise.all([api.getProject(id), api.listDesigns(id)]);
        return { project, designs };
      });
    },
    leaderboard: async ({ params }: ProjectArgs) => {
      const id = params.id ?? '';
      return notFoundOn404(async () => {
        const [project, board] = await Promise.all([api.getProject(id), api.getLeaderboard(id)]);
        return { project, board };
      });
    },
    designView: async ({ params }: ProjectArgs) => {
      const user = await api.getMe();
      return notFoundOn404(async () => {
        const design = await api.getDesign(params.designId ?? '');
        // The 3D view reuses this request once three.js has loaded.
        api.getTerrain(design.projectId).catch(() => undefined);
        const project = await api.getProject(design.projectId);
        return { user, design, project };
      });
    },
  };
}

/**
 * Shares one /me request between loaders that run in the same navigation. The root loader and
 * the page loader start together, so the second caller reuses the request still in flight.
 */
function sharedSession(api: WebDeps['api']): () => Promise<User | null> {
  let inFlight: Promise<User | null> | null = null;
  return () => {
    inFlight ??= api.getMe().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}

/** Data loaders for each route. Guarded loaders return a redirect for the wrong visitor. */
/** The signed-in user for the page frame; with no link to the API, the frame opens signed out. */
async function frameUser(api: WebDeps['api']): Promise<User | null> {
  try {
    return await api.getMe();
  } catch (error) {
    if (failureKind(error) === 'link') return null;
    throw error;
  }
}

/** Redirects a signed-out or wrong-audience visitor; a signed-out resident keeps their target. */
function makeSessionFor(api: WebDeps['api']): SessionFor {
  return async function sessionFor(audience: Role, request?: Request): Promise<User | Response> {
    const user = await api.getMe();
    const target = guardRedirect(audience, user);
    if (user === null || target !== null) {
      if (user === null && audience === 'resident' && request !== undefined) {
        const url = new URL(request.url);
        return redirect(loginRedirect(`${url.pathname}${url.search}`));
      }
      return redirect(target ?? PATHS.login);
    }
    return user;
  };
}

/** The project, its design count and the park today, or a 404 for an unknown id. */
function loadProject(api: WebDeps['api'], id: string) {
  return notFoundOn404(async () => {
    const [project, designCount] = await Promise.all([api.getProject(id), api.countDesigns(id)]);
    return { project, designCount, baseline: await baselineOf(api, project) };
  });
}

/** The resident login loader: sends a signed-in visitor on, else lists the audience's personas. */
function loginLoader(api: WebDeps['api']) {
  return (audience: Role) => async (loaderArgs?: Pick<LoaderFunctionArgs, 'request'>) => {
    const user = await api.getMe();
    if (user !== null) {
      return redirect(nextAfterLogin(user, { has: () => true }, returnToFrom(loaderArgs?.request)));
    }
    const { personas, staffCodeRequired } = await api.listPersonas();
    return {
      personas: personas.filter((persona) => persona.role === audience),
      staffCodeRequired,
    };
  };
}

/** Guarded resident pages: the self-report, the project list and one project. */
function residentPageLoaders(api: WebDeps['api'], sessionFor: SessionFor) {
  return {
    selfReport: async () => {
      const user = await sessionFor('resident');
      return user instanceof Response ? user : { user };
    },
    projects: async () => {
      const user = await sessionFor('resident');
      return user instanceof Response ? user : projectsWithCounts(api);
    },
    project: async ({ params, request }: ProjectArgs) => {
      const user = await sessionFor('resident', request);
      return user instanceof Response ? user : loadProject(api, params.id ?? '');
    },
  };
}

/** Guarded planner pages: the project list and the pages that only need a signed-in planner. */
function staffLoaders(api: WebDeps['api'], sessionFor: SessionFor) {
  return {
    staff: async () => {
      const user = await sessionFor('staff');
      return user instanceof Response ? user : { projects: await api.listProjects() };
    },
    staffOnly: async () => {
      const user = await sessionFor('staff');
      return user instanceof Response ? user : { user };
    },
  };
}

export function createLoaders({ api: baseApi, describeIt, editor }: WebDeps) {
  const getMe = sharedSession(baseApi);
  const api: WebDeps['api'] = { ...baseApi, getMe };
  const sessionFor = makeSessionFor(api);
  return {
    root: async () => ({ user: await frameUser(api) }),
    landing: () => landingData(api),
    login: loginLoader(api),
    ...residentPageLoaders(api, sessionFor),
    ...viewLoaders(api),
    ...designLoaders({ api, describeIt, editor }, sessionFor),
    ...staffLoaders(api, sessionFor),
    sessionFor,
  };
}

export type Loaders = ReturnType<typeof createLoaders>;
