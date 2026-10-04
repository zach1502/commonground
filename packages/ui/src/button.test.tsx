import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { BcServicesCardButton } from './bc-services-card-button.js';
import { ButtonLink } from './button-link.js';
import { Button, type ButtonVariant } from './button.js';
import { MOTION_CLASS } from './motion/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const VARIANTS: readonly ButtonVariant[] = ['primary', 'secondary', 'tertiary', 'danger'];

describe('Button', () => {
  it.each(VARIANTS)('renders the %s variant', (variant) => {
    render(<Button variant={variant}>Submit design</Button>);
    const button = screen.getByRole('button', { name: 'Submit design' });
    expect(button).toHaveAttribute('data-variant', variant);
  });

  it('marks the danger variant with the BC danger style', () => {
    render(<Button variant="danger">Delete design</Button>);
    expect(screen.getByRole('button')).toHaveClass('danger');
  });

  it('calls onPress when pressed', async () => {
    const onPress = vi.fn();
    render(<Button onPress={onPress}>Add corner</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledOnce();
  });

  it('does not call onPress when disabled', async () => {
    const onPress = vi.fn();
    render(
      <Button onPress={onPress} isDisabled>
        Add corner
      </Button>,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('uses the BC button class names for its size and variant', () => {
    render(
      <Button variant="secondary" size="small">
        Undo
      </Button>,
    );
    expect(screen.getByRole('button')).toHaveClass('bcds-react-aria-Button', 'small', 'secondary');
  });

  it('renders the large 44 px touch variant', () => {
    render(<Button size="large">View in 3D</Button>);
    expect(screen.getByRole('button')).toHaveClass('bcds-react-aria-Button', 'large');
  });

  it('passes aria-expanded and aria-controls through', () => {
    render(
      <Button aria-expanded="false" aria-controls="menu">
        Menu
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls', 'menu');
  });
});

describe('Button while pending', () => {
  it('keeps a pending button focusable but ignores presses', async () => {
    const onPress = vi.fn();
    render(
      <Button onPress={onPress} isPending>
        Submit design
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
    await userEvent.click(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('ButtonLink', () => {
  it('renders a link styled as a button', () => {
    render(
      <ButtonLink href="/projects" variant="secondary">
        Vote on designs
      </ButtonLink>,
    );
    const link = screen.getByRole('link', { name: 'Vote on designs' });
    expect(link).toHaveAttribute('href', '/projects');
    expect(link).toHaveAttribute('data-variant', 'secondary');
  });

  it('defaults to the primary variant', () => {
    render(<ButtonLink href="/">Design a park</ButtonLink>);
    expect(screen.getByRole('link')).toHaveAttribute('data-variant', 'primary');
  });
});

describe('BcServicesCardButton', () => {
  it('shows the label on a primary button', () => {
    render(<BcServicesCardButton label="Log in with BC Services Card" demoTag="Demo" />);
    const button = screen.getByRole('button', { name: 'Log in with BC Services Card' });
    expect(button).toHaveAttribute('data-variant', 'primary');
  });

  it('puts a Demo tag beside the button and links it as the description', () => {
    render(<BcServicesCardButton label="Log in with BC Services Card" demoTag="Demo" />);
    const tag = screen.getByText('Demo');
    expect(tag).toHaveClass('ps-badge', 'ps-badge--info');
    expect(screen.getByRole('button')).toHaveAccessibleDescription('Demo');
  });

  it('calls onPress', async () => {
    const onPress = vi.fn();
    render(<BcServicesCardButton label="Log in" demoTag="Demo" onPress={onPress} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledOnce();
  });
});

describe('Button press feedback (J1)', () => {
  const pressCss = readFileSync(path.join(HERE, 'motion/press.css'), 'utf8');

  it('carries the press class, so the colour changes in the first frame', () => {
    render(<Button>Vote up</Button>);
    expect(screen.getByRole('button')).toHaveClass(MOTION_CLASS.press);
  });

  it('has a 0s transition at rest, on hover and while pressed', () => {
    const style = document.createElement('style');
    style.textContent = pressCss;
    document.head.append(style);
    render(<Button>Vote up</Button>);
    expect(getComputedStyle(screen.getByRole('button')).transitionDuration).toBe('0s');
    style.remove();
    const hoverAndActive = pressCss.match(/:(?:hover|active)[^{]*\{[^}]*\}/g) ?? [];
    expect(hoverAndActive.length).toBeGreaterThan(0);
    expect(hoverAndActive.join('\n')).not.toMatch(/transition|animation/);
  });

  it('holds the pressed colour on a held button', () => {
    render(<Button held="held">Vote up</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('data-held', 'true');
    expect(pressCss).toMatch(
      /\.primary\[data-held='true'\][^{]*\{\s*background-color: var\(--surface-color-primary-pressed\)/,
    );
  });
});

describe('Focus ring (J2)', () => {
  it('never transitions the outline or the halo, so the ring shows in the first frame', () => {
    const sheets = ['base.css', 'bc-controls.css', 'components.css', 'motion/press.css'];
    const text = sheets.map((name) => readFileSync(path.join(HERE, name), 'utf8')).join('\n');
    const motionRules = text.match(/transition[^;]*;/g) ?? [];
    expect(motionRules.join('\n')).not.toMatch(/outline|box-shadow|\ball\b/);
  });
});
