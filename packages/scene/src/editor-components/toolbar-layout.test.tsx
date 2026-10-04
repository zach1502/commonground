// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TEST_STRINGS } from './test-strings.js';
import { ToolBar } from './ToolBar.js';

afterEach(cleanup);

function renderBar(tool: 'select' | 'terraform') {
  render(
    <ToolBar
      strings={TEST_STRINGS}
      tool={tool}
      snap="on"
      itemsList="hidden"
      showTerraform="yes"
      onTool={vi.fn()}
      onSnap={vi.fn()}
      onItemsList={vi.fn()}
      onShortcuts={vi.fn()}
    />,
  );
  return ['Select', 'Path', 'Area', 'Terraform'].map((name) =>
    screen.getByRole('button', { name }),
  );
}

describe('ToolBar layout', () => {
  it('keeps the four tools together in one joined group', () => {
    const tools = renderBar('terraform');
    const row = tools[0]?.parentElement;
    expect(tools.every((tool) => tool.parentElement === row)).toBe(true);
    expect(row?.style.display).toBe('inline-flex');
    expect(row?.parentElement?.getAttribute('role')).toBe('toolbar');
  });

  it('joins the tools with no gap, so a bold pressed label still fits the row', () => {
    const tools = renderBar('terraform');
    expect(tools[0]?.parentElement?.style.gap).toBe('');
    tools.slice(1).forEach((tool) => {
      expect(tool.style.marginInlineStart).toBe('calc(-1 * var(--layout-border-width-small))');
    });
    expect(tools[0]?.style.borderStartEndRadius).toBe('0');
    expect(tools[3]?.style.borderStartStartRadius).toBe('0');
  });

  it('draws the pressed tool above its neighbours, so its 2 px edge shows on every side', () => {
    const tools = renderBar('terraform');
    expect(tools[3]?.style.zIndex).toBe('1');
    expect(tools[0]?.style.zIndex).toBe('');
  });
});
