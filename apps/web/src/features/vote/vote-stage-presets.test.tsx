import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Design, Project } from '../../api/web-api';
import { messages } from '../../messages';

import { VoteStage } from './vote-stage';

const viewer = messages.editor.viewer;
const PRESET_LABELS = [viewer.resetView, viewer.topDown, viewer.birdsEye] as const;

// The stub stands in for the 3D viewer's own preset group, the one the scene draws on the canvas.
const pressed = vi.hoisted(() => vi.fn());
vi.mock('./vote-warm', () => ({ warmVoteModel: vi.fn(), loadVoteViewer: vi.fn() }));
vi.mock('./vote-model', async () => {
  const { messages: text } = await import('../../messages');
  const labels = [
    text.editor.viewer.resetView,
    text.editor.viewer.topDown,
    text.editor.viewer.birdsEye,
  ];
  function StubModel() {
    return (
      <div role="group" aria-label={text.editor.viewer.viewControls}>
        {labels.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              pressed(label);
            }}
          >
            {label}
          </button>
        ))}
      </div>
    );
  }
  return { VoteModel: StubModel };
});

const PHONE_QUERY = '(max-width: 479px)';

/** A matchMedia that answers only the under-480 query, as a phone or a wider window would. */
function mockWidth(width: 'phone' | 'wide') {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: width === 'phone' && query === PHONE_QUERY,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  pressed.mockReset();
});

const PROJECT = { id: 'jrp', parcel: {} } as unknown as Project;
const DESIGN = { id: 'a', title: 'Loop park', thumbnailUrl: '/t/a.png' } as unknown as Design;

async function openModel() {
  render(
    <VoteStage
      poster={DESIGN}
      shown={DESIGN}
      project={PROJECT}
      api={{
        getTerrain: vi.fn().mockReturnValue(new Promise(() => undefined)),
        getContext: vi.fn().mockReturnValue(new Promise(() => undefined)),
      }}
      onSwipe={vi.fn()}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: messages.vote.view3d }));
  return screen.getByTestId('vote-stage');
}

const viewButton = () => screen.queryByRole('button', { name: messages.vote.viewMenu });

describe('VoteStage camera presets under 480 px', () => {
  it('hides the scene presets and shows no View control before the voter touches the stage', async () => {
    mockWidth('phone');
    const stage = await openModel();
    expect(stage).toHaveAttribute('data-presets', 'menu');
    expect(viewButton()).toBeNull();
  });

  it('shows one View control outside the picture after the first touch on the stage', async () => {
    mockWidth('phone');
    const stage = await openModel();
    fireEvent.pointerDown(stage);
    const view = viewButton();
    expect(view).toBeInTheDocument();
    expect(stage).not.toContainElement(view);
    expect(view).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens a small menu of the three presets, and each one moves the scene camera', async () => {
    mockWidth('phone');
    const stage = await openModel();
    fireEvent.pointerDown(stage);
    for (const label of PRESET_LABELS) {
      await userEvent.click(screen.getByRole('button', { name: messages.vote.viewMenu }));
      const menu = document.getElementById(viewButton()?.getAttribute('aria-controls') ?? '');
      expect(menu).toHaveRole('group');
      expect(menu).toHaveAccessibleName(viewer.viewControls);
      if (menu === null) return;
      expect(stage).not.toContainElement(menu);
      await userEvent.click(within(menu).getByRole('button', { name: label }));
      expect(pressed).toHaveBeenLastCalledWith(label);
    }
    expect(pressed).toHaveBeenCalledTimes(PRESET_LABELS.length);
    expect(viewButton()).toHaveFocus();
    expect(viewButton()).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes the menu on Escape and gives focus back to View', async () => {
    mockWidth('phone');
    const stage = await openModel();
    fireEvent.pointerDown(stage);
    await userEvent.click(screen.getByRole('button', { name: messages.vote.viewMenu }));
    await userEvent.keyboard('{Escape}');
    expect(viewButton()).toHaveAttribute('aria-expanded', 'false');
    expect(viewButton()).toHaveFocus();
    expect(pressed).not.toHaveBeenCalled();
  });
});

describe('VoteStage camera presets at 480 px and wider', () => {
  it('keeps the scene presets as they are and adds no View control', async () => {
    mockWidth('wide');
    const stage = await openModel();
    fireEvent.pointerDown(stage);
    expect(stage).toHaveAttribute('data-presets', 'toolbar');
    expect(viewButton()).toBeNull();
    expect(within(stage).getByRole('button', { name: viewer.resetView })).toBeInTheDocument();
  });
});
