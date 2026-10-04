import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { catalogItems, formatCad } from '@parkshape/core';

import type { Design, Project, User } from '../api/web-api';
import { messages } from '../messages';

import { DesignDetails } from './design-details';

const priced = catalogItems.find((item) => item.unitCost.perItemCad !== undefined);
if (priced === undefined) throw new Error('no priced catalog item for the test');
const pricedId = priced.id;
const unpriced = catalogItems.find(
  (item) => item.category === 'tree' && item.unitCost.perItemCad === undefined,
);

const project = { id: 'jrp', name: 'Jonathan Rogers Park', parcel: {} } as unknown as Project;
const author: User = { id: 'u1', displayName: 'Molly Swingset', role: 'resident' };

function designWith(overrides: Partial<Design> = {}): Design {
  return {
    id: 'd1',
    projectId: 'jrp',
    title: 'Garden corner',
    blurb: '',
    status: 'submitted',
    metrics: null,
    forkedFrom: null,
    versionOf: null,
    thumbnailRef: null,
    thumbnailUrl: null,
    badges: [],
    up: 0,
    down: 0,
    createdAt: '2026-09-25T09:00:00.000Z',
    submittedAt: '2026-09-25T09:05:00.000Z',
    author: { id: author.id, displayName: author.displayName },
    lineage: { forkedFrom: null, versionOf: null, supersededBy: null },
    document: {
      version: 1,
      items: [
        { id: 'i1', catalogId: pricedId, position: { x: 5, y: 5 }, rotationDeg: 0, locked: false },
      ],
      paths: [],
      areas: [],
      gradeDelta: { cells: [] },
      zones: [],
    },
    ...overrides,
  } as unknown as Design;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DesignDetails', () => {
  it('shows the item name and cost when an item is chosen', async () => {
    render(
      <DesignDetails design={designWith()} project={project} user={null} onMakeVersion={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole('button', { name: priced.name }));
    expect(screen.getAllByText(priced.name).length).toBeGreaterThan(1);
    expect(screen.getByText(formatCad(priced.unitCost.perItemCad ?? 0))).toBeInTheDocument();
  });

  it('copies the link when the device has no share sheet', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share: undefined, clipboard: { writeText } });
    render(
      <DesignDetails design={designWith()} project={project} user={null} onMakeVersion={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole('button', { name: messages.designPage.share }));
    await waitFor(() => {
      expect(screen.getByText(messages.designPage.shareCopied)).toBeInTheDocument();
    });
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it('offers a new version to the author of a submitted design', () => {
    const onMakeVersion = vi.fn();
    render(
      <DesignDetails
        design={designWith()}
        project={project}
        user={author}
        onMakeVersion={onMakeVersion}
      />,
    );
    expect(screen.getByRole('button', { name: messages.designPage.makeVersion })).toHaveAttribute(
      'data-variant',
      'secondary',
    );
  });
});

