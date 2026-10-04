// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CommentChip } from './CommentChip.js';

afterEach(cleanup);

describe('CommentChip', () => {
  it('shows the count and names it with the element', () => {
    render(<CommentChip count={3} label="3 comments on Bench" motion="reduced" />);
    const chip = screen.getByRole('img', { name: '3 comments on Bench' });
    expect(chip.textContent).toBe('3');
  });

  it('fades in over 150 ms when motion is on', () => {
    const animate = vi.fn().mockReturnValue({ finished: Promise.resolve() });
    Element.prototype.animate = animate;
    render(<CommentChip count={1} label="1 comment on Bench" motion="full" />);
    expect(animate).toHaveBeenCalledWith(
      [{ opacity: 0 }, { opacity: 1 }],
      expect.objectContaining({ duration: 150 }),
    );
    delete (Element.prototype as Partial<Element>).animate;
  });

  it('appears at once under reduced motion', () => {
    const animate = vi.fn();
    Element.prototype.animate = animate;
    render(<CommentChip count={1} label="1 comment on Bench" motion="reduced" />);
    expect(animate).not.toHaveBeenCalled();
    delete (Element.prototype as Partial<Element>).animate;
  });
});
