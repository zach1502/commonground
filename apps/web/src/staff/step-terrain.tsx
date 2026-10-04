import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

import { Button, InlineAlert } from '@parkshape/ui';

import type { TerrainLoad } from '../api/staff-api';
import type { WebDeps } from '../app-deps';
import { format, messages } from '../messages';

import { StepFrame } from './step-frame';
import { useWizard } from './wizard-context';
import { stepHref } from './wizard-steps';

const strings = messages.planner.terrain;
// One grid cell per metre, the same resolution the metrics use.
const TERRAIN_RESOLUTION_M = 1;

type Load = 'idle' | 'loading' | 'failed';

function TerrainSource({ terrain }: { readonly terrain: TerrainLoad }) {
  return (
    <dl className="web-wizard__facts">
      <dt>{strings.sourceLabel}</dt>
      <dd data-testid="terrain-source">{strings.providers[terrain.provider]}</dd>
      <dd>
        {format(strings.summary, {
          width: terrain.width,
          height: terrain.height,
          resolution: terrain.resolutionM,
          source: terrain.source.name,
          licence: terrain.source.licence,
        })}
      </dd>
    </dl>
  );
}

/** Step 2: fetch bare-earth elevation for the outline and name the source that supplied it. */
export function TerrainStep({ deps }: { readonly deps: Pick<WebDeps, 'api'> }) {
  const { state, update } = useWizard();
  const navigate = useNavigate();
  const [load, setLoad] = useState<Load>('idle');
  const { site } = state;
  const run = useCallback(async () => {
    if (site === null) return;
    setLoad('loading');
    try {
      update({ terrain: await deps.api.loadTerrain(site.polygonWgs84, TERRAIN_RESOLUTION_M) });
      setLoad('idle');
    } catch {
      setLoad('failed');
    }
  }, [deps.api, site, update]);
  const missing = state.terrain === null;
  useEffect(() => {
    if (missing) void run();
  }, [missing, run]);
  return (
    <StepFrame
      step="terrain"
      lede={strings.lede}
      primary={{
        label: messages.planner.wizard.continue,
        state: missing ? 'blocked' : 'ready',
        onPress: () => void navigate(stepHref('review')),
      }}
      note={missing ? strings.needTerrain : undefined}
    >
      {load === 'loading' ? <p role="status">{strings.loading}</p> : null}
      {load === 'failed' ? <InlineAlert tone="danger" title={strings.failed} /> : null}
      {state.terrain === null ? null : <TerrainSource terrain={state.terrain} />}
      <Button variant="secondary" isPending={load === 'loading'} onPress={() => void run()}>
        {missing ? strings.load : strings.reload}
      </Button>
    </StepFrame>
  );
}
