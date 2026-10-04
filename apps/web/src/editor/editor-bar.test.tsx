import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createEditorStore, type EditorStore } from '@parkshape/scene/editor';

import { messages } from '../messages';

import type { SaveStatus } from './autosave';
import { EditorBar } from './editor-bar';

const EMPTY = { version: 1, items: [], paths: [], areas: [], gradeDelta: { cells: [] }, zones: [] };

const noConflict = null;

function renderBar(
  status: SaveStatus,
  conflict: { onKeep: () => void; onUseSaved: () => void } | null = noConflict,
  extra: { closed?: boolean; signInHref?: string } = {},
) {
  const store: EditorStore = createEditorStore({ document: EMPTY } as never);
  const router = createMemoryRouter([
    {
      path: '/',
      element: (
        <EditorBar
          heading="Design the park"
          store={store}
          status={status}
          refusal={null}
          submitting="idle"
          onSubmit={vi.fn()}
          conflict={conflict}
          closed={extra.closed ?? false}
          signInHref={extra.signInHref ?? '/login'}
        />
      ),
    },
  ]);
  render(<RouterProvider router={router} />);
}

function barAt(status: SaveStatus, store: EditorStore) {
  return (
    <MemoryRouter>
      <EditorBar
        heading="Design the park"
        store={store}
        status={status}
        refusal={null}
        submitting="idle"
        onSubmit={vi.fn()}
        conflict={null}
        closed={false}
        signInHref="/login"
      />
    </MemoryRouter>
  );
}

describe('EditorBar failed-save alert', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays up through the retry while saving and leaves once the save succeeds', () => {
    vi.useFakeTimers();
    const store: EditorStore = createEditorStore({ document: EMPTY } as never);
    const view = render(barAt('failed', store));
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    view.rerender(barAt('pending', store));
    view.rerender(barAt('saving', store));
    expect(screen.getByRole('alert')).toHaveTextContent(messages.editor.save.failed);
    vi.runAllTimers();
    expect(screen.getByRole('alert')).toHaveTextContent(messages.editor.save.failed);
    view.rerender(barAt('saved', store));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not come back on a later save after the one that succeeded', () => {
    const store: EditorStore = createEditorStore({ document: EMPTY } as never);
    const view = render(barAt('failed', store));
    view.rerender(barAt('saved', store));
    view.rerender(barAt('saving', store));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('gives way to the signed-out alert, so only one alert shows', () => {
    const store: EditorStore = createEditorStore({ document: EMPTY } as never);
    const view = render(barAt('failed', store));
    view.rerender(barAt('signedOut', store));
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent(messages.failure.signedOut);
  });
});

describe('EditorBar save status', () => {
  it('says saving is paused and the changes stay on this device, with no alert', () => {
    renderBar('paused');
    expect(screen.getByRole('status')).toHaveTextContent(messages.editor.save.paused);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the refusal as an alert when the server did not take the change', () => {
    renderBar('failed');
    expect(screen.getByText(messages.editor.save.failed)).toBeInTheDocument();
  });

  it('after a 401 shows one alert with the signed-out fact and a sign-in link', () => {
    renderBar('signedOut', noConflict, { signInHref: '/login?returnTo=%2Feditor' });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(messages.failure.signedOut);
    const link = screen.getByRole('link', { name: messages.failure.signIn });
    expect(link).toHaveAttribute('href', '/login?returnTo=%2Feditor');
  });

  it('does not claim a save when signed out', () => {
    renderBar('signedOut');
    expect(screen.queryByText(messages.editor.save.saved)).toBeNull();
  });
});

describe('EditorBar on a closed project', () => {
  it('shows the closed reason once as an alert and hides Submit', () => {
    renderBar('saved', noConflict, { closed: true });
    expect(screen.getByRole('alert')).toHaveTextContent(messages.failure.editingClosedProject);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: messages.editor.submit })).toBeNull();
  });

  it('never claims a save that cannot happen on a closed project', () => {
    renderBar('saved', noConflict, { closed: true });
    expect(screen.queryByText(messages.editor.save.saved)).toBeNull();
  });
});

describe('EditorBar conflict choice', () => {
  it('names the conflict and offers both versions, and each button calls its choice', async () => {
    const choice = { onKeep: vi.fn(), onUseSaved: vi.fn() };
    renderBar('conflict', choice);
    expect(screen.getByText(messages.editor.save.conflict)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: messages.editor.save.keepMine }));
    expect(choice.onKeep).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: messages.editor.save.useSaved }));
    expect(choice.onUseSaved).toHaveBeenCalledOnce();
    expect(screen.getByRole('status', { name: messages.editor.save.conflict })).toBeVisible();
  });
});
