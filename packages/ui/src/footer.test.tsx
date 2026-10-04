import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Footer } from './footer.js';

const ATTRIBUTION = 'Site data from Vancouver Open Data.';
const SOURCES = 'Data and model sources';

function renderFooter() {
  render(<Footer sourcesLabel={SOURCES}>{ATTRIBUTION}</Footer>);
}

describe('Footer', () => {
  it('is one contentinfo region whose only text is the sources disclosure', () => {
    renderFooter();
    expect(screen.getAllByRole('contentinfo')).toHaveLength(1);
    const footer = screen.getByRole('contentinfo');
    expect(footer.querySelectorAll('p')).toHaveLength(0);
    expect(footer).toHaveTextContent(`${SOURCES}${ATTRIBUTION}`);
  });

  it('carries no link groups and no copyright line', () => {
    renderFooter();
    const footer = screen.getByRole('contentinfo');
    expect(screen.queryAllByRole('navigation')).toHaveLength(0);
    expect(footer.querySelectorAll('a')).toHaveLength(0);
    expect(footer).not.toHaveTextContent('©');
  });

  it('names data sources only, with no government operator or government links', () => {
    renderFooter();
    const footer = screen.getByRole('contentinfo');
    expect(footer).not.toHaveTextContent(/British Columbia|Government of|B\.C\./i);
    expect(footer.innerHTML).not.toMatch(/gov\.bc\.ca/);
  });

  it('folds the full attribution under a closed native disclosure that keeps it in the DOM', async () => {
    renderFooter();
    const details = screen.getByRole('contentinfo').querySelector('details');
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute('open');
    expect(details?.querySelector('summary')).toHaveTextContent(SOURCES);
    expect(details).toHaveTextContent(ATTRIBUTION);
    await userEvent.click(screen.getByText(SOURCES));
    expect(details).toHaveAttribute('open');
  });
});
