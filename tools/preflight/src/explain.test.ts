import { describe, expect, it } from 'vitest';

import { explainRule, sectionForAnchor, slugify, unknownRule } from './explain.js';
import { findRule, registry } from './registry.js';
import { REPO_ROOT } from './testing/fixture-context.js';

describe('explain', () => {
  it('slugifies headings the way GitHub does', () => {
    expect(slugify('Ports and adapters')).toBe('ports-and-adapters');
    expect(slugify('B.C. Design System')).toBe('bc-design-system');
  });

  it('cuts a section at the next heading of the same level', () => {
    const doc = '# A\n\n## B\n\nbody\n\n### C\n\nsub\n\n## D\n\nother\n';
    expect(sectionForAnchor(doc, 'b')).toBe('## B\n\nbody\n\n### C\n\nsub');
    expect(sectionForAnchor(doc, 'missing')).toBeUndefined();
  });

  it('prints the rule and its doc section', () => {
    const rule = findRule('disable-audit');
    expect(rule).toBeDefined();
    const lines = rule === undefined ? [] : explainRule(REPO_ROOT, rule);
    expect(lines[0]).toBe('disable-audit (quick tier, error)');
    expect(lines.at(-1)).toContain('## Code limits');
  });

  it('says when the doc section is missing', () => {
    const rule = { ...registry[0], doc: 'NOPE.md#x' } as (typeof registry)[number];
    expect(explainRule(REPO_ROOT, rule).at(-1)).toBe('The section NOPE.md#x was not found.');
  });

  it('lists known rules for an unknown id', () => {
    expect(unknownRule('nope', registry)).toHaveLength(registry.length + 1);
  });
});
