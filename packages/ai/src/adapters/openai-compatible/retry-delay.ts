import { z } from 'zod';

const MS_PER_SECOND = 1000;

/** Retry-After as delta-seconds. The HTTP-date form needs the clock, so it is left to the body. */
const SECONDS_PATTERN = /^\d+$/;

/** A google.protobuf.Duration in JSON, such as "31s" or "2.5s". */
const DURATION_PATTERN = /^(\d+(?:\.\d+)?)s$/;

const retryInfoSchema = z.object({ retryDelay: z.string().regex(DURATION_PATTERN) });

const errorBodySchema = z.object({
  error: z.object({ details: z.array(z.unknown()) }),
});

function fromHeader(retryAfter: string | null): number | undefined {
  const value = retryAfter?.trim() ?? '';
  return SECONDS_PATTERN.test(value) ? Number(value) * MS_PER_SECOND : undefined;
}

function parsedJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** The google.rpc.RetryInfo delay in the error body. Gemini can wrap the error in an array. */
function fromBody(body: string): number | undefined {
  const json = parsedJson(body);
  const parsed = errorBodySchema.safeParse(Array.isArray(json) ? json[0] : json);
  if (!parsed.success) return undefined;
  for (const detail of parsed.data.error.details) {
    const info = retryInfoSchema.safeParse(detail);
    const seconds = info.success ? DURATION_PATTERN.exec(info.data.retryDelay)?.[1] : undefined;
    if (seconds !== undefined) return Number(seconds) * MS_PER_SECOND;
  }
  return undefined;
}

/** How long a rate-limited server asked the caller to wait, or undefined if it did not say. */
export function retryDelayMs(retryAfter: string | null, body: string): number | undefined {
  return fromHeader(retryAfter) ?? fromBody(body);
}
