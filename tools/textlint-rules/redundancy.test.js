import { describe, expect, it } from 'vitest';

import { contentStems, lintRedundancy, loadRedundancyConfig } from './redundancy.js';

const config = loadRedundancyConfig();

function findings(tree) {
  return lintRedundancy(JSON.stringify(tree), config);
}

describe('contentStems', () => {
  it('drops stopwords and single letters and stems the rest', () => {
    expect([...contentStems('What it costs to dig out 1 m³ of soil')].sort()).toEqual([
      'cost',
      'dig',
      'soil',
    ]);
  });
});

describe('lintRedundancy', () => {
  it('flags a note that opens by narrating a control', () => {
    const found = findings({ chart: { note: 'This shows votes per design.' } });
    expect(found).toHaveLength(1);
    expect(found[0]?.pointer).toBe('/chart/note');
  });

  it('flags help that repeats more than one content word from its label', () => {
    const found = findings({
      canopy: { label: 'Tree canopy', help: 'Tree canopy shows the tree canopy' },
    });
    expect(found.map(({ pointer }) => pointer)).toEqual(['/canopy/help']);
  });

  it('flags an obvious control instruction', () => {
    const found = findings({ submit: { help: 'Click Submit to submit your design.' } });
    expect(found).toHaveLength(1);
  });

  it('passes one incidental overlap between label and help', () => {
    expect(
      findings({
        cost: {
          label: 'Cut cost per m³ in dollars',
          help: 'What it costs to dig out 1 m³ of soil.',
        },
      }),
    ).toEqual([]);
  });

  it('passes a caption that states a source', () => {
    expect(
      findings({ votes: { caption: 'Votes per design, counted to 26 September 2026.' } }),
    ).toEqual([]);
  });

  it('skips keys under a skipped prefix, such as meta descriptions', () => {
    expect(
      findings({
        meta: {
          login: { title: 'Log in | CommonGround', description: 'Log in to CommonGround.' },
        },
      }),
    ).toEqual([]);
  });
});
