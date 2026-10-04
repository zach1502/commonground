import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

import { Button, InlineAlert, LockToggle, SourceBadge } from '@parkshape/ui';
import { ParcelMap } from '@parkshape/ui/map';

import type { ProposedFeature } from '../api/staff-api';
import type { WebDeps } from '../app-deps';
import { format, messages } from '../messages';

import { defaultLocks, placeableFeatures, type LockChoice, type Locks } from './baseline';
import { datasetName } from './dataset-name';
import { StepFrame } from './step-frame';
import { useWizard } from './wizard-context';
import type { ChosenSite } from './wizard-state';
import { stepHref } from './wizard-steps';

const strings = messages.planner.review;

type Load = 'idle' | 'loading' | 'failed';

function featureName(feature: ProposedFeature): string {
  return (
    feature.name ?? format(strings.unnamed, { kind: strings.kinds[feature.kind].toLowerCase() })
  );
}

function lockOf(locks: Locks, feature: ProposedFeature): LockChoice {
  return locks[feature.id] ?? (feature.suggestedLocked ? 'locked' : 'unlocked');
}

interface RowProps {
  readonly feature: ProposedFeature;
  readonly row: number;
  readonly lock: LockChoice;
  readonly onLock: (id: string, lock: LockChoice) => void;
}

function FeatureRow({ feature, row, lock, onLock }: RowProps) {
  const name = featureName(feature);
  return (
    <tr>
      <th scope="row">{name}</th>
      <td>{strings.kinds[feature.kind]}</td>
      <td>
        {feature.dbhCm === null ? strings.noTrunk : format(strings.trunk, { dbh: feature.dbhCm })}
      </td>
      <td>
        <SourceBadge
          source={feature.source}
          dataset={datasetName(feature.datasetId, strings.datasets)}
          note={feature.reviewOnly ? strings.reviewOnly : undefined}
        />
      </td>
      <td>
        <LockToggle
          state={lock}
          label={format(strings.lockLabel, { name, row })}
          text={strings.lockSwitch}
          onChange={(next) => {
            onLock(feature.id, next);
          }}
        />
      </td>
    </tr>
  );
}

function FeatureTable({
  features,
  locks,
  onLock,
}: {
  readonly features: readonly ProposedFeature[];
  readonly locks: Locks;
  readonly onLock: RowProps['onLock'];
}) {
  const locked = features.filter((feature) => lockOf(locks, feature) === 'locked').length;
  const { columns } = strings;
  return (
    <table className="ps-table web-table">
      <caption>{format(strings.caption, { count: features.length, locked })}</caption>
      <thead>
        <tr>
          <th scope="col">{columns.feature}</th>
          <th scope="col">{columns.kind}</th>
          <th scope="col">{columns.trunk}</th>
          <th scope="col">{columns.source}</th>
          <th scope="col">{columns.lock}</th>
        </tr>
      </thead>
      <tbody>
        {features.map((feature, index) => (
          <FeatureRow
            key={feature.id}
            feature={feature}
            row={index + 1}
            lock={lockOf(locks, feature)}
            onLock={onLock}
          />
        ))}
      </tbody>
    </table>
  );
}

function useSiteFeatures(deps: Pick<WebDeps, 'api'>, site: ChosenSite | null) {
  const { state, update } = useWizard();
  const [load, setLoad] = useState<Load>('idle');
  const run = useCallback(async () => {
    if (site === null) return;
    setLoad('loading');
    try {
      const query =
        site.parkName === null ? { polygonWgs84: site.polygonWgs84 } : { parkName: site.parkName };
      const features = await deps.api.loadSiteFeatures(query);
      update({ features, locks: defaultLocks(features.features) });
      setLoad('idle');
    } catch {
      setLoad('failed');
    }
  }, [deps.api, site, update]);
  const missing = state.features === null;
  useEffect(() => {
    if (missing) void run();
  }, [missing, run]);
  return { load, run };
}

/** Step 3: the proposed baseline as a table beside a map, with a lock and a source per row. */
export function ReviewStep({ deps }: { readonly deps: Pick<WebDeps, 'api' | 'mapTiles'> }) {
  const { state, update } = useWizard();
  const navigate = useNavigate();
  const { load, run } = useSiteFeatures(deps, state.site);
  const all = state.features?.features ?? [];
  const features = placeableFeatures(all);
  const skipped = all.length - features.length;
  const outline = state.features?.parcel.polygonWgs84.coordinates[0] ?? null;
  return (
    <StepFrame
      step="review"
      lede={strings.lede}
      primary={{
        label: messages.planner.wizard.continue,
        state: state.features === null ? 'blocked' : 'ready',
        onPress: () => void navigate(stepHref('parameters')),
      }}
    >
      {load === 'loading' ? <p role="status">{strings.loading}</p> : null}
      {load === 'failed' ? (
        <InlineAlert tone="danger" title={strings.failed}>
          <Button variant="secondary" onPress={() => void run()}>
            {strings.retry}
          </Button>
        </InlineAlert>
      ) : null}
      <div className="web-wizard__split web-wizard__split--review">
        <div className="web-wizard__table">
          <FeatureTable
            features={features}
            locks={state.locks}
            onLock={(id, lock) => {
              update({ locks: { ...state.locks, [id]: lock } });
            }}
          />
          {skipped > 0 ? <p>{format(strings.skipped, { count: skipped })}</p> : null}
        </div>
        <ParcelMap
          tiles={deps.mapTiles}
          strings={{ ...messages.planner.site.map, region: strings.mapRegion }}
          outline={outline}
          markers={features.map((feature) => ({
            id: feature.id,
            lonLat: feature.lonLat,
            locked: lockOf(state.locks, feature),
          }))}
        />
      </div>
    </StepFrame>
  );
}
