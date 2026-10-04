import type { VoteReason } from '../../api/web-api';

/**
 * The reason chip ids in the order the chips show. The core list lives in a zod schema module,
 * and importing it would load zod before the first picture paints, so the vote route keeps this
 * copy; a test holds it equal to VOTE_REASONS.
 */
export const REASON_IDS = [
  'play',
  'trees',
  'paths',
  'dog-area',
  'garden',
  'water',
  'too-expensive',
  'too-paved',
  'accessibility',
  'other',
] as const satisfies readonly VoteReason[];
