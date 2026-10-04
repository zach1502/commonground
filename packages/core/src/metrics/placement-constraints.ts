import { SLOPE_TOLERANCE } from '../constants.js';
import type { ProjectParameters } from '../schema/parameters.js';

import {
  formatCubicMetres,
  formatGrade,
  formatMetres,
  formatPercentValue,
  plural,
} from './format.js';
import type { FootprintGrade } from './grade-check.js';
import { problemCountOutcome, type ConstraintOutcome } from './outcome.js';
import type { PathSlopes, SlopeLimits } from './slopes.js';
import type { RootZoneHit, TerraformMeasure } from './terraform.js';
import type { LockedOverlap, ZoneHit } from './zones.js';

export function zonesOutcome(
  hits: readonly ZoneHit[],
  overlaps: readonly LockedOverlap[],
): ConstraintOutcome {
  const problems = [
    ...hits.map(
      (hit) => `${hit.label} is in the closed zone ${hit.zoneLabel}. Move it outside the zone.`,
    ),
    ...overlaps.map(
      (overlap) =>
        `${overlap.label} overlaps a locked ${overlap.lockedLabel}. Move it to open ground.`,
    ),
  ];
  return problemCountOutcome(
    problems,
    'No new element is in a closed zone or on a locked element.',
  );
}

function pathProblems(path: PathSlopes, limits: SlopeLimits): string[] {
  if (path.existing) return [];
  const name = `Path ${String(path.pathNumber)}`;
  const problems: string[] = [];
  if (path.runningSegments.length > 0) {
    problems.push(
      `${name} reaches ${formatGrade(path.maxRunning)} grade. Accessible paths are ${formatGrade(limits.maxRunning)} or less.`,
    );
  }
  if (path.crossSegments.length > 0) {
    problems.push(
      `${name} has a ${formatGrade(path.maxCross)} cross slope. Accessible paths are ${formatGrade(limits.maxCross)} or less across.`,
    );
  }
  return problems;
}

export function slopesOutcome(
  paths: readonly PathSlopes[],
  grades: readonly FootprintGrade[],
  limits: SlopeLimits,
): ConstraintOutcome {
  const problems = [
    ...paths.flatMap((path) => pathProblems(path, limits)),
    ...grades
      .filter(({ grade, limit }) => grade > limit + SLOPE_TOLERANCE)
      .map(
        ({ label, grade, limit }) =>
          `Ground under ${label} reaches ${formatGrade(grade)} grade. Regrade it to ${formatGrade(limit)} or less.`,
      ),
  ];
  // The pass message names the limits, so a resident can tell the path suits a wheelchair.
  return problemCountOutcome(
    problems,
    `Every path is ${formatGrade(limits.maxRunning)} grade or less and ${formatGrade(limits.maxCross)} or less across, so a wheelchair can use it. Ground under each item is within its limit.`,
  );
}

function terraformProblems(
  terraform: TerraformMeasure,
  limits: ProjectParameters['terraform'],
): string[] {
  const { maxDeviationM, maxNetHaulM3, maxDisturbedPercent } = limits;
  const deviation = formatMetres(maxDeviationM);
  const problems = terraform.noGradeHits.map(
    ({ zoneLabel, cells }) =>
      `Grading covers ${plural(cells, 'cell')} of the no-grade zone ${zoneLabel}. Remove grading there.`,
  );
  if (terraform.deviationCells > 0) {
    problems.unshift(
      `${plural(terraform.deviationCells, 'cell')} change grade by more than ${deviation}. Keep each change within ${deviation}.`,
    );
  }
  const haul = Math.abs(terraform.net);
  if (maxNetHaulM3 !== undefined && haul > maxNetHaulM3) {
    problems.push(
      `Net haul is ${formatCubicMetres(haul)}. Keep it at ${formatCubicMetres(maxNetHaulM3)} or less.`,
    );
  }
  if (maxDisturbedPercent !== undefined && terraform.disturbedPercent > maxDisturbedPercent) {
    problems.push(
      `Grading covers ${formatPercentValue(terraform.disturbedPercent)} of the park. Keep it at ${formatPercentValue(maxDisturbedPercent)} or less.`,
    );
  }
  return problems;
}

export function terraformOutcome(
  terraform: TerraformMeasure,
  limits: ProjectParameters['terraform'],
): ConstraintOutcome {
  const moved = formatCubicMetres(terraform.cut + terraform.fill);
  const trips = plural(terraform.truckTrips, 'truck load');
  return problemCountOutcome(
    terraformProblems(terraform, limits),
    `Grading moves ${moved} and needs ${trips}.`,
  );
}

export function treeProtectionOutcome(hits: readonly RootZoneHit[]): ConstraintOutcome {
  const problems = hits.map(
    ({ label, radiusM, cells }) =>
      `Grading reaches ${plural(cells, 'cell')} inside the ${formatMetres(radiusM)} root zone of ${label}. Keep grading outside the root zone.`,
  );
  const outcome = problemCountOutcome(
    problems,
    'No grading is inside the root zone of a locked tree.',
  );
  return { ...outcome, value: hits.reduce((total, hit) => total + hit.cells, 0) };
}
