// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FADE } from './panel-motion.js';
import type { MotionPreference } from './rise.js';
import { usePresence, type Shown } from './use-presence.js';

function Card({ shown, motion }: { shown: Shown; motion: MotionPreference }): ReactElement | null {
  const presence = usePresence<HTMLParagraphElement>(shown, FADE, { motion });
  if (presence.mounted === 'unmounted') return null;
  return (
    <p ref={presence.ref} {...presence.leaving}>
      card
    </p>
  );
}

function deferredAnimate() {
  let finish: () => void = () => undefined;
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const animate = vi.fn(() => ({ finished }));
  Object.defineProperty(HTMLElement.prototype, 'animate', { value: animate, configurable: true });
  return { animate, finish };
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLElement.prototype, 'animate');
});

describe('usePresence', () => {
  it('plays one entry when shown and keeps the element until the exit ends', async () => {
    const { animate, finish } = deferredAnimate();
    const view = render(<Card shown="hidden" motion="full" />);
    view.rerender(<Card shown="shown" motion="full" />);
    expect(animate).toHaveBeenCalledTimes(1);
    view.rerender(<Card shown="hidden" motion="full" />);
    expect(animate).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('card')?.getAttribute('aria-hidden')).toBe('true');
    await act(async () => {
      finish();
      await Promise.resolve();
    });
    expect(screen.queryByText('card')).toBeNull();
  });

  it('skips the entry on the first render unless asked', () => {
    const { animate } = deferredAnimate();
    render(<Card shown="shown" motion="full" />);
    expect(animate).not.toHaveBeenCalled();
  });

  it('unmounts in the same commit with no animation under reduced motion', () => {
    const { animate } = deferredAnimate();
    const view = render(<Card shown="hidden" motion="reduced" />);
    view.rerender(<Card shown="shown" motion="reduced" />);
    view.rerender(<Card shown="hidden" motion="reduced" />);
    expect(animate).not.toHaveBeenCalled();
    expect(screen.queryByText('card')).toBeNull();
  });
});

describe('usePresence on a first render that is hidden', () => {
  it('plays nothing', () => {
    const { animate } = deferredAnimate();
    render(<Card shown="hidden" motion="full" />);
    expect(animate).not.toHaveBeenCalled();
  });
});
