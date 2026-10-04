import { afterEach, describe, expect, it, vi } from 'vitest';

import { webGl2Support } from './webgl-support';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('webGl2Support', () => {
  it('is missing when the browser has no WebGL2 at all', () => {
    vi.stubGlobal('WebGL2RenderingContext', undefined);
    expect(webGl2Support()).toBe('missing');
  });

  it('is available when a WebGL2 context opens, and gives that context back', () => {
    vi.stubGlobal('WebGL2RenderingContext', vi.fn());
    const loseContext = vi.fn();
    const context = { getExtension: vi.fn().mockReturnValue({ loseContext }) };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as RenderingContext,
    );
    expect(webGl2Support()).toBe('available');
    expect(context.getExtension).toHaveBeenCalledWith('WEBGL_lose_context');
    expect(loseContext).toHaveBeenCalledOnce();
  });

  it('is missing when WebGL2 is turned off and no context opens', () => {
    vi.stubGlobal('WebGL2RenderingContext', vi.fn());
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(webGl2Support()).toBe('missing');
  });
});
