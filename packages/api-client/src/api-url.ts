/** Resolves an API path against the configured base URL. */
export function apiUrl(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\/+/, ''), base).toString();
}
