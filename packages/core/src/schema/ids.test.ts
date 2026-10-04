import { describe, expect, it } from 'vitest';

import {
  catalogIdSchema,
  commentIdSchema,
  designIdSchema,
  existingFeatureId,
  isExistingFeatureId,
  itemIdSchema,
  parcelIdSchema,
  projectIdSchema,
  userIdSchema,
} from './ids.js';

describe('id schemas', () => {
  it('accepts a non-empty string and returns it unchanged', () => {
    expect(designIdSchema.parse('design-1')).toBe('design-1');
    expect(catalogIdSchema.parse('bench')).toBe('bench');
  });

  it('rejects an empty string', () => {
    expect(itemIdSchema.safeParse('').success).toBe(false);
    expect(parcelIdSchema.safeParse('').success).toBe(false);
  });

  it('brands element comment ids and refuses an empty one', () => {
    expect(commentIdSchema.parse('comment-1')).toBe('comment-1');
    expect(commentIdSchema.safeParse('').success).toBe(false);
  });

  it('rejects a catalog id that is not kebab-case', () => {
    expect(catalogIdSchema.safeParse('Big Leaf').success).toBe(false);
  });
});

describe('existing feature ids', () => {
  it('prefixes a source key and recognises the result', () => {
    const id = existingFeatureId('public-trees-274389');
    expect(id).toBe('existing-public-trees-274389');
    expect(isExistingFeatureId(id)).toBe(true);
    expect(isExistingFeatureId('3f2b9c1e-bench')).toBe(false);
  });
});

describe('id schema bounds', () => {
  it('accepts project and user ids longer than one character', () => {
    expect(projectIdSchema.parse('jonathan-rogers')).toBe('jonathan-rogers');
    expect(userIdSchema.parse('resident-42')).toBe('resident-42');
    expect(projectIdSchema.safeParse('').success).toBe(false);
    expect(userIdSchema.safeParse('').success).toBe(false);
  });

  it('rejects a catalog id with a trailing hyphen or trailing text that is not kebab-case', () => {
    expect(catalogIdSchema.safeParse('garry-oak-').success).toBe(false);
    expect(catalogIdSchema.safeParse('garry-oak Tree').success).toBe(false);
  });
});
