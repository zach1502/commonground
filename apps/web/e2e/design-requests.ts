import type { APIRequestContext } from '@playwright/test';

import { API_URL } from './urls.ts';

export type DraftSource = 'baseline' | 'blank';

export interface DraftContent {
  readonly title: string;
  readonly document: object;
}

/** The project global setup made; the first one the API lists. */
export async function firstProjectId(request: APIRequestContext): Promise<string> {
  const response = await request.get(`${API_URL}/projects`);
  const { projects } = (await response.json()) as { projects: { id: string }[] };
  const [first] = projects;
  if (first === undefined) throw new Error('global setup did not create a project');
  return first.id;
}

/** Starts a draft as whoever is signed in on `request`; returns its id. */
export async function createDraft(
  request: APIRequestContext,
  projectId: string,
  start: { readonly from: DraftSource; readonly title?: string },
): Promise<string> {
  const created = await request.post(`${API_URL}/projects/${projectId}/designs`, { data: start });
  return ((await created.json()) as { id: string }).id;
}

const HTTP_OK = 200;
const HTTP_UNAVAILABLE = 503;
const DEFAULT_RETRY_AFTER_SECONDS = 5;
const MS_PER_SECOND = 1000;

/** The submit result the server returns once metrics pass. */
export interface SubmitOutcome {
  readonly status: string;
  readonly hardFailures: readonly unknown[];
  readonly softWarnings: readonly unknown[];
  readonly thumbnailPending?: boolean;
}

function retryAfterSeconds(headers: Record<string, string>): number {
  const value = Number(headers['retry-after']);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_RETRY_AFTER_SECONDS;
}

/**
 * Submits a draft and returns its outcome. A busy metrics worker pool answers 503 with a
 * Retry-After, and the shipped web client waits it out and submits once more, so this does the
 * same, once, never in a loop. Any other status or a body without hardFailures throws with the
 * status and body, so a failure under load names its cause instead of a bare length assertion.
 */
export async function submitForReview(
  request: APIRequestContext,
  designId: string,
): Promise<SubmitOutcome> {
  let response = await request.post(`${API_URL}/designs/${designId}/submit`);
  if (response.status() === HTTP_UNAVAILABLE) {
    await new Promise((resolve) =>
      setTimeout(resolve, retryAfterSeconds(response.headers()) * MS_PER_SECOND),
    );
    response = await request.post(`${API_URL}/designs/${designId}/submit`);
  }
  const body = await response.text();
  if (response.status() !== HTTP_OK) {
    throw new Error(`submit ${designId} answered ${String(response.status())}: ${body}`);
  }
  const outcome = JSON.parse(body) as Partial<SubmitOutcome>;
  if (!Array.isArray(outcome.hardFailures)) {
    throw new Error(`submit ${designId} returned no hardFailures: ${body}`);
  }
  return outcome as SubmitOutcome;
}

/** Forks the baseline under `content.title` and saves `content.document` into it, unsubmitted. */
export async function saveBaselineFork(
  request: APIRequestContext,
  projectId: string,
  content: DraftContent,
): Promise<string> {
  const { title, document } = content;
  const id = await createDraft(request, projectId, { from: 'baseline', title });
  await request.put(`${API_URL}/designs/${id}`, { data: { title, blurb: '', document } });
  return id;
}
