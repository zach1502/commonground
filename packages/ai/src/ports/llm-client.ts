import type { Result } from '@parkshape/core';

/** A named JSON Schema the model's answer must follow; `name` also keys the fake's answers. */
export interface JsonSchema {
  readonly name: string;
  readonly schema: Readonly<Record<string, unknown>>;
}

export interface LlmRequest {
  readonly system: string;
  readonly user: string;
  readonly schema: JsonSchema;
  readonly maxTokens: number;
}

/** Why a completion failed. Callers fall back to the rule-based provider on any of these. */
export type LlmError =
  | { readonly kind: 'network'; readonly message: string }
  | {
      readonly kind: 'http';
      readonly status: number;
      readonly message: string;
      /** For a 429, how long the server asked the caller to wait, when it said. */
      readonly retryAfterMs?: number;
    }
  | { readonly kind: 'bad-envelope'; readonly message: string }
  | { readonly kind: 'bad-json'; readonly message: string }
  | { readonly kind: 'no-answer'; readonly schemaName: string }
  /** Every model was still waiting out a 429, so none was called. */
  | { readonly kind: 'cooling-down'; readonly models: readonly string[] };

/** An unchecked answer and the model that wrote it, which pages name as its writer. */
export interface Completion {
  readonly model: string;
  readonly value: unknown;
}

/** A chat model that answers with JSON. The value is unchecked; the caller validates it. */
export interface LlmClient {
  /** The model the client calls first, such as gemini-3.5-flash-lite. */
  readonly model: string;
  complete(request: LlmRequest): Promise<Result<Completion, LlmError>>;
}

/** The slice of fetch the HTTP adapter uses, so tests can inject a stub. */
export interface HttpRequestInit {
  readonly method: 'POST';
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

export interface HttpResponse {
  readonly ok: boolean;
  readonly status: number;
  /** A fetch Response has these; the client reads Retry-After from a 429. */
  readonly headers?: { get(name: string): string | null };
  text(): Promise<string>;
}

export type HttpFetch = (url: string, init: HttpRequestInit) => Promise<HttpResponse>;
