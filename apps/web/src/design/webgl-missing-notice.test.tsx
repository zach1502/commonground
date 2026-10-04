import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { messages } from '../messages';

import { WebGlMissingNotice } from './webgl-missing-notice';

const text = messages.editor.viewer;

function renderNotice() {
  render(
    <MemoryRouter>
      <WebGlMissingNotice projectId="jonathan rogers" />
    </MemoryRouter>,
  );
}

describe('WebGlMissingNotice', () => {
  it('says the 3D view cannot show and that the pictures still work', () => {
    renderNotice();
    expect(screen.getByText(text.webGlMissing)).toBeInTheDocument();
    expect(text.webGlMissing).not.toContain('WebGL2');
    expect(text.webGlMissing).toContain('pictures');
  });

  it('links to the Designs page of the project, where each design is a picture', () => {
    renderNotice();
    const link = screen.getByRole('link', { name: text.webGlGalleryLink });
    expect(link).toHaveAttribute('href', '/projects/jonathan%20rogers/designs');
  });

  it('shows the message with no link before a project is published', () => {
    render(<WebGlMissingNotice />);
    expect(screen.getByText(text.webGlMissing)).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
