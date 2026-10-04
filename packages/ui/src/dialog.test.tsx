import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Button } from './button.js';
import { Dialog } from './dialog.js';
import { MOTION_EASING, MOTION_MS } from './motion/index.js';

function Harness({ onClose }: { readonly onClose: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        onPress={() => {
          setOpen(true);
        }}
      >
        Open
      </Button>
      {open ? (
        <Dialog
          title="Submit design"
          onClose={() => {
            onClose();
            setOpen(false);
          }}
          actions={
            <>
              <Button variant="tertiary">Keep editing</Button>
              <Button>Submit design</Button>
            </>
          }
        >
          <p>Submitted designs are final.</p>
        </Dialog>
      ) : null}
    </>
  );
}

async function openHarness() {
  const onClose = vi.fn();
  render(<Harness onClose={onClose} />);
  await userEvent.click(screen.getByRole('button', { name: 'Open' }));
  return { onClose };
}

describe('Dialog', () => {
  it('is a labelled modal dialog over a backdrop', async () => {
    await openHarness();
    const dialog = screen.getByRole('dialog', { name: 'Submit design' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.closest('.ps-dialog__backdrop')).not.toBeNull();
  });

  it('puts the primary action first, on the left, whatever order the caller gives', async () => {
    await openHarness();
    const actions = screen.getByRole('dialog').querySelector('.ps-dialog__actions');
    const names = [...(actions?.querySelectorAll('button') ?? [])].map(
      (button) => button.textContent,
    );
    expect(names).toEqual(['Submit design', 'Keep editing']);
  });

  it('moves focus into the dialog when it opens', async () => {
    await openHarness();
    expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus();
  });

  it('keeps Tab and Shift+Tab inside the dialog', async () => {
    await openHarness();
    const first = screen.getByRole('button', { name: 'Keep editing' });
    const last = screen.getByRole('button', { name: 'Submit design' });
    await userEvent.tab();
    expect(last).toHaveFocus();
    await userEvent.tab();
    expect(first).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(last).toHaveFocus();
  });

  it('closes on Escape and returns focus to the control that opened it', async () => {
    const { onClose } = await openHarness();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
  });
});

interface Played {
  readonly target: Element;
  readonly keyframes: Keyframe[];
  readonly options: KeyframeAnimationOptions;
  readonly finish: () => void;
}
let played: Played[] = [];

function setReduced(reduce: 'reduce' | 'no-preference') {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce === 'reduce' && query.includes('reduce'),
  }));
}

function CancelHarness({ onClose }: { readonly onClose: () => void }) {
  const [open, setOpen] = useState(true);
  return open ? (
    <Dialog
      title="Submit design"
      onClose={() => {
        onClose();
        setOpen(false);
      }}
      actions={(close) => (
        <Button variant="tertiary" onPress={close}>
          Keep editing
        </Button>
      )}
    >
      <p>Submitted designs are final.</p>
    </Dialog>
  ) : null;
}

function installFakeAnimate() {
  beforeEach(() => {
    played = [];
    setReduced('no-preference');
    Element.prototype.animate = function animate(this: Element, keyframes, options) {
      let finish: () => void = () => undefined;
      const finished = new Promise<void>((resolve) => {
        finish = resolve;
      });
      played.push({
        target: this,
        keyframes: keyframes as Keyframe[],
        options: options as KeyframeAnimationOptions,
        finish,
      });
      return { finished, cancel: vi.fn() } as unknown as Animation;
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (Element.prototype as Partial<Element>).animate;
  });
}

describe('Dialog motion (J3)', () => {
  installFakeAnimate();

  it('rises 8 px and fades in over 250 ms as one animation on the dialog', async () => {
    render(<Harness onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = screen.getByRole('dialog');
    expect(played).toHaveLength(1);
    expect(played[0]?.target).toBe(dialog);
    expect(played[0]?.keyframes[0]).toEqual({ opacity: 0, transform: 'translateY(8px)' });
    expect(played[0]?.options).toMatchObject({
      duration: MOTION_MS.medium,
      easing: MOTION_EASING.entry,
    });
  });

  it('waits for the 150 ms exit to finish before it closes, then returns focus', async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const opener = screen.getByRole('button', { name: 'Open' });
    await userEvent.click(opener);
    await userEvent.keyboard('{Escape}');
    const leaving = played[1];
    expect(leaving?.options).toMatchObject({
      duration: MOTION_MS.small,
      easing: MOTION_EASING.exit,
    });
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => {
      leaving?.finish();
      await Promise.resolve();
    });
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });
});

describe('Dialog motion (J3) close paths', () => {
  installFakeAnimate();

  it('gives the caller an animated close for its own buttons, and closes once', async () => {
    const onClose = vi.fn();
    render(<CancelHarness onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    await userEvent.keyboard('{Escape}');
    await act(async () => {
      played.forEach((call) => {
        call.finish();
      });
      await Promise.resolve();
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('opens and closes at once under reduced motion', async () => {
    setReduced('reduce');
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await userEvent.keyboard('{Escape}');
    expect(played).toHaveLength(0);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
