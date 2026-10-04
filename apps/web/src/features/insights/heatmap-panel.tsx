import { lazy, Suspense, useMemo, useState } from 'react';
import { Await } from 'react-router';

import {
  formatPercent,
  type DesignDocument,
  type HeatmapLayer,
  type Heightmap,
} from '@parkshape/core';
import { documentPropertyReader, readPalette } from '@parkshape/scene/plan';
import type { ForcedTier } from '@parkshape/scene/viewer';
import { OpacitySlider, SegmentedControl } from '@parkshape/ui';

import type { Insights } from '../../api/staff-api';
import type { Project } from '../../api/web-api';
import { format, messages } from '../../messages';

import { legendMax, legendSteps } from './heat-legend';
import { heatmapGroups } from './insight-charts';
import { maskLockedFootprints } from './locked-mask';

const InsightsTerrain = lazy(async () => ({
  default: (await import('./insights-terrain')).InsightsTerrain,
}));

const DEFAULT_OPACITY = 0.8;
// Kept for this tab only, so the planner's choice survives a reload but not the next visit.
const HIDE_ITEMS_KEY = 'parkshape.insights.hideItems';
const text = messages.insights.heatmap;

export interface HeatmapPanelProps {
  readonly project: Project;
  readonly baseline: DesignDocument | null;
  /** The recorded ground under the heatmap, still loading; null draws the flat parcel. */
  readonly terrain: Promise<Heightmap | null>;
  readonly heatmaps: Insights['heatmaps'];
  /** Designs submitted, for the legend's top count. */
  readonly designs: number;
  /** Set only by test builds; see sceneTierFor. */
  readonly tier?: ForcedTier | undefined;
  /** Holds the Hide items choice for this browser session. */
  readonly session: Storage;
}

/** The ramp the overlay draws, in flat steps, with the design counts it runs between. */
function HeatLegend({ max }: { readonly max: number }) {
  const steps = useMemo(() => legendSteps(readPalette(documentPropertyReader()).water), []);
  return (
    <p className="web-insights__legend">
      <span className="web-insights__legend-ramp" aria-hidden="true">
        {steps.map((colour) => (
          <span
            key={colour}
            className="web-insights__legend-step"
            style={{ backgroundColor: colour }}
          />
        ))}
      </span>
      <span>{format(text.legend, { max })}</span>
      <span className="web-insights__legend-nodata">
        <span className="web-insights__legend-swatch" aria-hidden="true" />
        {text.noData}
      </span>
      <span className="web-insights__legend-ramp-name" data-kind="data">
        {text.rampName}
      </span>
    </p>
  );
}

function LayerControls(props: {
  readonly layer: HeatmapLayer;
  readonly opacity: number;
  readonly onLayer: (layer: HeatmapLayer) => void;
  readonly onOpacity: (opacity: number) => void;
}) {
  return (
    <div className="web-insights__controls">
      <div role="group" aria-label={text.layerLabel} className="web-insights__layers">
        {heatmapGroups().map((group) => (
          <div key={group.id} className="web-insights__layer-group">
            <span className="web-insights__layer-label" aria-hidden="true">
              {group.label}
            </span>
            <SegmentedControl
              label={group.label}
              options={group.options}
              value={props.layer}
              onChange={props.onLayer}
            />
          </div>
        ))}
      </div>
      <OpacitySlider
        label={text.opacityLabel}
        value={props.opacity}
        onChange={props.onOpacity}
        format={formatPercent}
      />
    </div>
  );
}

/** The Hide items choice, read from and written to sessionStorage. */
function useItemsShown(session: Storage) {
  const [items, setItems] = useState<'shown' | 'hidden'>(() =>
    session.getItem(HIDE_ITEMS_KEY) === 'hidden' ? 'hidden' : 'shown',
  );
  const change = (next: 'shown' | 'hidden') => {
    session.setItem(HIDE_ITEMS_KEY, next);
    setItems(next);
  };
  return [items, change] as const;
}

/** The layer switch with the opacity slider under it, the caption and key, then the terrain. */
export function HeatmapPanel(props: HeatmapPanelProps) {
  const { project, baseline, heatmaps, designs, tier } = props;
  const [layer, setLayer] = useState<HeatmapLayer>('path');
  const [opacity, setOpacity] = useState(DEFAULT_OPACITY);
  const [items, setItems] = useItemsShown(props.session);
  const heatmap = useMemo(() => {
    const found = heatmaps.find((map) => map.category === layer);
    return found === undefined ? undefined : maskLockedFootprints(found, baseline);
  }, [heatmaps, layer, baseline]);
  return (
    <section className="web-insights__section" aria-labelledby="insights-heatmap">
      <h2 id="insights-heatmap">{text.heading}</h2>
      <LayerControls layer={layer} opacity={opacity} onLayer={setLayer} onOpacity={setOpacity} />
      <figure className="web-insights__terrain" aria-labelledby="insights-heatmap-caption">
        <figcaption id="insights-heatmap-caption" className="ps-chart__caption">
          {text.caption}
        </figcaption>
        <HeatLegend max={legendMax(heatmap?.values ?? [], designs)} />
        {layer === 'desireLines' ? (
          <p className="web-insights__layer-note">{text.desireLinesNote}</p>
        ) : null}
        <div className="web-insights__stage" data-heatmap={layer} data-opacity={opacity}>
          {heatmap === undefined ? null : (
            <Suspense
              fallback={
                <div className="web-insights__stage-wait">
                  <p>{text.loading}</p>
                </div>
              }
            >
              <Await resolve={props.terrain}>
                {(terrain: Heightmap | null) => (
                  <InsightsTerrain
                    project={project}
                    baseline={baseline}
                    terrain={terrain}
                    heatmap={heatmap}
                    opacity={opacity}
                    items={items}
                    onItems={setItems}
                    tier={tier}
                  />
                )}
              </Await>
            </Suspense>
          )}
        </div>
      </figure>
    </section>
  );
}
