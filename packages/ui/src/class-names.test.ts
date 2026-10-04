import { describe, expect, it } from 'vitest';

import { classNames } from './class-names.js';

describe('classNames', () => {
  it('joins truthy names with spaces', () => {
    expect(classNames('button', false, 'button-primary')).toBe('button button-primary');
    expect(classNames(null, undefined, '')).toBe('');
  });
});
