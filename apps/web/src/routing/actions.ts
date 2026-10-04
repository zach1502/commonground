import { redirect, type ActionFunctionArgs } from 'react-router';

import { ApiRequestError } from '@parkshape/api-client';

import { failureCopyFor } from '../api/error-copy';
import type { DesignStart } from '../api/web-api';
import type { WebDeps } from '../app-deps';
import { forgetLocalDrafts } from '../editor/local-draft';
import { forgetEditorSnapshot } from '../editor/offline-editor';
import { validateSelfReport } from '../session/self-report';

import { nextAfterLogin, RETURN_TO_PARAM, safeReturnTo } from './guards';
import type { Loaders } from './loaders';
import { PATHS } from './paths';

type ActionArgs = Pick<ActionFunctionArgs, 'request'>;
type ProjectActionArgs = Pick<ActionFunctionArgs, 'request' | 'params'>;

/** The task a person aimed at, read from the current URL and kept only when same-origin. */
function returnToOf(request: Request): string | null {
  return safeReturnTo(new URL(request.url).searchParams.get(RETURN_TO_PARAM));
}

export interface NewDesignBody {
  readonly from: DesignStart;
}

export interface LoginBody {
  readonly persona: string;
  readonly accessCode?: string;
}

export type SelfReportBody =
  | { readonly intent: 'skip' }
  | { readonly intent: 'save'; readonly fsa: string; readonly ageBand: string | null };

export interface StatusBody {
  readonly id: string;
  readonly status: 'open' | 'closed';
}

export interface StatusError {
  readonly error: 'status-failed';
}

export type ActionError =
  | { readonly error: 'login-failed' }
  | { readonly error: 'access-code-refused' }
  | { readonly error: 'rate-limited'; readonly message: string; readonly retryAfterSeconds: number }
  | { readonly error: 'invalid-fsa' }
  | { readonly error: 'save-failed' }
  | { readonly error: 'start-failed' };

/** A refused staff access code and a rate limit get their own copy; any other failure is generic. */
function loginError(error: unknown): ActionError {
  if (error instanceof ApiRequestError && error.kind === 'access-code-refused') {
    return { error: 'access-code-refused' };
  }
  const copy = failureCopyFor(error, 'login');
  if (copy.action === 'wait') {
    return {
      error: 'rate-limited',
      message: copy.message,
      retryAfterSeconds: copy.waitSeconds ?? 0,
    };
  }
  return { error: 'login-failed' };
}

async function jsonBody<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}

/** A shared device keeps no one's drafts once they sign out, even if the request fails. */
async function signOut(api: WebDeps['api'], device: Storage): Promise<Response> {
  forgetLocalDrafts(device);
  forgetEditorSnapshot(device);
  await api.logout();
  return redirect(PATHS.home);
}

/** Form actions: pages submit JSON bodies and read errors back with useActionData. */
export function createActions({ api, selfReports, editor }: WebDeps, loaders: Loaders) {
  return {
    login: async ({ request }: ActionArgs): Promise<ActionError | Response> => {
      const { persona, accessCode } = await jsonBody<LoginBody>(request);
      const returnTo = returnToOf(request);
      try {
        const user = await api.login(persona, accessCode);
        return redirect(nextAfterLogin(user, selfReports, returnTo));
      } catch (error) {
        return loginError(error);
      }
    },
    newDesign: async ({ request, params }: ProjectActionArgs): Promise<ActionError | Response> => {
      const projectId = params.id ?? '';
      const { from } = await jsonBody<NewDesignBody>(request);
      try {
        const design = await api.createDesign(projectId, from);
        return redirect(PATHS.design(projectId, design.id));
      } catch {
        return { error: 'start-failed' };
      }
    },
    projectStatus: async ({ request }: ActionArgs): Promise<StatusError | Response | null> => {
      const user = await loaders.sessionFor('staff');
      if (user instanceof Response) return user;
      const { id, status } = await jsonBody<StatusBody>(request);
      try {
        await api.setProjectStatus(id, status);
        return null;
      } catch {
        return { error: 'status-failed' };
      }
    },
    logout: () => signOut(api, editor.storage.local),
    selfReport: async ({ request }: ActionArgs): Promise<ActionError | Response> => {
      const user = await loaders.sessionFor('resident');
      if (user instanceof Response) {
        return user;
      }
      const body = await jsonBody<SelfReportBody>(request);
      const returnTo = returnToOf(request);
      const next = returnTo ?? PATHS.projects;
      if (body.intent === 'skip') {
        selfReports.save(user.id, { kind: 'skipped' });
        return redirect(next);
      }
      const result = validateSelfReport(body);
      if (result.kind === 'invalid-fsa') {
        return { error: 'invalid-fsa' };
      }
      try {
        await api.saveSelfReport(result.report);
      } catch {
        return { error: 'save-failed' };
      }
      selfReports.save(user.id, { kind: 'answered', report: result.report });
      return redirect(next);
    },
  };
}
