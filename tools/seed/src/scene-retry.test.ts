import { describe, expect, it } from 'vitest';

import { renderSceneOrPoster } from './scene-retry.js';

const SCENE = new Uint8Array([1]);
const POSTER = new Uint8Array([2]);

function recorder() {
  const lines: string[] = [];
  return { lines, log: { info: (message: string) => lines.push(message) } };
}

function failingTimes(count: number) {
  let calls = 0;
  const scene = (job: string) => {
    calls += 1;
    if (calls <= count) return Promise.reject(new Error(`late ${job}`));
    return Promise.resolve(SCENE);
  };
  return { scene, calls: () => calls };
}

describe('renderSceneOrPoster', () => {
  it('returns the scene picture when the first draw works', async () => {
    const { log, lines } = recorder();
    const poster = () => Promise.reject(new Error('poster should not run'));
    const image = await renderSceneOrPoster(
      'a',
      { scene: () => Promise.resolve(SCENE), poster },
      log,
    );
    expect(image).toBe(SCENE);
    expect(lines).toEqual([]);
  });

  it('tries the scene again after one late draw on a busy machine', async () => {
    const { log, lines } = recorder();
    const scene = failingTimes(1);
    const poster = () => Promise.resolve(POSTER);
    const image = await renderSceneOrPoster('a', { scene: scene.scene, poster }, log);
    expect(image).toBe(SCENE);
    expect(scene.calls()).toBe(2);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('late a');
  });

  it('draws the plan poster for that design when the scene stays late', async () => {
    const { log, lines } = recorder();
    const scene = failingTimes(Number.POSITIVE_INFINITY);
    const image = await renderSceneOrPoster(
      'a',
      { scene: scene.scene, poster: () => Promise.resolve(POSTER) },
      log,
    );
    expect(image).toBe(POSTER);
    expect(scene.calls()).toBe(2);
    expect(lines).toHaveLength(2);
  });
});