describe('DesignDetails order', () => {
  it('leads with the author and the vote count, then the vote buttons', () => {
    render(
      <DesignDetails
        design={designWith({ up: 3, down: 1 })}
        project={project}
        user={null}
        onMakeVersion={vi.fn()}
        vote={<button type="button">Vote slot</button>}
      />,
    );
    const byline = screen.getByText('By Molly Swingset. 3 up, 1 down.');
    const vote = screen.getByRole('button', { name: 'Vote slot' });
    const share = screen.getByRole('button', { name: messages.designPage.share });
    expect(byline.compareDocumentPosition(vote) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(vote.compareDocumentPosition(share) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('hides the author actions from other visitors', () => {
    render(
      <DesignDetails design={designWith()} project={project} user={null} onMakeVersion={vi.fn()} />,
    );
    expect(
      screen.queryByRole('button', { name: messages.designPage.makeVersion }),
    ).not.toBeInTheDocument();
  });
});

describe('DesignDetails for authors and areas', () => {
  it('offers Edit to the author of a draft and nothing once it is superseded', () => {
    const { rerender } = render(
      <DesignDetails
        design={designWith({ status: 'draft' })}
        project={project}
        user={author}
        onMakeVersion={vi.fn()}
      />,
    );
    expect(screen.getByRole('link', { name: messages.designPage.edit })).toBeInTheDocument();
    rerender(
      <DesignDetails
        design={designWith({ status: 'superseded' })}
        project={project}
        user={author}
        onMakeVersion={vi.fn()}
      />,
    );
    expect(screen.queryByRole('link', { name: messages.designPage.edit })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: messages.designPage.makeVersion }),
    ).not.toBeInTheDocument();
  });

  it('counts areas in the legend and shows the hint for an item with no unit price', async () => {
    const itemId = unpriced?.id ?? 'no-such-item';
    const polygon = [
      { x: 1, y: 1 },
      { x: 5, y: 1 },
      { x: 5, y: 5 },
    ];
    const design = designWith({
      document: {
        version: 1,
        items: [
          { id: 'i1', catalogId: itemId, position: { x: 5, y: 5 }, rotationDeg: 0, locked: false },
        ],
        paths: [],
        areas: [{ id: 'a1', catalogId: 'community-garden', polygon, locked: false }],
        gradeDelta: { cells: [] },
        zones: [],
      },
    } as unknown as Partial<Design>);
    render(<DesignDetails design={design} project={project} user={null} onMakeVersion={vi.fn()} />);
    expect(screen.getByText(/ and 1 garden\.$/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: unpriced?.name ?? itemId }));
    expect(screen.getByText(messages.designPage.noPrice)).toBeInTheDocument();
    expect(screen.getAllByText(messages.designPage.inspectHint)).toHaveLength(1);
  });
});

describe('DesignDetails item groups', () => {
  it('lists repeated items once with a count and keeps a single hint', async () => {
    const tree = { position: { x: 5, y: 5 }, rotationDeg: 0, locked: false, catalogId: pricedId };
    const design = designWith({
      document: {
        version: 1,
        items: [
          { ...tree, id: 't1' },
          { ...tree, id: 't2' },
          { ...tree, id: 't3' },
        ],
        paths: [],
        areas: [],
        gradeDelta: { cells: [] },
        zones: [],
      },
    } as unknown as Partial<Design>);
    render(<DesignDetails design={design} project={project} user={null} onMakeVersion={vi.fn()} />);
    const list = screen.getByRole('list', { name: messages.designPage.inspectHint });
    expect(list).toHaveClass('web-design__items--rows');
    const group = within(list).getByRole('button', { name: `${priced.name} x3` });
    expect(screen.queryByRole('button', { name: priced.name })).not.toBeInTheDocument();
    expect(screen.getAllByText(messages.designPage.inspectHint)).toHaveLength(1);
    await userEvent.click(group);
    expect(
      screen.getByText(`${formatCad(priced.unitCost.perItemCad ?? 0)} each`),
    ).toBeInTheDocument();
  });
});

describe('DesignDetails legend and links', () => {
  it('writes legend counts as plural category names', () => {
    const tree = {
      position: { x: 5, y: 5 },
      rotationDeg: 0,
      locked: false,
      catalogId: 'red-alder',
    };
    const design = designWith({
      document: {
        version: 1,
        items: [
          { ...tree, id: 't1' },
          { ...tree, id: 't2' },
          { ...tree, id: 'b1', catalogId: 'bench' },
        ],
        paths: [],
        areas: [],
        gradeDelta: { cells: [] },
        zones: [],
      },
    } as unknown as Partial<Design>);
    const { container } = render(
      <DesignDetails design={design} project={project} user={null} onMakeVersion={vi.fn()} />,
    );
    expect(screen.getByText('2 trees and 1 seat.')).toBeInTheDocument();
    expect(container.querySelector('.web-design__legend .ps-badge')).toBeNull();
  });

  it('follows the counts with the total cost from the metrics', () => {
    const metrics = { totals: { costCad: 146608, canopyPercent: 8.5, gardenPlots: 0 } };
    render(
      <DesignDetails
        design={designWith({ metrics } as unknown as Partial<Design>)}
        project={project}
        user={null}
        onMakeVersion={vi.fn()}
      />,
    );
    const legend = screen.getByRole('heading', { name: messages.designPage.legendHeading });
    const section = legend.parentElement ?? document.body;
    expect(within(section).getByText('The design costs $146,608.')).toBeInTheDocument();
  });

  it('links back to all designs', () => {
    render(
      <DesignDetails design={designWith()} project={project} user={null} onMakeVersion={vi.fn()} />,
    );
    const link = screen.getByRole('link', { name: messages.designPage.backToGallery });
    expect(link).toHaveAttribute('href', '/projects/jrp/designs');
    expect(link).not.toHaveAttribute('data-variant');
  });
});

describe('DesignDetails after a submit', () => {
  it('confirms the submit when the author arrives from the editor', () => {
    render(
      <DesignDetails
        design={designWith()}
        project={project}
        user={author}
        onMakeVersion={vi.fn()}
        arrival="submitted"
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(messages.designPage.submitted);
  });

  it('shows no submit confirmation on a plain visit', () => {
    render(
      <DesignDetails
        design={designWith()}
        project={project}
        user={author}
        onMakeVersion={vi.fn()}
      />,
    );
    expect(screen.queryByText(messages.designPage.submitted)).not.toBeInTheDocument();
  });
});
