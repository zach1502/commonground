import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Design, Project } from '../../api/web-api';
import { messages } from '../../messages';

import { VoteStage, type VoteStageProps } from './vote-stage';

// The real viewer pulls in three.js; the stage only decides when to mount it.
const warm = vi.hoisted(() => vi.fn());
vi.mock('./vote-warm', () => ({ warmVoteModel: warm, loadVoteViewer: vi.fn() }));
vi.mock('./vote-model', () => {
  function StubModel({ shown }: { readonly shown: Design | null }) {
    return shown === null ? 'loading' : `3D view of ${shown.title}`;
  }
  return { VoteModel: StubModel };
});

/** jsdom has no PointerEvent, so a mouse event carries the pointer position under that name. */
function pointer(target: Element, type: 'pointerdown' | 'pointerup', x: number, y: number) {
  fireEvent(target, new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));
}

const PROJECT = { id: 'jrp', parcel: {} } as unknown as Project;
const DESIGN = { id: 'a', title: 'Loop park', thumbnailUrl: '/t/a.png' } as unknown as Design;

function renderStage(overrides: Partial<VoteStageProps> = {}) {
  const onSwipe = vi.fn();
  render(
    <VoteStage
      poster={DESIGN}
      shown={DESIGN}
      project={PROJECT}
      api={{
        getTerrain: vi.fn().mockReturnValue(new Promise(() => undefined)),
        getContext: vi.fn().mockReturnValue(new Promise(() => undefined)),
      }}
      onSwipe={onSwipe}
      {...overrides}
    />,
  );
  return { onSwipe };
}

describe('VoteStage', () => {
  it('shows the picture and keeps the 3D view unloaded until the voter asks', () => {
    renderStage();
    expect(screen.getByRole('img')).toHaveAttribute('src', '/t/a.png');
    expect(screen.queryByText('3D view of Loop park')).not.toBeInTheDocument();
  });

  it('mounts the 3D view after View in 3D is pressed', async () => {
    renderStage();
    await userEvent.click(screen.getByRole('button', { name: messages.vote.view3d }));
    expect(await screen.findByText('3D view of Loop park')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: messages.vote.view3d })).not.toBeInTheDocument();
  });

  it('turns View in 3D into Show picture, which brings the poster back', async () => {
    const onOpenModel = vi.fn();
    renderStage({ onOpenModel });
    await userEvent.click(screen.getByRole('button', { name: messages.vote.view3d }));
    expect(onOpenModel).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: messages.vote.showPicture }));
    expect(screen.getByRole('img')).toHaveAttribute('src', '/t/a.png');
    expect(screen.queryByText('3D view of Loop park')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: messages.vote.view3d })).toBeInTheDocument();
  });

  it('sizes the stage to the picture before it loads, so the park fills it', () => {
    renderStage();
    const stage = screen.getByTestId('vote-stage');
    expect(stage.style.getPropertyValue('--vote-stage-ratio')).toBe('640 / 400');
  });

  it('starts the 3D download on the first touch without mounting it', () => {
    renderStage();
    pointer(screen.getByTestId('vote-stage'), 'pointerdown', 10, 10);
    expect(warm).toHaveBeenCalled();
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('turns a swipe on the picture into a vote', () => {
    const { onSwipe } = renderStage();
    const stage = screen.getByTestId('vote-stage');
    pointer(stage, 'pointerdown', 10, 100);
    pointer(stage, 'pointerup', 200, 100);
    expect(onSwipe).toHaveBeenCalledWith('up');
  });

  it('ignores a tap and a pointer release with no press', () => {
    const { onSwipe } = renderStage();
    const stage = screen.getByTestId('vote-stage');
    pointer(stage, 'pointerup', 200, 100);
    pointer(stage, 'pointerdown', 10, 100);
    pointer(stage, 'pointerup', 12, 101);
    expect(onSwipe).not.toHaveBeenCalled();
  });
});
