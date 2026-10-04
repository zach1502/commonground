import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Design, Project } from '../../api/web-api';
import { messages } from '../../messages';

import type { VoteModelProps } from './vote-model';
import { VoteStage, type VoteStageProps } from './vote-stage';

const support = vi.hoisted(() => {
  const state: { value: 'available' | 'missing' } = { value: 'available' };
  return state;
});
vi.mock('../../design/webgl-support', () => ({ webGl2Support: () => support.value }));
vi.mock('./vote-warm', () => ({ warmVoteModel: vi.fn(), loadVoteViewer: vi.fn() }));
// The real viewer pulls in three.js. The stand-in shows whether it walks and offers the exit.
vi.mock('./vote-model', () => {
  function StubModel({ shown, walk }: VoteModelProps) {
    if (shown === null) return 'loading';
    if (walk === undefined) return `3D view of ${shown.title}`;
    return (
      <button type="button" onClick={walk.onLeave}>
        Back to overview
      </button>
    );
  }
  return { VoteModel: StubModel };
});

/** jsdom has no PointerEvent, so a mouse event carries the pointer position under that name. */
function pointer(target: Element, type: 'pointerdown' | 'pointerup', x: number, y: number) {
  fireEvent(target, new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));
}

const PROJECT = { id: 'jrp', parcel: {} } as unknown as Project;
const DESIGN = { id: 'a', title: 'Loop park', thumbnailUrl: '/t/a.png' } as unknown as Design;
const WALK_NAME = messages.walk.start;

function stage(overrides: Partial<VoteStageProps> = {}) {
  return (
    <VoteStage
      poster={DESIGN}
      shown={DESIGN}
      project={PROJECT}
      designId="a"
      api={{
        getTerrain: vi.fn().mockReturnValue(new Promise(() => undefined)),
        getContext: vi.fn().mockReturnValue(new Promise(() => undefined)),
      }}
      onSwipe={vi.fn()}
      compare={<button type="button">{messages.vote.compare}</button>}
      {...overrides}
    />
  );
}

beforeEach(() => {
  support.value = 'available';
});

describe('Walk the park on the vote card', () => {
  it('sits in the row with View in 3D and Compare with today', () => {
    render(stage());
    const row = screen.getByRole('button', { name: messages.vote.view3d }).parentElement;
    if (row === null) throw new Error('View in 3D has no row');
    const buttons = within(row).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual([
      messages.vote.view3d,
      messages.vote.compare,
      WALK_NAME,
    ]);
  });

  it('is not shown when the browser has no WebGL2', () => {
    support.value = 'missing';
    render(stage());
    expect(screen.queryByRole('button', { name: WALK_NAME })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: messages.vote.view3d })).toBeInTheDocument();
  });

  it('opens the 3D view to walk from the picture, and leaving brings the picture back', async () => {
    const onOpenModel = vi.fn();
    render(stage({ onOpenModel }));
    await userEvent.click(screen.getByRole('button', { name: WALK_NAME }));
    expect(onOpenModel).toHaveBeenCalledOnce();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Back to overview' }));
    expect(screen.getByRole('img')).toHaveAttribute('src', '/t/a.png');
    expect(screen.getByRole('button', { name: WALK_NAME })).toHaveFocus();
  });

  it('goes back to the 3D view after a walk that started there', async () => {
    render(stage());
    await userEvent.click(screen.getByRole('button', { name: messages.vote.view3d }));
    await userEvent.click(screen.getByRole('button', { name: WALK_NAME }));
    await userEvent.click(await screen.findByRole('button', { name: 'Back to overview' }));
    expect(await screen.findByText('3D view of Loop park')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: messages.vote.showPicture })).toBeInTheDocument();
  });
});

describe('Walking the park from the vote card', () => {
  it('keeps the walk buttons in view, where a narrow stage hides the preset buttons', async () => {
    render(stage());
    await userEvent.click(screen.getByRole('button', { name: WALK_NAME }));
    expect(screen.getByTestId('vote-stage')).toHaveAttribute('data-presets', 'walk');
  });

  it('never turns a drag into a vote while walking', async () => {
    const onSwipe = vi.fn();
    render(stage({ onSwipe }));
    await userEvent.click(screen.getByRole('button', { name: WALK_NAME }));
    const surface = screen.getByTestId('vote-stage');
    pointer(surface, 'pointerdown', 10, 100);
    pointer(surface, 'pointerup', 200, 100);
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it('ends the walk when the next design comes up', async () => {
    const view = render(stage());
    await userEvent.click(screen.getByRole('button', { name: WALK_NAME }));
    expect(await screen.findByRole('button', { name: 'Back to overview' })).toBeInTheDocument();
    view.rerender(stage({ designId: 'b' }));
    expect(screen.queryByRole('button', { name: 'Back to overview' })).not.toBeInTheDocument();
    expect(screen.getByRole('img')).toBeInTheDocument();
  });
});
