import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SKELETON_DELAY_MS } from '@parkshape/ui';

import { messages } from '../messages';
import { RouteSkeleton } from '../shell/route-skeleton';

import { bootShellMarkup, injectBootShell } from './boot-shell';

const HTML = '<body>\n    <div id="root"></div>\n  </body>';

function skeletonOnly(markup: string): string {
  return markup.replace(/<script>[\s\S]*<\/script>/, '');
}

describe('bootShellMarkup', () => {
  it('is the page skeleton the app draws, so the swap to React changes nothing', () => {
    vi.useFakeTimers();
    const { container } = render(<RouteSkeleton kind="page" />);
    act(() => {
      vi.advanceTimersByTime(SKELETON_DELAY_MS);
    });
    vi.useRealTimers();
    const shell = document.createElement('div');
    shell.innerHTML = skeletonOnly(bootShellMarkup(messages.app.loading));
    expect(shell.innerHTML).toBe(container.innerHTML);
  });

  it('names the wait for screen readers and marks the page busy', () => {
    const markup = bootShellMarkup(messages.app.loading);
    expect(markup).toContain(messages.app.loading);
    expect(markup).toContain('aria-busy="true"');
  });

  it('escapes the label', () => {
    expect(bootShellMarkup('<b>&')).toContain('&lt;b&gt;&amp;');
  });

  it('holds the blocks back until 1 s after navigation, as the app skeleton does', () => {
    expect(bootShellMarkup(messages.app.loading)).toContain(String(SKELETON_DELAY_MS));
  });
});

describe('injectBootShell', () => {
  it('writes the shell inside the root element', () => {
    expect(injectBootShell(HTML, '<p>shell</p>')).toContain('<div id="root"><p>shell</p></div>');
  });

  it('throws when index.html has no empty root element', () => {
    expect(() => injectBootShell('<body></body>', '<p>shell</p>')).toThrow(/root/);
  });
});
