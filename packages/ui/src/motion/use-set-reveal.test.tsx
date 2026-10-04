import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSetReveal } from './use-set-reveal.js';

let targets: Element[] = [];

beforeEach(() => {
  targets = [];
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  Element.prototype.animate = function animate(this: Element) {
    targets.push(this);
    return { finished: Promise.resolve(), cancel: vi.fn() } as unknown as Animation;
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (Element.prototype as Partial<Element>).animate;
});

function List({ ids }: { readonly ids: readonly string[] }) {
  const ref = useSetReveal<HTMLUListElement>(ids.join(' '));
  return (
    <ul ref={ref}>
      {ids.map((id) => (
        <li key={id}>{id}</li>
      ))}
    </ul>
  );
}

describe('useSetReveal', () => {
  it('reveals the container on mount and again only when the set changes', () => {
    const { container, rerender } = render(<List ids={['a', 'b']} />);
    const list = container.querySelector('ul');
    expect(targets).toEqual([list]);
    rerender(<List ids={['a', 'b']} />);
    expect(targets).toHaveLength(1);
    rerender(<List ids={['b', 'c']} />);
    expect(targets).toEqual([list, list]);
  });
});
