import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { messages } from '../messages';

import { BriefPanel } from './brief-panel';

const BRIEF = 'Add shade near the play area. Keep the community garden.';

describe('BriefPanel', () => {
  it('starts closed and opens to show the staff brief', async () => {
    render(<BriefPanel brief={BRIEF} />);
    const toggle = screen.getByText(messages.editor.brief);
    const details = toggle.closest('details');
    expect(details).not.toHaveAttribute('open');
    await userEvent.click(toggle);
    expect(details).toHaveAttribute('open');
    expect(screen.getByText(BRIEF)).toBeVisible();
  });

  it('renders nothing when the brief is empty', () => {
    const { container } = render(<BriefPanel brief="" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('BriefPanel with a selection (owner bug 2)', () => {
  const bench = { name: 'Bench', kind: 'Seating', costCad: 3500 };

  it('names the selected item, its kind and its cost, outside the closed brief', () => {
    render(<BriefPanel brief={BRIEF} selected={bench} />);
    const line = screen.getByText(/Bench/);
    expect(line).toBeVisible();
    expect(line).toHaveTextContent('Seating');
    expect(line).toHaveTextContent('$3,500');
  });

  it('shows the brief sentence that mentions the selected item', () => {
    const garden = { name: 'Community garden', kind: 'Gardens', costCad: 40000 };
    render(<BriefPanel brief={BRIEF} selected={garden} />);
    expect(screen.getByText('Keep the community garden.')).toBeVisible();
    expect(screen.queryByText('Add shade near the play area.')).toBeNull();
  });

  it('shows the selection even when the project has no brief', () => {
    render(<BriefPanel brief="" selected={bench} />);
    expect(screen.getByText(/Bench/)).toBeVisible();
  });
});

describe('selectedForBrief', () => {
  it('reads the one selected item from the editor state, and nothing for none or many', async () => {
    const { selectedForBrief } = await import('./brief-selection');
    const items = [
      { id: 'b1', catalogId: 'bench', position: { x: 1, y: 1 }, rotationDeg: 0, locked: false },
      { id: 'b2', catalogId: 'bench', position: { x: 4, y: 1 }, rotationDeg: 0, locked: false },
    ];
    const { designDocumentSchema } = await import('@parkshape/core');
    const document = designDocumentSchema.parse({
      version: 1,
      items,
      paths: [],
      areas: [],
      gradeDelta: { cells: [] },
      zones: [],
    });
    const state = (selection: readonly { kind: 'item'; id: string }[]) => ({ document, selection });
    expect(selectedForBrief(state([{ kind: 'item', id: 'b1' }]))).toEqual({
      name: messages.catalog.bench,
      kind: messages.editor.categories.seating,
      costCad: 3500,
    });
    expect(selectedForBrief(state([]))).toBeNull();
    expect(
      selectedForBrief(
        state([
          { kind: 'item', id: 'b1' },
          { kind: 'item', id: 'b2' },
        ]),
      ),
    ).toBeNull();
  });
});
