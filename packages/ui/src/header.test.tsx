import { readFileSync } from 'node:fs';

import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ButtonLink } from './button-link.js';
import { Header } from './header.js';
import { NavigationProvider } from './navigation.js';
import { SiteNav, type SiteNavAccount } from './site-nav.js';

describe('Header', () => {
  it('shows the title and a skip link', () => {
    render(
      <Header title="CommonGround" skipLinkLabel="Skip to main content" mainId="main-content" />,
    );
    expect(screen.getByRole('banner')).toHaveTextContent('CommonGround');
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute(
      'href',
      '#main-content',
    );
  });

  it('shows the product name as a text wordmark inside the given home link', () => {
    render(
      <Header
        title="CommonGround"
        skipLinkLabel="Skip to main content"
        mainId="main-content"
        homeLinkElement={<a href="/" />}
      />,
    );
    const home = screen.getByRole('link', { name: 'CommonGround' });
    expect(home).toHaveAttribute('href', '/');
    expect(home).toHaveClass('bcds-header--title');
  });

  it('shows the wordmark as plain text when no home link is given', () => {
    render(<Header title="CommonGround" skipLinkLabel="Skip" mainId="main" />);
    expect(screen.getByText('CommonGround')).toHaveClass('bcds-header--title');
    expect(screen.queryByRole('link', { name: 'CommonGround' })).toBeNull();
  });

  it('draws no logo artwork and names no government', () => {
    render(
      <Header
        title="CommonGround"
        skipLinkLabel="Skip"
        mainId="main"
        statusLabel="DEMO"
        homeLinkElement={<a href="/" />}
      />,
    );
    const banner = screen.getByRole('banner');
    expect(banner.querySelector('svg')).toBeNull();
    expect(banner.querySelector('.bcds-header--line')).toBeNull();
    expect(banner).not.toHaveTextContent(/British Columbia|Government of|B\.C\./i);
  });
});

const SHELL_CSS = readFileSync(`${import.meta.dirname}/bc-shell.css`, 'utf8');
const NAV_CSS = readFileSync(`${import.meta.dirname}/nav.css`, 'utf8');

function ruleBody(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  return start < 0 ? '' : css.slice(start, css.indexOf('}', start));
}

describe('Header wordmark style', () => {
  it('sets the wordmark in the heading 4 type token and primary text, with no underline', () => {
    const rule = ruleBody(
      SHELL_CSS,
      '.bcds-header > .bcds-header--container > .bcds-header--title',
    );
    expect(rule).toContain('font: var(--typography-bold-h4)');
    expect(rule).toContain('color: var(--typography-color-primary)');
    expect(rule).toContain('text-decoration: none');
  });

  it('keeps no logo or logo colour rules in the shell styles', () => {
    expect(SHELL_CSS).not.toMatch(/bc-logo|bcgov-logo|header--line/);
    expect(NAV_CSS).not.toMatch(/bc-logo|bcgov-logo|header--line/);
  });
});

describe('Header demo word style', () => {
  it('sets DEMO bold one step above body, in the secondary text colour', () => {
    const rule = ruleBody(SHELL_CSS, '.bcds-header--status');
    expect(rule).toContain('font: var(--typography-bold-large-body)');
    expect(rule).toContain('color: var(--typography-color-secondary)');
    expect(rule).not.toContain('background');
  });

  it('never folds DEMO to an ellipsis or hides it on a phone', () => {
    const phoneRules = NAV_CSS.slice(NAV_CSS.indexOf('@media (max-width: 767px)'));
    const status = ruleBody(phoneRules, '.bcds-header--container > .bcds-header--status');
    expect(status).toContain('grid-row: 2');
    expect(status).not.toContain('text-overflow');
    expect(status).not.toContain('display: none');
  });
});

describe('Header trust and focus order', () => {
  it('puts the skip link before the wordmark, so it is the first focusable element', () => {
    render(
      <Header
        title="CommonGround"
        skipLinkLabel="Skip to main content"
        mainId="main-content"
        homeLinkElement={<a href="/" />}
      />,
    );
    const skip = screen.getByRole('link', { name: 'Skip to main content' });
    const home = screen.getByRole('link', { name: 'CommonGround' });
    expect(skip.compareDocumentPosition(home) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows the demo status as one short word beside the title, after it in reading order', () => {
    render(<Header title="CommonGround" skipLinkLabel="Skip" mainId="main" statusLabel="DEMO" />);
    const status = screen.getByText('DEMO');
    const title = screen.getByText('CommonGround');
    expect(status).toHaveClass('bcds-header--status');
    expect(title.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

const PROJECTS = (
  <a key="p" href="/projects">
    Projects
  </a>
);

function renderNav(account?: SiteNavAccount) {
  render(<SiteNav label="Main" menuLabel="Menu" items={[PROJECTS]} account={account} />);
}

describe('SiteNav', () => {
  it('lists the items in a labelled navigation landmark', () => {
    renderNav();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Projects' })).toBeInTheDocument();
  });
});

describe('SiteNav account', () => {
  it('shows a guest only the items, with no name and no log out', () => {
    renderNav();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getAllByRole('listitem')).toHaveLength(1);
    expect(within(nav).queryByRole('button', { name: 'Log out' })).toBeNull();
  });

  it('shows the signed-in name as plain text, then log out in the nav link style', async () => {
    const onLogout = vi.fn();
    renderNav({ name: 'Molly Swingset', logoutLabel: 'Log out', onLogout });
    const nav = screen.getByRole('navigation', { name: 'Main' });
    const name = within(nav).getByText('Molly Swingset');
    const logout = within(nav).getByRole('button', { name: 'Log out' });
    expect(name.tagName).toBe('SPAN');
    expect(name.compareDocumentPosition(logout) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The nav link class, not the BC small tertiary button, so it matches "Projects".
    expect(logout).toHaveClass('ps-nav__link');
    expect(logout).not.toHaveClass('bcds-react-aria-Button');
    await userEvent.click(logout);
    expect(onLogout).toHaveBeenCalledOnce();
  });
});

describe('SiteNav menu', () => {
  it('toggles the collapsed menu', async () => {
    renderNav();
    const toggle = screen.getByRole('button', { name: 'Menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('navigation')).toHaveAttribute('data-open', 'true');
    await userEvent.click(screen.getByRole('link', { name: 'Projects' }));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes on Esc and returns focus to the menu button', async () => {
    renderNav();
    const toggle = screen.getByRole('button', { name: 'Menu' });
    await userEvent.click(toggle);
    await userEvent.tab();
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
  });
});

describe('NavigationProvider', () => {
  it('routes plain clicks on button links through navigate', async () => {
    const navigate = vi.fn();
    render(
      <NavigationProvider navigate={navigate}>
        <ButtonLink href="/projects">Design a park</ButtonLink>
      </NavigationProvider>,
    );
    await userEvent.click(screen.getByRole('link'));
    expect(navigate).toHaveBeenCalledWith('/projects');
  });

  it('leaves modified clicks to the browser', () => {
    const navigate = vi.fn();
    render(
      <NavigationProvider navigate={navigate}>
        <ButtonLink href="/projects">Design a park</ButtonLink>
      </NavigationProvider>,
    );
    fireEvent.click(screen.getByRole('link'), { ctrlKey: true });
    expect(navigate).not.toHaveBeenCalled();
  });
});
