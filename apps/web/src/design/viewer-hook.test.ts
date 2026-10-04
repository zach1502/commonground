import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useViewerTestHook } from './viewer-hook';

const POSE = {
  position: { x: 1, y: 2, z: 3 },
  facing: { x: 0, y: 0, z: -1 },
  target: { x: 0, y: 0, z: 0 },
};

describe('useViewerTestHook', () => {
  it('installs nothing in a normal build', () => {
    const { result } = renderHook(() => useViewerTestHook('off'));
    expect(result.current).toBeUndefined();
    expect(window.__parkshapeViewer).toBeUndefined();
  });

  it('projects plan points through the probe, with plan y as ground z', () => {
    const { result, unmount } = renderHook(() => useViewerTestHook('on'));
    const screenPointOf = vi.fn().mockReturnValue({ x: 10, y: 20 });
    result.current?.onProbe({ screenPointOf, cameraPose: () => POSE });
    expect(window.__parkshapeViewer?.screenPointOf({ x: 5, y: 7 }, 0.5)).toEqual({ x: 10, y: 20 });
    expect(screenPointOf).toHaveBeenCalledWith({ x: 5, z: 7 }, 0.5);
    expect(window.__parkshapeViewer?.cameraPose()).toEqual(POSE);
    unmount();
    expect(window.__parkshapeViewer).toBeUndefined();
  });

  it('keeps the last walk frame and the walk mode', () => {
    const { result, unmount } = renderHook(() => useViewerTestHook('on'));
    expect(window.__parkshapeViewer?.walk()).toBeNull();
    result.current?.walk.onModeChange('walk');
    result.current?.walk.onPose({ eye: { x: 4, y: 5, z: 6 }, groundM: 3.4 });
    expect(window.__parkshapeViewer?.walkMode()).toBe('walk');
    expect(window.__parkshapeViewer?.walk()).toEqual({ eye: { x: 4, y: 5, z: 6 }, groundM: 3.4 });
    unmount();
  });
});
