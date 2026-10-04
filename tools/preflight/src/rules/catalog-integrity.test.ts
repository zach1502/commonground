import { describe, expect, it } from 'vitest';

import { fixtureContext, problems } from '../testing/fixture-context.js';

import { manifestModelIds, manifestModels, rule } from './catalog-integrity.js';

describe('catalog-integrity', () => {
  it('passes items whose modelKey, dims, scale policy and licence match the manifest', async () => {
    expect(await problems(rule, fixtureContext(rule.id, 'pass'))).toEqual([]);
  });

  it('fails duplicate ids, a missing modelKey, dims 10% off and missing policy or licence', async () => {
    const found = await problems(rule, fixtureContext(rule.id, 'fail'));
    expect(found.map(({ message }) => message).sort()).toEqual([
      'catalog id "bench" is also used in packages/core/src/catalog/items.ts',
      'catalog item "picnic-table" has no picture at apps/web/public/catalog-thumbs/picnic-table.png',
      'catalog item "red-alder" has no scalePolicy',
      'model "lawn" has no licence in tools/asset-pipeline/generated/models.manifest.json',
      'model "lawn" has no scalePolicy in tools/asset-pipeline/generated/models.manifest.json',
      'model "swings" depthM is 1.6 in the manifest and 4 in the catalog, 60% apart; the pipeline fitted widthM, so this axis follows the model',
      'model "table-picnic" widthM is 2.2 in the manifest and 2 in the catalog, 10% apart (limit 2%)',
      'model "tree-cedar" heightM is 33 in the manifest and 30 in the catalog, 10% apart (limit 2%)',
      'modelKey "bench-steel" of "bench" is not in tools/asset-pipeline/generated/models.manifest.json',
    ]);
  });

  it('errors on the fitted axis and only warns on the axes that follow the model', async () => {
    const found = await problems(rule, fixtureContext(rule.id, 'fail'));
    const severityOf = (text: string) =>
      found.find(({ message }) => message.includes(text))?.severity ?? rule.severity;
    expect(severityOf('"swings" depthM')).toBe('warn');
    expect(severityOf('"tree-cedar" heightM')).toBe('error');
    expect(severityOf('"table-picnic" widthM')).toBe('error');
  });

  it('points each finding at the line of the item or manifest entry', async () => {
    const found = await problems(rule, fixtureContext(rule.id, 'fail'));
    const missing = found.find(({ message }) => message.includes('bench-steel'));
    expect(missing).toMatchObject({ file: 'packages/core/src/catalog/items.ts', line: 13 });
    const licence = found.find(({ message }) => message.includes('licence'));
    expect(licence?.file).toBe('tools/asset-pipeline/generated/models.manifest.json');
  });

  it('is not applicable before the catalog exists', async () => {
    const ctx = {
      ...fixtureContext(rule.id, 'pass'),
      rootDir: fixtureContext('file-budget', 'pass').rootDir,
    };
    expect(await rule.check(ctx)).toEqual([expect.objectContaining({ severity: 'info' })]);
  });

  it('reads model ids from both manifest shapes', () => {
    expect([...manifestModelIds(['a', { id: 'b' }, null])]).toEqual(['a', 'b']);
    expect([...manifestModelIds({ models: [{ id: 'c' }] })]).toEqual(['c']);
  });

  it('reads the asset pipeline shape, keyed by modelKey with nested dims', () => {
    const models = manifestModels({
      models: [{ modelKey: 'bench', dims: { widthM: 1.8, depthM: 0.6 }, licence: 'CC0-1.0' }],
    });
    expect(models).toEqual([
      expect.objectContaining({ id: 'bench', widthM: 1.8, depthM: 0.6, licence: 'CC0-1.0' }),
    ]);
  });
});

describe('catalog-integrity pictures', () => {
  it('asks for a picker picture per catalog item but not per module kit part', async () => {
    const found = await problems(rule, fixtureContext(rule.id, 'pass'));
    expect(found.filter(({ message }) => message.includes('picture'))).toEqual([]);
    const failing = await problems(rule, fixtureContext(rule.id, 'fail'));
    const picture = failing.find(({ message }) => message.includes('no picture'));
    expect(picture).toMatchObject({ file: 'packages/core/src/catalog/items.ts', line: 20 });
  });
});
