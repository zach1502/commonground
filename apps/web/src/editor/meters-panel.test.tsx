import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { defaultParameters } from '@parkshape/core';

import { format } from '../messages';

import {
  documentOf,
  emptyDoc,
  fortyTrees,
  Harness,
  immediateClient,
  makeContext,
  paramsWith,
  parkingLot,
  rect,
  strings,
} from './meters-panel.harness';

describe('MetersPanel landmark', () => {
  it('names the meters as a complementary region "Design targets"', () => {
    render(
      <Harness
        ctx={makeContext(emptyDoc)}
        parameters={defaultParameters()}
        client={immediateClient()}
      />,
    );
    expect(screen.getByRole('complementary', { name: strings.heading })).toBeInTheDocument();
  });
});

describe('MetersPanel live metrics', () => {
  it('turns the canopy meter from fail to ok when 40 trees are placed', () => {
    const ctx = makeContext(emptyDoc);
    render(
      <Harness ctx={ctx} parameters={paramsWith({ canopy: 'hard' })} client={immediateClient()} />,
    );
    expect(screen.getByRole('meter', { name: 'Tree canopy at maturity' })).toHaveClass(
      'ps-meter--fail',
    );
    act(() => {
      ctx.store.getState().replaceDocument(fortyTrees);
    });
    expect(screen.getByRole('meter', { name: 'Tree canopy at maturity' })).toHaveClass(
      'ps-meter--ok',
    );
  });

  it('turns the impervious meter to warn when an asphalt lot is added, or fail when hard', () => {
    const soft = makeContext(emptyDoc);
    render(<Harness ctx={soft} parameters={defaultParameters()} client={immediateClient()} />);
    expect(screen.getByRole('meter', { name: 'Hard surfaces' })).toHaveClass('ps-meter--ok');
    act(() => {
      soft.store.getState().replaceDocument(parkingLot);
    });
    expect(screen.getByRole('meter', { name: 'Hard surfaces' })).toHaveClass('ps-meter--warn');

    const hard = makeContext(parkingLot);
    render(
      <Harness
        ctx={hard}
        parameters={paramsWith({ impervious: 'hard' })}
        client={immediateClient()}
      />,
    );
    const meters = screen.getAllByRole('meter', { name: 'Hard surfaces' });
    expect(meters[meters.length - 1]).toHaveClass('ps-meter--fail');
  });
});

describe('MetersPanel budget', () => {
  it('shows the budget meter at $0 on a blank start, before anything costs money', () => {
    const client = immediateClient();
    const { rerender } = render(
      <Harness ctx={makeContext(emptyDoc)} parameters={defaultParameters()} client={client} />,
    );
    expect(screen.getByRole('meter', { name: strings.labels.budget ?? '' })).toHaveAttribute(
      'aria-valuetext',
      '$0 of $500,000',
    );
    rerender(
      <Harness ctx={makeContext(fortyTrees)} parameters={defaultParameters()} client={client} />,
    );
    expect(screen.getByRole('meter', { name: strings.labels.budget ?? '' })).toBeInTheDocument();
  });

  it('lists the hard garden failure with a Show me that names the constraint', () => {
    const ctx = makeContext(emptyDoc);
    const onShowMe = vi.fn();
    render(
      <Harness
        ctx={ctx}
        parameters={defaultParameters()}
        client={immediateClient()}
        onShowMe={onShowMe}
      />,
    );
    const blocking = screen.getByRole('alert');
    expect(blocking).toHaveTextContent(/garden/i);
    expect(blocking).toHaveTextContent(strings.blocksSubmission);
    fireEvent.click(screen.getByRole('button', { name: 'Show me' }));
    expect(onShowMe).toHaveBeenCalledWith('requiredFeatures');
  });
});

const RECORDED_PLOTS = 56;

describe('MetersPanel live region', () => {
  it('announces a settled meter change once through one polite region', () => {
    vi.useFakeTimers();
    try {
      const ctx = makeContext(emptyDoc);
      render(<Harness ctx={ctx} parameters={defaultParameters()} client={immediateClient()} />);
      const region = screen.getByRole('status');
      expect(region).toHaveAttribute('aria-live', 'polite');
      expect(region).toHaveClass('ps-visually-hidden');
      act(() => {
        ctx.store.getState().replaceDocument(fortyTrees);
      });
      expect(region).toBeEmptyDOMElement();
      act(() => {
        vi.advanceTimersByTime(250);
      });
      expect(region).toHaveTextContent('Tree canopy at maturity');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('MetersPanel garden plots', () => {
  const keptGarden = documentOf({
    areas: [
      {
        id: 'existing-garden',
        catalogId: 'community-garden',
        polygon: rect(2, 2, 26, 11),
        locked: false,
        existing: true,
        recordedPlots: RECORDED_PLOTS,
      },
    ],
  });

  function gardenMeter(): HTMLElement | null {
    const label = screen.queryByText(strings.labels.gardenPlots ?? '', {
      selector: '.web-meter__label',
    });
    return label?.closest('.web-meter') ?? null;
  }

  it('shows the recorded 56 plots for the baseline garden kept as it is', () => {
    render(
      <Harness
        ctx={makeContext(keptGarden)}
        parameters={defaultParameters()}
        client={immediateClient()}
        baseline={keptGarden}
      />,
    );
    expect(gardenMeter()).toHaveTextContent(
      format(strings.gardenPlotsValue, { plots: RECORDED_PLOTS }),
    );
  });

  it('shows no garden meter when the design has no garden', () => {
    render(
      <Harness
        ctx={makeContext(emptyDoc)}
        parameters={defaultParameters()}
        client={immediateClient()}
      />,
    );
    expect(gardenMeter()).toBeNull();
  });
});
