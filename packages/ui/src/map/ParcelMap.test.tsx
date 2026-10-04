import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { StaticTileSource } from '../adapters/static-tile-source.js';

import { ParcelMap, type ParcelMapStrings } from './ParcelMap.js';

type Handler = (event?: unknown) => void;

const fake = vi.hoisted(() => {
  class FakeMap {
    static instances: FakeMap[] = [];
    readonly handlers = new Map<string, Handler>();
    readonly sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
    readonly layers: string[] = [];
    readonly fitBounds = vi.fn();
    readonly remove = vi.fn();

    constructor(readonly options: { style: unknown }) {
      FakeMap.instances.push(this);
    }

    on(event: string, handler: Handler) {
      this.handlers.set(event, handler);
    }

    fire(event: string, payload?: unknown) {
      this.handlers.get(event)?.(payload);
    }

    addSource(id: string) {
      this.sources.set(id, { setData: vi.fn() });
    }

    addLayer(layer: { id: string }) {
      this.layers.push(layer.id);
    }

    getSource(id: string) {
      return this.sources.get(id);
    }
  }
  return { FakeMap };
});

vi.mock('./load-maplibre.js', () => ({
  loadMaplibre: () => Promise.resolve({ Map: fake.FakeMap }),
}));

const STRINGS: ParcelMapStrings = {
  region: 'Park map',
  finish: 'Finish outline',
  clear: 'Clear outline',
  drawHint: 'Click the map to add each corner.',
  loading: 'Loading map',
};
const TILES = new StaticTileSource({ colour: 'green', attribution: 'Test fill' });
const RING = [
  [-123.109, 49.2646],
  [-123.1069, 49.2646],
  [-123.1069, 49.2639],
] as const;

async function loadedMap() {
  await waitFor(() => {
    expect(fake.FakeMap.instances.length).toBeGreaterThan(0);
  });
  const map = fake.FakeMap.instances[fake.FakeMap.instances.length - 1];
  if (map === undefined) throw new Error('no map');
  act(() => {
    map.fire('load');
  });
  return map;
}

function clickAt(map: InstanceType<typeof fake.FakeMap>, [lng, lat]: readonly [number, number]) {
  act(() => {
    map.fire('click', { lngLat: { lng, lat } });
  });
}

describe('ParcelMap', () => {
  it('draws the basemap from the tile source and adds the overlays once loaded', async () => {
    render(<ParcelMap tiles={TILES} strings={STRINGS} outline={RING} />);
    expect(screen.getByRole('region', { name: 'Park map' })).toHaveAttribute('data-map', 'loading');
    const map = await loadedMap();
    expect(map.options.style).toMatchObject({ layers: [{ type: 'background' }] });
    expect(map.layers).toContain('markers');
    expect(screen.getByRole('region', { name: 'Park map' })).toHaveAttribute('data-map', 'ready');
    expect(map.sources.get('outline')?.setData).toHaveBeenCalled();
    expect(map.fitBounds).toHaveBeenCalled();
  });

  it('shows markers with their lock state', async () => {
    const markers = [{ id: 't1', lonLat: RING[0], locked: 'locked' as const }];
    render(<ParcelMap tiles={TILES} strings={STRINGS} outline={null} markers={markers} />);
    const map = await loadedMap();
    const data = map.sources.get('markers')?.setData.mock.lastCall?.[0] as {
      features: { properties: { locked: string } }[];
    };
    expect(data.features[0]?.properties.locked).toBe('locked');
  });
});

describe('ParcelMap outline tool', () => {
  it('adds a corner per click and finishes a closed outline', async () => {
    const onFinish = vi.fn();
    render(
      <ParcelMap
        tiles={TILES}
        strings={STRINGS}
        outline={null}
        draw="on"
        onFinishDrawing={onFinish}
      />,
    );
    const map = await loadedMap();
    const finish = screen.getByRole('button', { name: 'Finish outline' });
    expect(finish).toBeDisabled();
    RING.forEach((corner) => {
      clickAt(map, corner);
    });
    expect(finish).toBeEnabled();
    await userEvent.click(finish);
    expect(onFinish).toHaveBeenCalledWith([...RING, RING[0]]);
  });

  it('clears the corners and ignores clicks when not drawing', async () => {
    const onFinish = vi.fn();
    const { rerender } = render(
      <ParcelMap
        tiles={TILES}
        strings={STRINGS}
        outline={null}
        draw="on"
        onFinishDrawing={onFinish}
      />,
    );
    const map = await loadedMap();
    RING.forEach((corner) => {
      clickAt(map, corner);
    });
    await userEvent.click(screen.getByRole('button', { name: 'Clear outline' }));
    expect(screen.getByRole('button', { name: 'Finish outline' })).toBeDisabled();
    rerender(<ParcelMap tiles={TILES} strings={STRINGS} outline={null} />);
    clickAt(map, RING[0]);
    expect(screen.queryByRole('button', { name: 'Finish outline' })).toBeNull();
  });

  it('removes the map when it unmounts', async () => {
    const { unmount } = render(<ParcelMap tiles={TILES} strings={STRINGS} outline={null} />);
    const map = await loadedMap();
    unmount();
    expect(map.remove).toHaveBeenCalled();
  });
});
