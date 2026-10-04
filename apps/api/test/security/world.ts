import { BLANK, createDraft, createProject, submitGarden } from '../fixtures.js';
import {
  KEVIN,
  BOB,
  MOLLY,
  STAFF,
  startHarness,
  type CallOptions,
  type Harness,
} from '../harness.js';

export type Role = 'guest' | 'residentA' | 'residentB' | 'staff';
export const ROLES: readonly Role[] = ['guest', 'residentA', 'residentB', 'staff'];

const PERSONA_BY_ROLE: Readonly<Record<Exclude<Role, 'guest'>, string>> = {
  residentA: BOB,
  residentB: MOLLY,
  staff: STAFF,
};

// Limits high enough that a probe never reads a 429 where it expects the route's own answer.
const GENEROUS_LIMIT = '1000000';
export const SECURITY_ENV = {
  RATE_LIMIT_VOTES_PER_MINUTE: GENEROUS_LIMIT,
  RATE_LIMIT_SUBMISSIONS_PER_HOUR: GENEROUS_LIMIT,
  RATE_LIMIT_LOGINS_PER_MINUTE: GENEROUS_LIMIT,
  RATE_LIMIT_INTENTS_PER_MINUTE: GENEROUS_LIMIT,
  RATE_LIMIT_DRAFT_SAVES_PER_MINUTE: GENEROUS_LIMIT,
  RATE_LIMIT_THUMBNAILS_PER_HOUR: GENEROUS_LIMIT,
  RATE_LIMIT_COMMENTS_PER_MINUTE: GENEROUS_LIMIT,
};

// The eight-byte PNG signature and padding; the thumbnail route sniffs the magic bytes.
export const PNG_BASE64 = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]).toString('base64');

/** Two residents and staff over one project, with A's private and public work in place. */
export interface World {
  readonly h: Harness;
  readonly cookies: Readonly<Record<Role, string | undefined>>;
  readonly userIds: Readonly<Record<'residentA' | 'residentB' | 'staff', string>>;
  readonly projectId: string;
  readonly baselineId: string;
  readonly draftId: string;
  readonly liveId: string;
  /** A design by a third resident that A voted on. */
  readonly votedId: string;
  /** A's comment on the garden of the design A voted on. */
  readonly commentId: string;
  /** Like the harness call, but keeps non-JSON bodies such as CSV and images as text. */
  call(method: string, path: string, options?: RawCallOptions): Promise<RawResult>;
  cookieFor(role: Role): Promise<string | undefined>;
  freshDraft(): Promise<string>;
  freshLive(): Promise<string>;
  /** A new open project, for probes that change its status. */
  freshProject(): Promise<string>;
}

export interface RawResult {
  readonly status: number;
  /** The parsed JSON body, or undefined when the answer is not JSON. */
  readonly body: unknown;
  readonly text: string;
  readonly headers: Headers;
}

/** Sends one request straight to the app and reads the answer as text first. */
export interface RawCallOptions extends CallOptions {
  /** Sent as the JSON body text unchanged, for bodies JSON.stringify cannot produce. */
  readonly rawBody?: string;
}

export async function rawCall(
  h: Harness,
  request: { readonly method: string; readonly path: string },
  options: RawCallOptions = {},
): Promise<RawResult> {
  const headers: Record<string, string> = { ...options.headers };
  if (options.cookie !== undefined) headers.Cookie = options.cookie;
  const init: RequestInit = { method: request.method, headers };
  const text =
    options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
  if (text !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = text;
  }
  const response = await h.app.request(request.path, init);
  const answer = await response.text();
  const json = response.headers.get('Content-Type')?.includes('application/json') === true;
  return {
    status: response.status,
    body: json && answer !== '' ? (JSON.parse(answer) as unknown) : undefined,
    text: answer,
    headers: response.headers,
  };
}

async function userIdOf(h: Harness, cookie: string): Promise<string> {
  const me = await h.call('GET', '/me', { cookie });
  return (me.body as { user: { id: string } }).user.id;
}

export async function startWorld(env: Record<string, string> = {}): Promise<World> {
  const h = await startHarness({ ...SECURITY_ENV, ...env });
  const login = async (persona: string) => {
    const body = { persona, accessCode: env.STAFF_ACCESS_CODE };
    const response = await h.call('POST', '/auth/login', { body });
    return (response.headers.get('Set-Cookie') ?? '').split(';')[0] ?? '';
  };
  const staff = await login(STAFF);
  const a = await login(BOB);
  const b = await login(MOLLY);
  const c = await login(KEVIN);
  const project = await createProject(h, staff, { baselineDocument: BLANK });
  const draft = await createDraft(h, a, project.id);
  const live = await submitGarden(h, a, project.id);
  const voted = await submitGarden(h, c, project.id);
  await h.call('POST', `/designs/${draft.id}/thumbnail`, {
    cookie: a,
    body: { image: PNG_BASE64 },
  });
  await h.call('POST', `/designs/${live.id}/thumbnail`, { cookie: a, body: { image: PNG_BASE64 } });
  await h.call('POST', '/votes', {
    cookie: a,
    body: { designId: voted.id, value: 1, reasons: [] },
  });
  await h.call('PATCH', '/me/self-report', { cookie: a, body: { fsa: 'V5T', ageBand: '30-44' } });
  const comment = await h.call('POST', `/designs/${voted.id}/comments`, {
    cookie: a,
    body: { elementId: 'garden-1', kind: 'keep', text: 'Keep the beds.' },
  });
  const cookies = { guest: undefined, residentA: a, residentB: b, staff };
  return {
    h,
    cookies,
    userIds: {
      residentA: await userIdOf(h, a),
      residentB: await userIdOf(h, b),
      staff: await userIdOf(h, staff),
    },
    projectId: project.id,
    baselineId: project.baselineDesignId ?? '',
    draftId: draft.id,
    liveId: live.id,
    votedId: voted.id,
    commentId: (comment.body as { comment: { id: string } }).comment.id,
    call: (method, path, options) => rawCall(h, { method, path }, options),
    cookieFor: async (role) => (role === 'guest' ? undefined : login(PERSONA_BY_ROLE[role])),
    freshDraft: async () => (await createDraft(h, a, project.id)).id,
    freshLive: async () => (await submitGarden(h, a, project.id)).id,
    freshProject: async () => (await createProject(h, staff)).id,
  };
}
