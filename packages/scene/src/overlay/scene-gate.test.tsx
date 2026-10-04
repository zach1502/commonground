// @vitest-environment jsdom
import { cleanup, render, renderHook, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useRenderProfile } from '../components/use-render-profile.js';

import { SceneGate } from './SceneGate.js';

const MESSAGE = 'This browser has no WebGL2, so the 3D view cannot open.';
const LINK = 'See the design pictures';

function Viewer(): ReactElement {
  const { profile } = useRenderProfile('desktop-pinned', undefined);
  return (
    <SceneGate
      caveat={profile.caveat}
      fallback={
        <>
          <p>{MESSAGE}</p>
          <a href="/projects/p/designs">{LINK}</a>
        </>
      }
    >
      <canvas aria-label="3D view" />
    </SceneGate>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('SceneGate when the probe finds no WebGL2', () => {
  beforeEach(() => {
    // The probe asks a canvas for WebGL2 contexts; null for both is a browser without WebGL2.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    // jsdom has no matchMedia; the probe reads the pointer from it.
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
  });

  it('reports the missing caveat from the render profile, even on a pinned test tier', () => {
    const { result } = renderHook(() => useRenderProfile('desktop-pinned', undefined));
    expect(result.current.profile.caveat).toBe('missing');
  });

  it('shows the WebGL2 message and the app link where the 3D view would be', () => {
    render(<Viewer />);
    expect(screen.getByText(MESSAGE)).toBeDefined();
    expect(screen.getByRole('link', { name: LINK })).toBeDefined();
    expect(screen.queryByLabelText('3D view')).toBeNull();
  });
});

describe('SceneGate with WebGL2', () => {
  it('renders the 3D view and no message', () => {
    render(
      <SceneGate caveat="none" fallback={<p>{MESSAGE}</p>}>
        <canvas aria-label="3D view" />
      </SceneGate>,
    );
    expect(screen.getByLabelText('3D view')).toBeDefined();
    expect(screen.queryByText(MESSAGE)).toBeNull();
  });

  it('renders the 3D view under a major caveat too', () => {
    render(
      <SceneGate caveat="major" fallback={<p>{MESSAGE}</p>}>
        <canvas aria-label="3D view" />
      </SceneGate>,
    );
    expect(screen.getByLabelText('3D view')).toBeDefined();
  });
});
