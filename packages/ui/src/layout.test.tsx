import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Badge, type BadgeTone } from './badge.js';
import { InlineAlert, type AlertTone } from './inline-alert.js';
import { Inline, Stack } from './layout.js';
import { PageTitle } from './page-title.js';
import { SkipLink } from './skip-link.js';
import { VisuallyHidden } from './visually-hidden.js';

describe('Badge', () => {
  const tones: readonly BadgeTone[] = ['neutral', 'info', 'success', 'warning', 'danger'];
  it.each(tones)('renders the %s tone', (tone) => {
    render(<Badge tone={tone}>Open</Badge>);
    expect(screen.getByText('Open')).toHaveClass('ps-badge', `ps-badge--${tone}`);
  });

  it('defaults to neutral', () => {
    render(<Badge>Draft</Badge>);
    expect(screen.getByText('Draft')).toHaveClass('ps-badge--neutral');
  });
});

describe('InlineAlert', () => {
  const tones: readonly AlertTone[] = ['info', 'success', 'warning', 'danger'];
  it.each(tones)('renders the %s tone with title and description', (tone) => {
    render(<InlineAlert tone={tone} title="Saved" description="Your design is saved." />);
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByText('Your design is saved.')).toBeInTheDocument();
  });

  it('uses the alert role for danger', () => {
    render(<InlineAlert tone="danger" title="Not saved" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Not saved');
  });
});

describe('PageTitle', () => {
  it('renders an h1 and an optional lede', () => {
    render(<PageTitle lede="Mount Pleasant, Vancouver.">Jonathan Rogers Park</PageTitle>);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Jonathan Rogers Park');
    expect(screen.getByText('Mount Pleasant, Vancouver.')).toHaveClass('ps-page-title__lede');
  });

  it('leaves out the lede when none is given', () => {
    const { container } = render(<PageTitle>Projects</PageTitle>);
    expect(container.querySelector('.ps-page-title__lede')).toBeNull();
  });
});

describe('Stack and Inline', () => {
  it('apply the gap class', () => {
    render(
      <Stack gap="large" as="section" aria-label="Stack">
        <Inline gap="small" aria-label="Inline">
          <span>One</span>
        </Inline>
      </Stack>,
    );
    expect(screen.getByRole('region', { name: 'Stack' })).toHaveClass('ps-stack', 'ps-gap--large');
    expect(screen.getByLabelText('Inline')).toHaveClass('ps-inline', 'ps-gap--small');
  });

  it('default to a medium gap on a div', () => {
    const { container } = render(<Stack>x</Stack>);
    expect(container.firstChild).toHaveClass('ps-gap--medium');
    expect(container.firstElementChild?.tagName).toBe('DIV');
  });
});

describe('SkipLink and VisuallyHidden', () => {
  it('links to the main content', () => {
    render(<SkipLink targetId="main-content">Skip to main content</SkipLink>);
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute(
      'href',
      '#main-content',
    );
  });

  it('hides text visually but keeps it for screen readers', () => {
    render(<VisuallyHidden>Status</VisuallyHidden>);
    expect(screen.getByText('Status')).toHaveClass('ps-visually-hidden');
  });
});
