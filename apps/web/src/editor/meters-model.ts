import {
  formatCad,
  formatPercentValue,
  type ConstraintKey,
  type ConstraintResult,
  type ConstraintStatus,
  type MetricsReport,
} from '@parkshape/core';

import { format } from '../messages';

/** The meters locale block, passed in so no copy is hard-coded here. */
export interface MetersStrings {
  readonly showMe: string;
  readonly blockingHeading: string;
  readonly blocksSubmission: string;
  readonly status: Readonly<Record<ConstraintStatus, string>>;
  readonly groups: Readonly<Record<'budget' | 'access' | 'features' | 'earthworks', string>>;
  readonly labels: Readonly<Record<string, string>>;
  readonly haulValue: string;
  readonly disturbedValue: string;
  readonly gardenPlotsValue: string;
  /** Reads a gauge against its limit, such as "$146,608 of $500,000". */
  readonly ofTarget: string;
}

export interface MeterGauge {
  readonly value: number;
  readonly limit: number;
  readonly valueText: string;
}

export interface MeterModel {
  readonly key: string;
  readonly label: string;
  readonly status: ConstraintStatus;
  readonly statusText: string;
  /** A value for an info readout; a constraint meter carries none, its state is the colour. */
  readonly message: string | undefined;
  readonly gauge: MeterGauge | undefined;
  /** Changes whenever the meter's value or status does, so the view pulses once. */
  readonly signature: string;
}

export interface MeterGroupModel {
  readonly id: 'budget' | 'access' | 'features' | 'earthworks';
  readonly heading: string;
  readonly meters: readonly MeterModel[];
}

const GAUGE_KEYS = ['budget', 'canopy', 'impervious'] as const;
type GaugeKey = (typeof GAUGE_KEYS)[number];

const GAUGE_FORMAT: Readonly<Record<GaugeKey, (value: number) => string>> = {
  budget: formatCad,
  canopy: formatPercentValue,
  impervious: formatPercentValue,
};

const GROUPS: Readonly<Record<MeterGroupModel['id'], readonly ConstraintKey[]>> = {
  budget: ['budget', 'canopy', 'impervious'],
  access: ['slopes', 'forbiddenZones'],
  features: ['requiredFeatures', 'counts', 'treeProtection'],
  earthworks: ['terraform'],
};

// Each gated meter measures one kind of subject. With none of that subject and no problem to
// report, the row would say nothing, so it hides until a subject exists, as an empty group does.
const GATED_SUBJECT: Readonly<Record<string, keyof MetricsReport['subjects']>> = {
  slopes: 'paths',
  forbiddenZones: 'closedZones',
  counts: 'countRules',
  treeProtection: 'trees',
};

/** A meter shows when it is not gated, has a subject to judge, or has a status to report. */
function meterShows(meter: MeterModel, report: MetricsReport): boolean {
  const subjectKey = GATED_SUBJECT[meter.key];
  if (subjectKey === undefined) return true;
  return report.subjects[subjectKey] > 0 || meter.status !== 'ok';
}

function gaugeFor(
  key: ConstraintKey,
  result: ConstraintResult,
  strings: MetersStrings,
): MeterGauge | undefined {
  if (!(GAUGE_KEYS as readonly string[]).includes(key)) return undefined;
  const toText = GAUGE_FORMAT[key as GaugeKey];
  const limit = result.limit ?? 0;
  const valueText = format(strings.ofTarget, {
    value: toText(result.value),
    target: toText(limit),
  });
  return { value: result.value, limit, valueText };
}

function meterFor(key: ConstraintKey, report: MetricsReport, strings: MetersStrings): MeterModel {
  const result = report.constraints[key];
  return {
    key,
    label: strings.labels[key] ?? key,
    status: result.status,
    statusText: strings.status[result.status],
    message: undefined,
    gauge: gaugeFor(key, result, strings),
    signature: `${result.status}:${String(result.value)}`,
  };
}

function infoMeter(
  key: 'haul' | 'disturbed' | 'gardenPlots',
  value: number,
  message: string,
  strings: MetersStrings,
): MeterModel {
  return {
    key,
    label: strings.labels[key] ?? key,
    status: 'ok',
    statusText: strings.status.ok,
    message,
    gauge: undefined,
    signature: `${key}:${String(value)}`,
  };
}

function earthworksMeters(report: MetricsReport, strings: MetersStrings): MeterModel[] {
  const { truckTrips, disturbedPercent } = report.totals;
  return [
    meterFor('terraform', report, strings),
    infoMeter('haul', truckTrips, format(strings.haulValue, { trips: truckTrips }), strings),
    infoMeter(
      'disturbed',
      disturbedPercent,
      format(strings.disturbedValue, { percent: formatPercentValue(disturbedPercent) }),
      strings,
    ),
  ];
}

/**
 * The required features, counts and trees at risk, then the garden plots when the design has a
 * garden. A garden kept as the baseline has it counts the plots its site record gives.
 */
function featureMeters(report: MetricsReport, strings: MetersStrings): MeterModel[] {
  const meters = GROUPS.features.map((key) => meterFor(key, report, strings));
  const plots = report.totals.gardenPlots;
  if (plots === 0) return meters;
  const message = format(strings.gardenPlotsValue, { plots });
  return [...meters, infoMeter('gardenPlots', plots, message, strings)];
}

/** Groups every constraint and total into labelled meters for the panel. */
export function buildMeterGroups(
  report: MetricsReport,
  strings: MetersStrings,
): readonly MeterGroupModel[] {
  const groups: readonly MeterGroupModel[] = [
    {
      id: 'budget',
      heading: strings.groups.budget,
      meters: GROUPS.budget.map((key) => meterFor(key, report, strings)),
    },
    {
      id: 'access',
      heading: strings.groups.access,
      meters: GROUPS.access.map((key) => meterFor(key, report, strings)),
    },
    {
      id: 'features',
      heading: strings.groups.features,
      meters: featureMeters(report, strings),
    },
    {
      id: 'earthworks',
      heading: strings.groups.earthworks,
      meters: earthworksMeters(report, strings),
    },
  ];
  return groups.map((group) => ({
    ...group,
    meters: group.meters.filter((meter) => meterShows(meter, report)),
  }));
}
