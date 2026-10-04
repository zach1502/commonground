import type { ProjectParameters } from '../schema/parameters.js';

import type { Footprint } from './footprints.js';

export interface EarthworkVolumes {
  readonly cut: number;
  readonly fill: number;
  /** Fill minus cut: positive means soil comes in, negative means it goes out. */
  readonly net: number;
}

export interface CostInput {
  readonly footprints: readonly Footprint[];
  readonly volumes: EarthworkVolumes;
  readonly rates: ProjectParameters['budget']['earthworks'];
}

export interface CostBreakdown {
  readonly itemsCad: number;
  readonly pathsCad: number;
  readonly areasCad: number;
  readonly earthworksCad: number;
  readonly totalCad: number;
}

/** Every unit cost the entry has: per item, per square metre and per fitted module. */
function elementCostCad(footprint: Footprint): number {
  const { perItemCad = 0, perM2Cad = 0, perModuleCad = 0 } = footprint.entry.unitCost;
  return perItemCad + perM2Cad * footprint.areaM2 + perModuleCad * footprint.moduleCount;
}

/** Locked elements are existing site features, so they add no new cost. */
function kindCostCad(footprints: readonly Footprint[], kind: Footprint['kind']): number {
  return footprints
    .filter((footprint) => footprint.kind === kind && !footprint.locked)
    .reduce((total, footprint) => total + elementCostCad(footprint), 0);
}

/** Construction cost of new elements plus earthworks: cut, fill and hauling the net volume. */
export function measureCosts(input: CostInput): CostBreakdown {
  const { footprints, volumes, rates } = input;
  const itemsCad = kindCostCad(footprints, 'item');
  const pathsCad = kindCostCad(footprints, 'path');
  const areasCad = kindCostCad(footprints, 'area');
  const earthworksCad =
    volumes.cut * rates.cutPerM3 +
    volumes.fill * rates.fillPerM3 +
    Math.abs(volumes.net) * rates.haulPerM3;
  const totalCad = itemsCad + pathsCad + areasCad + earthworksCad;
  return { itemsCad, pathsCad, areasCad, earthworksCad, totalCad };
}
