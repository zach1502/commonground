// Postgres text and jsonb refuse a NUL character, and jsonb refuses a lone UTF-16 surrogate, so
// a request holding either would fail inside the database instead of at the boundary.
const NUL = String.fromCharCode(0);
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

/** True when the database can store the text as it is. */
export function isStorableText(text: string): boolean {
  return !text.includes(NUL) && !LONE_SURROGATE.test(text);
}
