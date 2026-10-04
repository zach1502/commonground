import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { designDocumentSchema, itemIdSchema, parcelSchema } from '@parkshape/core';

import { messages } from '../../messages';
import { REVIEW_DESIGN, REVIEW_PROJECT } from '../../test/review-fixtures';

import { ElementList } from './element-list';
import { elementEntries, type ElementEntry } from './review-model';

const text = messages.review.list;
const ENTRIES = elementEntries(
  designDocumentSchema.parse(REVIEW_DESIGN.document),
  parcelSchema.parse(REVIEW_PROJECT.parcel),
);

function renderList(entries = ENTRIES) {
  render(
    <ElementList entries={entries} counts={new Map()} selectedId={undefined} onChoose={vi.fn()} />,
  );
  const list = screen.getByRole('navigation', { name: text.heading });
  return { list, filter: within(list).getByRole('group', { name: text.filter }) };
}

const rows = (list: HTMLElement) =>
  within(list)
    .getAllByRole('button', { name: /comments?$/ })
    .map((row) => row.getAttribute('aria-label'));

describe('Elements list category filter', () => {
  it('starts on All with every element and one chip per category', () => {
    const { list, filter } = renderList();
    expect(within(filter).getByRole('button', { name: /^All/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(filter).getAllByRole('button')).toHaveLength(5);
    expect(rows(list)).toHaveLength(4);
  });

  it('shows only the picked category, then every element again on All', async () => {
    const user = userEvent.setup();
    const { list, filter } = renderList();
    await user.click(within(filter).getByRole('button', { name: /^Trees/ }));
    expect(within(filter).getByRole('button', { name: /^Trees/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(rows(list)).toEqual([expect.stringMatching(/^Bigleaf maple, /)]);
    await user.click(within(filter).getByRole('button', { name: /^All/ }));
    expect(rows(list)).toHaveLength(4);
  });

  it('counts each chip from the elements it shows, and All from every element', async () => {
    const user = userEvent.setup();
    const tree = ENTRIES.find((entry) => entry.category === 'tree');
    if (tree === undefined) throw new Error('fixture has no tree');
    const extraTrees = ['tree-extra-1', 'tree-extra-2'].map((elementId): ElementEntry => ({
      ...tree,
      ref: { elementKind: 'item', elementId: itemIdSchema.parse(elementId) },
    }));
    const { list, filter } = renderList([...ENTRIES, ...extraTrees]);
    const chipCount = (name: RegExp) =>
      within(within(filter).getByRole('button', { name })).getByText(/^\d+$/).textContent;
    expect(chipCount(/^All/)).toBe(String(ENTRIES.length + extraTrees.length));
    expect(chipCount(/^Trees/)).toBe('3');
    for (const chip of within(filter).getAllByRole('button')) {
      await user.click(chip);
      expect(String(rows(list).length)).toBe(within(chip).getByText(/^\d+$/).textContent);
    }
  });

  it('leaves the filter out when every element shares one category', () => {
    render(
      <ElementList
        entries={ENTRIES.slice(0, 1)}
        counts={new Map()}
        selectedId={undefined}
        onChoose={vi.fn()}
      />,
    );
    expect(screen.queryByRole('group', { name: text.filter })).toBeNull();
  });
});
