import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Pulse } from './pulse.js';

describe('Pulse', () => {
  it('does not pulse on the first render', () => {
    render(<Pulse pulseKey={1}>content</Pulse>);
    expect(screen.getByText('content')).not.toHaveClass('ps-motion-pulse');
  });

  it('pulses once when the key changes, then clears on animation end', () => {
    const { rerender } = render(<Pulse pulseKey={1}>content</Pulse>);
    rerender(<Pulse pulseKey={2}>content</Pulse>);
    const wrapper = screen.getByText('content');
    expect(wrapper).toHaveClass('ps-motion-pulse');
    fireEvent.animationEnd(wrapper);
    expect(wrapper).not.toHaveClass('ps-motion-pulse');
  });

  it('stays quiet when the key is unchanged across renders', () => {
    const { rerender } = render(<Pulse pulseKey="a">content</Pulse>);
    rerender(<Pulse pulseKey="a">content</Pulse>);
    expect(screen.getByText('content')).not.toHaveClass('ps-motion-pulse');
  });
});
