import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OG_IMAGE_PATH, useDocumentMeta } from './use-document-meta';

function Page({ title, description }: { title: string; description: string }) {
  useDocumentMeta({ title, description });
  return null;
}

const content = (selector: string) =>
  document.head.querySelector(selector)?.getAttribute('content');

describe('useDocumentMeta', () => {
  it('writes the title, description and Open Graph tags', () => {
    render(<Page title="Projects | CommonGround" description="Parks open for design." />);
    expect(document.title).toBe('Projects | CommonGround');
    expect(content('meta[name="description"]')).toBe('Parks open for design.');
    expect(content('meta[property="og:title"]')).toBe('Projects | CommonGround');
    expect(content('meta[property="og:description"]')).toBe('Parks open for design.');
    expect(content('meta[property="og:image"]')).toBe(`${window.location.origin}${OG_IMAGE_PATH}`);
  });

  it('updates existing tags instead of adding new ones', () => {
    const { rerender } = render(<Page title="A" description="First." />);
    rerender(<Page title="B" description="Second." />);
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    expect(content('meta[name="description"]')).toBe('Second.');
  });
});
