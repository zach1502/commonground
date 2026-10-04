import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Project } from '../../api/web-api';
import { messages } from '../../messages';

import { VoteModel } from './vote-model';

describe('VoteModel', () => {
  it('says the 3D view is loading until the full design arrives', () => {
    render(
      <VoteModel
        shown={null}
        project={{ id: 'jrp' } as unknown as Project}
        api={{ getTerrain: vi.fn(), getContext: vi.fn() }}
      />,
    );
    expect(screen.getByText(messages.vote.loading)).toBeInTheDocument();
  });
});
