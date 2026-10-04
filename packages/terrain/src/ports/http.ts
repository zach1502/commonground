/** A request that failed at the HTTP layer or returned a body we could not parse. */
export type HttpError =
  | { readonly kind: 'network'; readonly url: string; readonly message: string }
  | { readonly kind: 'httpStatus'; readonly url: string; readonly status: number }
  | { readonly kind: 'invalidResponse'; readonly url: string; readonly issues: string };

/** The subset of the global fetch the adapters use, injected so tests replay recorded responses. */
export type HttpFetch = (url: string, init?: RequestInit) => Promise<Response>;
