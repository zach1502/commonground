import { itemIdSchema, type ItemId } from '../schema/ids.js';

export interface IdSource {
  next(): ItemId;
}

/** Element ids gen-1, gen-2 and so on, skipping any the baseline already uses. */
export function createIdSource(taken: Iterable<string>): IdSource {
  const used = new Set(taken);
  let count = 0;
  return {
    next(): ItemId {
      let id: string;
      do {
        count += 1;
        id = `gen-${String(count)}`;
      } while (used.has(id));
      used.add(id);
      return itemIdSchema.parse(id);
    },
  };
}
