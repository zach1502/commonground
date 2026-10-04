import { describe, expect, it } from 'vitest';

import { catalogIndex } from '../catalog/catalog.js';
import { computeMetrics } from '../metrics/compute.js';
import {
  designOf,
  parametersWith,
  rectangle,
  rectangleParcel,
} from '../metrics/fixtures/design-builders.js';
import { makeFlatHeightmap } from '../metrics/heightmap.js';
import type { DesignDocument } from '../schema/design.js';

import type { FeaturePlan, PlannedFeature } from './features.js';
import { repairPlan } from './repair.js';

const parcel = rectangleParcel(40, 40);
const heightmap = makeFlatHeightmap({ width: 40, height: 40 });
const parameters = parametersWith({
  requiredFeatures: [{ category: 'garden', minCount: 1, minPlots: 20 }],
});

function reportFor(document: DesignDocument) {
  const result = computeMetrics({ document, parcel, parameters, catalog: catalogIndex, heightmap });
  if (!result.ok) throw new Error('metrics');
  return result.value;
}

function garden(): PlannedFeature {
  const entry = catalogIndex.get('community-garden');
  if (entry?.geometryKind !== 'area') throw new Error('garden');
  return { entry, sizing: { kind: 'preset', size: 'small' }, origin: 'intent' };
}

describe('repairPlan', () => {
  it('adds a garden sized for the plots when the design has none', () => {
    const document = designOf();
    const plan: FeaturePlan = { features: [], trees: [] };
    const repair = repairPlan({
      document,
      plan,
      parameters,
      catalog: catalogIndex,
      baseline: designOf(),
      report: reportFor(document),
    });
    expect(repair?.plan.features.map((feature) => feature.entry.id)).toEqual(['community-garden']);
    expect(repair?.plan.features[0]?.sizing).toEqual({ kind: 'plots', minPlots: 20 });
    expect(repair?.notes).toEqual([{ kind: 'added', name: 'Community garden' }]);
  });

  it('enlarges a garden that has too few plots', () => {
    const document = designOf({
      areas: [
        { id: 'g1', catalogId: 'community-garden', polygon: rectangle(0, 0, 8, 8), locked: false },
      ],
    });
    const plan: FeaturePlan = { features: [garden()], trees: [] };
    const repair = repairPlan({
      document,
      plan,
      parameters,
      catalog: catalogIndex,
      baseline: designOf(),
      report: reportFor(document),
    });
    expect(repair?.plan.features[0]?.sizing).toEqual({ kind: 'plots', minPlots: 20 });
    expect(repair?.notes).toEqual([{ kind: 'enlarged', name: 'Community garden', plots: 20 }]);
  });
});

describe('repairPlan when nothing or trees are short', () => {
  it('returns nothing when no hard rule fails', () => {
    const document = designOf();
    const relaxed = parametersWith({ requiredFeatures: [] });
    const result = computeMetrics({
      document,
      parcel,
      parameters: relaxed,
      catalog: catalogIndex,
      heightmap,
    });
    if (!result.ok) throw new Error('metrics');
    const plan: FeaturePlan = { features: [], trees: [] };
    expect(
      repairPlan({
        document,
        plan,
        parameters: relaxed,
        catalog: catalogIndex,
        baseline: designOf(),
        report: result.value,
      }),
    ).toBeUndefined();
  });

  it('asks for more trees when the project needs a count of trees', () => {
    const treeRule = parametersWith({ requiredFeatures: [{ category: 'tree', minCount: 2 }] });
    const document = designOf();
    const result = computeMetrics({
      document,
      parcel,
      parameters: treeRule,
      catalog: catalogIndex,
      heightmap,
    });
    if (!result.ok) throw new Error('metrics');
    const repair = repairPlan({
      document,
      plan: { features: [], trees: [] },
      parameters: treeRule,
      catalog: catalogIndex,
      baseline: designOf(),
      report: result.value,
    });
    expect(repair?.plan.trees).toEqual([{ count: 2 }]);
  });
});
