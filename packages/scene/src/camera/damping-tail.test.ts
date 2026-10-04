import { describe, expect, it } from 'vitest';

import { createDampingSettler, type DampedControls } from './damping-tail.js';

/** A stand-in for OrbitControls with damping: each update spends a tenth of what is left. */
function fakeControls(left: number) {
  const moves: number[] = [];
  const controls: DampedControls & { left: number } = {
    enableDamping: true,
    left,
    update() {
      const step = this.enableDamping ? this.left * 0.1 : this.left;
      this.left -= step;
      moves.push(step);
      return step > 0;
    },
  };
  return { controls, moves };
}

describe('createDampingSettler (owner bug 1 under full motion)', () => {
  it('spends what is left of the inertia in the first frame with no orbit change', () => {
    const { controls, moves } = fakeControls(0.01);
    const settler = createDampingSettler(() => controls);
    settler.changed();
    expect(settler.frame()).toBe('moving');
    expect(settler.frame()).toBe('settled');
    expect(controls.left).toBe(0);
    expect(moves).toEqual([0.01]);
    expect(controls.enableDamping).toBe(true);
  });

  it('leaves the camera alone on later frames, so an edit cannot nudge it', () => {
    const { controls, moves } = fakeControls(0.01);
    const settler = createDampingSettler(() => controls);
    settler.changed();
    settler.frame();
    settler.frame();
    expect(settler.frame()).toBe('still');
    expect(settler.frame()).toBe('still');
    expect(moves).toHaveLength(1);
  });

  it('does nothing while the orbit keeps changing', () => {
    const { controls, moves } = fakeControls(0.01);
    const settler = createDampingSettler(() => controls);
    for (let frame = 0; frame < 3; frame += 1) {
      settler.changed();
      expect(settler.frame()).toBe('moving');
    }
    expect(moves).toEqual([]);
  });

  it('skips the flush when damping is off, as under reduced motion', () => {
    const { controls, moves } = fakeControls(0.01);
    controls.enableDamping = false;
    const settler = createDampingSettler(() => controls);
    settler.changed();
    settler.frame();
    expect(settler.frame()).toBe('settled');
    expect(moves).toEqual([]);
    expect(controls.enableDamping).toBe(false);
  });

  it('waits for the controls to exist', () => {
    const settler = createDampingSettler(() => null);
    settler.changed();
    settler.frame();
    expect(settler.frame()).toBe('settled');
  });
});
