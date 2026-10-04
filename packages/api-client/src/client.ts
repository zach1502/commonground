import { apiUrl } from './api-url.js';
import type { paths } from './generated/schema.js';

export type ApiPath = keyof paths;
type Method = 'get' | 'put' | 'post' | 'delete' | 'patch';
type MethodOf<P extends ApiPath> = {
  [M in Method]: paths[P][M] extends undefined ? never : M;
}[Method];
type OperationOf<P extends ApiPath, M extends Method> = NonNullable<paths[P][M]>;

type PathParams<O> = O extends { parameters: { path: infer T } } ? T : never;
type QueryParams<O> = O extends { parameters: { query?: infer T } } ? T : never;
type JsonBody<O> = O extends { requestBody: { content: { 'application/json': infer T } } }
  ? T
  : never;
// Every 2xx entry of an operation's responses, matched by the status code's first digit.
type SuccessResponse<R> = {
  [K in keyof R]: `${K & number}` extends `2${string}` ? R[K] : never;
}[keyof R];
type ResponseBody<O> = O extends { responses: infer R }
  ? SuccessResponse<R> extends { content: { 'application/json': infer T } }
    ? T
    : undefined
  : never;

export interface RequestOptions<O> {
  readonly path?: PathParams<O>;
  readonly query?: QueryParams<O>;
  readonly body?: JsonBody<O>;
}

export interface ApiClientOptions {
  readonly baseUrl: string;
  readonly fetch?: typeof fetch;
}

const NO_CONTENT = 204;

/**
 * A non-2xx answer; `kind` is the API's error kind, or 'unknown' for a non-JSON body. `body` is
 * the parsed JSON, for answers that carry more than the error, such as a 409 with the stored draft.
 */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly kind: string,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

function buildPath(
  template: string,
  params: object | undefined,
  query: object | undefined,
): string {
  const filled = Object.entries(params ?? {}).reduce(
    (path, [key, value]) => path.replace(`{${key}}`, encodeURIComponent(String(value))),
    template,
  );
  const search = new URLSearchParams(
    Object.entries(query ?? {}).map(([key, value]) => [key, String(value)]),
  ).toString();
  return search === '' ? filled : `${filled}?${search}`;
}

async function failure(response: Response): Promise<ApiRequestError> {
  const text = await response.text();
  try {
    const body = JSON.parse(text) as { error: { kind: string; message: string } };
    return new ApiRequestError(response.status, body.error.kind, body.error.message, body);
  } catch {
    return new ApiRequestError(response.status, 'unknown', text);
  }
}

/** A typed fetch wrapper over the generated OpenAPI types; sends cookies with every call. */
export function createApiClient(options: ApiClientOptions) {
  return {
    async request<P extends ApiPath, M extends MethodOf<P>>(
      method: M,
      path: P,
      init: RequestOptions<OperationOf<P, M>> = {},
    ): Promise<ResponseBody<OperationOf<P, M>>> {
      const url = apiUrl(options.baseUrl, buildPath(path, init.path, init.query));
      const hasBody = init.body !== undefined;
      // Looked up per call so a fetch patched after creation (MSW, polyfills) is used.
      const send = options.fetch ?? globalThis.fetch;
      const response = await send(url, {
        method: method.toUpperCase(),
        credentials: 'include',
        headers: hasBody ? { 'Content-Type': 'application/json' } : {},
        ...(hasBody ? { body: JSON.stringify(init.body) } : {}),
      });
      if (!response.ok) {
        throw await failure(response);
      }
      if (response.status === NO_CONTENT) {
        return undefined as ResponseBody<OperationOf<P, M>>;
      }
      return (await response.json()) as ResponseBody<OperationOf<P, M>>;
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
