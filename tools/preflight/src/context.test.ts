import { describe, expect, it } from 'vitest';

import { contextSections, contextTerms, formatContext, h2Sections } from './context.js';
import { REPO_ROOT } from './testing/fixture-context.js';

describe('context', () => {
  it('turns a glob into path and package terms', () => {
    expect(contextTerms('packages/terrain/src/**')).toEqual([
      'packages/terrain',
      '@parkshape/terrain',
      'terrain',
    ]);
    expect(contextTerms('**/*.css')).toEqual([]);
  });

  it('splits at H2 headings and ignores headings in fences', () => {
    const sections = h2Sections(
      'A.md',
      '# T\n\n## One\n\ntext\n\n```md\n## Not a heading\n```\n\n## Two\n',
    );
    expect(sections.map(({ heading }) => heading)).toEqual(['One', 'Two']);
  });

  it('prints the matching sections and always the code limits', () => {
    const sections = contextSections(REPO_ROOT, 'packages/scene/**');
    const headings = sections.map(({ file, heading }) => `${file}#${heading}`);
    expect(headings).toContain('AGENTS.md#Code limits');
    expect(headings).toContain('AGENTS.md#Repo map');
    expect(formatContext('x', sections)[0]).toContain('doc sections apply');
  });
});
