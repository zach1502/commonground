import { useState } from 'react';
import { useNavigate } from 'react-router';

import { ApiRequestError } from '@parkshape/api-client';
import { Button, InlineAlert, RadioGroup, Stack, TextField } from '@parkshape/ui';
import { ParcelMap, type LonLat } from '@parkshape/ui/map';

import type { WebDeps } from '../app-deps';
import { format, messages } from '../messages';

import { StepFrame } from './step-frame';
import { useWizard } from './wizard-context';
import type { ChosenSite } from './wizard-state';
import { stepHref } from './wizard-steps';

const strings = messages.planner.site;
const NOT_FOUND = 404;

type Search = 'idle' | 'searching' | 'not-found' | 'failed';

function outlineOf(site: ChosenSite | null): LonLat[] | null {
  const ring = site?.polygonWgs84.coordinates[0];
  return ring === undefined ? null : ring.map(([lon, lat]) => [lon, lat] as const);
}

function statusLine(site: ChosenSite | null): string | null {
  if (site === null) return null;
  if (site.parkName !== null) return format(strings.found, { name: site.parkName });
  const corners = (site.polygonWgs84.coordinates[0]?.length ?? 1) - 1;
  return format(strings.drawn, { count: corners });
}

function useParkSearch(deps: Pick<WebDeps, 'api'>) {
  const { state, update } = useWizard();
  const [search, setSearch] = useState<Search>('idle');
  const run = async () => {
    const parkName = state.query.trim();
    if (parkName === '') return;
    setSearch('searching');
    try {
      const found = await deps.api.loadSiteFeatures({ parkName });
      update({ site: { parkName, polygonWgs84: found.parcel.polygonWgs84 } });
      setSearch('idle');
    } catch (error) {
      setSearch(
        error instanceof ApiRequestError && error.status === NOT_FOUND ? 'not-found' : 'failed',
      );
    }
  };
  return { search, run };
}

function SearchForm({ deps }: { readonly deps: Pick<WebDeps, 'api'> }) {
  const { state, update } = useWizard();
  const { search, run } = useParkSearch(deps);
  return (
    <form
      className="web-wizard__search"
      onSubmit={(event) => {
        event.preventDefault();
        void run();
      }}
    >
      <TextField
        label={strings.searchLabel}
        description={strings.searchHelp}
        value={state.query}
        onChange={(query) => {
          update({ query });
        }}
      />
      <Button type="submit" variant="secondary" isPending={search === 'searching'}>
        {strings.search}
      </Button>
      {search === 'not-found' ? (
        <InlineAlert
          tone="warning"
          title={format(strings.notFound, { name: state.query.trim() })}
        />
      ) : null}
      {search === 'failed' ? <InlineAlert tone="danger" title={strings.failed} /> : null}
    </form>
  );
}

/** Step 1: find the park in Vancouver Open Data by name, or draw its outline on the map. */
export function SiteStep({ deps }: { readonly deps: Pick<WebDeps, 'api' | 'mapTiles'> }) {
  const { state, update } = useWizard();
  const navigate = useNavigate();
  const status = statusLine(state.site);
  return (
    <StepFrame
      step="site"
      lede={strings.lede}
      primary={{
        label: messages.planner.wizard.continue,
        state: state.site === null ? 'blocked' : 'ready',
        onPress: () => void navigate(stepHref('terrain')),
      }}
      note={state.site === null ? strings.needSite : undefined}
    >
      <div className="web-wizard__split">
        <Stack gap="medium">
          <RadioGroup
            label={strings.modeLabel}
            value={state.mode}
            options={[
              { value: 'search', label: strings.modes.search },
              { value: 'draw', label: strings.modes.draw },
            ]}
            onChange={(mode) => {
              update({ mode: mode === 'draw' ? 'draw' : 'search' });
            }}
          />
          {state.mode === 'search' ? <SearchForm deps={deps} /> : null}
          {status === null ? null : <p role="status">{status}</p>}
        </Stack>
        <ParcelMap
          tiles={deps.mapTiles}
          strings={strings.map}
          outline={outlineOf(state.site)}
          draw={state.mode === 'draw' ? 'on' : 'off'}
          onFinishDrawing={(ring) => {
            update({
              site: {
                parkName: null,
                polygonWgs84: {
                  type: 'Polygon',
                  coordinates: [ring.map(([lon, lat]) => [lon, lat])],
                },
              },
            });
          }}
        />
      </div>
    </StepFrame>
  );
}
