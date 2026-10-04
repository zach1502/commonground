import { render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { designDocumentSchema, parcelSchema, type Zone } from '@parkshape/core';

import { messages } from '../messages';
import { createTestDeps, projectFixture } from '../test/api-server';

import { BaselineEditor } from './baseline-editor';

// R3F does not load in jsdom. The stub stands in for EditorCanvas's SceneGate with the
// render-tier probe fixed at 'missing'; the real gate is tested in packages/scene.
const probe = vi.hoisted(() => ({ caveat: 'missing' }));

// Like the real ParkEditor, the stub puts the app's details slot in the right-hand panel.
vi.mock('@parkshape/scene', () => {
  interface StubEditorProps {
    readonly webGlMissing?: ReactNode;
    readonly details?: ReactNode;
  }
  const ParkEditor = ({ webGlMissing, details }: StubEditorProps) => (
    <>
      {probe.caveat === 'missing' ? <div data-webgl="missing">{webGlMissing}</div> : <canvas />}
      <aside aria-label="Properties">{details}</aside>
    </>
  );
  return { ParkEditor };
});

const BARE = designDocumentSchema.parse({
  version: 1,
  items: [],
  paths: [],
  areas: [],
  gradeDelta: { cells: [] },
  zones: [],
});
const NO_ZONES: readonly Zone[] = [];

async function renderEditor() {
  const project = await projectFixture();
  const onContext = vi.fn();
  render(
    <BaselineEditor
      editor={createTestDeps().editor}
      userId="persona-paula-blueprint"
      document={BARE}
      parcel={parcelSchema.parse(project.parcel)}
      zones={NO_ZONES}
      onContext={onContext}
    />,
  );
  return { onContext };
}

describe('BaselineEditor without WebGL2', () => {
  it('shows the WebGL2 message in place of the 3D editor', async () => {
    await renderEditor();
    expect(await screen.findByText(messages.editor.viewer.webGlMissing)).toBeVisible();
    expect(document.querySelector('canvas')).toBeNull();
  });

  it('tells the planner they can continue to publish without refining in 3D', async () => {
    const { onContext } = await renderEditor();
    expect(await screen.findByText(messages.planner.refine.webGlSkip)).toBeVisible();
    // Continue reads the baseline from this context, so publishing still works.
    await waitFor(() => {
      expect(onContext.mock.calls.some(([ctx]) => ctx !== null)).toBe(true);
    });
  });
});

describe('BaselineEditor staff tools', () => {
  it('puts the zone tools and the zone count in the right-hand panel, empty until a selection', async () => {
    await renderEditor();
    const panel = await screen.findByRole('complementary', { name: 'Properties' });
    const tools = within(panel).getByRole('region', { name: messages.planner.refine.staffTools });
    expect(
      within(tools).getByRole('button', { name: messages.planner.refine.forbidden }),
    ).toBeVisible();
    expect(
      within(tools).getByRole('button', { name: messages.planner.refine.noGrade }),
    ).toBeVisible();
    expect(within(tools).queryByRole('switch')).toBeNull();
    expect(within(tools).getByRole('status')).toHaveTextContent('0');
  });
});
