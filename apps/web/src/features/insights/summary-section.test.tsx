import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { messages } from '../../messages';

import { SummarySection } from './summary-section';

const text = messages.insights.summary;
const SUMMARY = {
  themes: [{ label: 'Keep and add trees', designCount: 4, exampleDesignId: 'd1' }],
  tradeoffs: [],
  source: 'rule-based' as const,
  designsRead: 10,
};

describe('SummarySection comment line', () => {
  it('shows the comment line inside the generated quote', () => {
    render(
      <SummarySection
        summary={{ ...SUMMARY, commentLine: '6 comments on elements, most on Bench' }}
      />,
    );
    const section = screen.getByRole('region', { name: text.heading });
    const quote = within(section).getByText('6 comments on elements, most on Bench');
    expect(quote.closest('blockquote')).not.toBeNull();
    expect(quote).toHaveAttribute('data-kind', 'data');
  });

  it('shows no comment line while the summary has none', () => {
    const { container } = render(<SummarySection summary={SUMMARY} />);
    expect(container.querySelector('.web-insights__comment-line')).toBeNull();
  });
});

describe('SummarySection source note', () => {
  it('names the model when a model wrote the summary', () => {
    render(
      <SummarySection summary={{ ...SUMMARY, source: 'model', model: 'gemini-3.1-flash-lite' }} />,
    );
    expect(screen.getByText('Written by gemini-3.1-flash-lite from item counts.')).toBeVisible();
    expect(screen.queryByText(text.ruleBased)).toBeNull();
  });

  it('says fixed rules wrote it when the rules did, even with a model set up', () => {
    render(<SummarySection summary={SUMMARY} />);
    expect(screen.getByText(text.ruleBased)).toBeVisible();
    expect(screen.queryByText(/gemini/)).toBeNull();
  });

  it('still credits a model when the API gives no model name', () => {
    render(<SummarySection summary={{ ...SUMMARY, source: 'model' }} />);
    expect(screen.getByText(text.unnamedModel)).toBeVisible();
  });
});
