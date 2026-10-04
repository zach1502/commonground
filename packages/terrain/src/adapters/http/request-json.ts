import { z } from 'zod';

import { err, ok, type Result } from '@parkshape/core';

import type { HttpError, HttpFetch } from '../../ports/http.js';

export interface JsonRequest<S extends z.ZodType> {
  readonly fetch: HttpFetch;
  readonly url: string;
  readonly init?: RequestInit;
  readonly schema: S;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** Fetches JSON and parses it with the schema. Every failure comes back as an HttpError. */
export async function requestJson<S extends z.ZodType>(
  request: JsonRequest<S>,
): Promise<Result<z.output<S>, HttpError>> {
  const { fetch, url, init, schema } = request;
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (cause) {
    return err({ kind: 'network', url, message: messageOf(cause) });
  }
  if (!response.ok) {
    return err({ kind: 'httpStatus', url, status: response.status });
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    return err({ kind: 'invalidResponse', url, issues: messageOf(cause) });
  }
  const parsed = schema.safeParse(body);
  return parsed.success
    ? ok(parsed.data)
    : err({ kind: 'invalidResponse', url, issues: z.prettifyError(parsed.error) });
}
