// 32-bit FNV-1a: the stamp only tells whether the wizard's baseline changed, not who may trust
// it, so a small fast hash is enough and a collision only keeps an older refinement.
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const HEX = 16;

/** JSON with object keys sorted, so the same document always reads the same. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return value === undefined ? 'null' : JSON.stringify(value);
}

/**
 * The editor session's stamp for the wizard baseline, which has no server copy until publish.
 * It changes when an earlier step changes the baseline, so refinements made on an older baseline
 * give way to the new one.
 */
export function baselineStamp(document: unknown): string {
  let hash = FNV_OFFSET;
  for (const character of stableJson(document)) {
    hash = Math.imul(hash ^ (character.codePointAt(0) ?? 0), FNV_PRIME) >>> 0;
  }
  return hash.toString(HEX);
}
