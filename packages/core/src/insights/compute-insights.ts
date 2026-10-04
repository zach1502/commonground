import { GRID_RESOLUTION_M } from '../constants.js';
import { parcelGrid } from '../metrics/parcel-grid.js';
import type { Grid } from '../metrics/raster.js';
import type { Parcel } from '../schema/parcel.js';

import { baselineDiff, type BaselineFeatureDiff } from './baseline-diff.js';
import { complianceDistribution, type ComplianceCounts } from './compliance.js';
import { earthworksHistogram, type EarthworksHistogram } from './earthworks-histogram.js';
import { engagementBreakdown, type EngagementBreakdown } from './engagement.js';
import { featureFrequency, type FeatureFrequency } from './feature-frequency.js';
import { buildHeatmaps, type Heatmap } from './heatmaps.js';
import { reasonFrequency, type ReasonFrequency } from './reasons.js';
import type { InsightsInput } from './types.js';

export interface HeadlineNumbers {
  readonly designsSubmitted: number;
  readonly uniqueVoters: number;
  readonly votesCast: number;
}

/** Everything the planner insights page shows, headline numbers first. */
export interface Insights {
  readonly headline: HeadlineNumbers;
  readonly features: readonly FeatureFrequency[];
  readonly heatmaps: readonly Heatmap[];
  readonly baselineDiff: readonly BaselineFeatureDiff[];
  readonly compliance: readonly ComplianceCounts[];
  readonly earthworks: EarthworksHistogram;
  readonly reasons: ReasonFrequency;
  readonly engagement: EngagementBreakdown;
}

/** The 1 m grid over the parcel that insights heatmaps are summed on. */
export function insightsGrid(parcel: Parcel): Grid {
  const { width, height, resolutionM, originLocal } = parcelGrid(parcel, GRID_RESOLUTION_M);
  return { width, height, cellM: resolutionM, originLocal };
}

export function computeInsights(input: InsightsInput): Insights {
  const { designs, votes, catalog } = input;
  return {
    headline: {
      designsSubmitted: designs.length,
      uniqueVoters: new Set(votes.map((vote) => vote.userId)).size,
      votesCast: votes.length,
    },
    features: featureFrequency(designs, catalog),
    heatmaps: buildHeatmaps(input),
    baselineDiff: baselineDiff(input.baseline, designs, catalog, input.grid),
    compliance: complianceDistribution(designs),
    earthworks: earthworksHistogram(designs),
    reasons: reasonFrequency(designs, votes),
    engagement: engagementBreakdown(input.participants),
  };
}
