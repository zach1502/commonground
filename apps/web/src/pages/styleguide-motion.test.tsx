import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { format, messages } from '../messages';

import { MotionSection } from './styleguide-motion';

const { motion } = messages.styleguide;

describe('styleguide motion section', () => {
  it('mounts no demo until the disclosure opens', () => {
    render(<MotionSection />);
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull();
  });

  it('shows each web effect with a button that starts it', () => {
    const { container } = render(<MotionSection />);
    const details = container.querySelector('details');
    if (details === null) throw new Error('no disclosure');
    details.open = true;
    fireEvent(details, new Event('toggle'));
    const titles = [
      motion.press,
      motion.dialog,
      motion.list,
      motion.reorder,
      motion.meter,
      motion.skeleton,
      motion.card,
      motion.vote,
      motion.submit,
    ];
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(titles);
    for (const heading of screen.getAllByRole('heading', { level: 3 })) {
      const demo = heading.parentElement;
      if (demo === null) throw new Error('demo has no frame');
      expect(within(demo).getAllByRole('button').length).toBeGreaterThan(0);
    }
  });

  it('runs every trigger without an error', async () => {
    const { container } = render(<MotionSection />);
    const details = container.querySelector('details');
    if (details === null) throw new Error('no disclosure');
    details.open = true;
    fireEvent(details, new Event('toggle'));
    for (const name of [motion.listAgain, motion.reorderMove, motion.meterChange]) {
      await userEvent.click(screen.getByRole('button', { name }));
    }
    await userEvent.click(screen.getByRole('button', { name: motion.skeletonAgain }));
    await userEvent.click(screen.getByRole('button', { name: motion.submitStart }));
    const [cardUp, voteUp] = screen.getAllByRole('button', { name: messages.vote.up });
    if (cardUp === undefined || voteUp === undefined) throw new Error('no vote buttons');
    await userEvent.click(cardUp);
    expect(screen.getByText(format(motion.cardTitle, { number: 2 }))).toBeInTheDocument();
    await userEvent.click(voteUp);
    expect(voteUp).toHaveAttribute('data-held', 'true');
    await userEvent.click(screen.getByRole('button', { name: motion.dialogOpen }));
    await userEvent.click(screen.getByRole('button', { name: motion.dialogClose }));
    expect(await screen.findByRole('button', { name: motion.dialogOpen })).toBeInTheDocument();
  });
});
