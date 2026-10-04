import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FakeClock, designDocumentSchema, type DesignDocument } from '@parkshape/core';
import type { ParkEditorProps } from '@parkshape/scene';

import type { Design } from './api/web-api';
import { localDraftKey, readLocalDraft } from './editor/local-draft';
import { messages } from './messages';
import { PATHS } from './routing/paths';
import {
  apiServer,
  createTestDeps,
  projectFixture,
  RESIDENT,
  session,
  TEST_API_URL,
  TEST_NOW,
} from './test/api-server';
import { createDraftServer } from './test/draft-server';
import { renderApp } from './test/render-app';

const editorProps = vi.hoisted(() => ({ current: null as ParkEditorProps | null }));

vi.mock('@parkshape/scene', () => {
  const ParkEditor = (props: ParkEditorProps) => {
    editorProps.current = props;
    return <div data-testid="park-editor">{props.details}</div>;
  };
  return { ParkEditor };
});

const { editor } = messages;
const HOUR_MS = 3_600_000;
// Autosave waits 500 ms on real timers here; a loaded machine gets room.
const SAVE_WAIT = { timeout: 8_000 };
const TEST_TIMEOUT = { timeout: 25_000 };

afterEach(() => {
  editorProps.current = null;
});

function store() {
  const ctx = editorProps.current?.ctx;
  if (ctx === undefined) throw new Error('The editor did not open.');
  return ctx.store;
}

function edit(change: (document: DesignDocument) => DesignDocument) {
  act(() => {
    store().getState().replaceDocument(change(store().getState().document));
  });
}

const withoutItems = (document: DesignDocument) => ({ ...document, items: [] });
const withoutPaths = (document: DesignDocument) => ({ ...document, paths: [] });
const withoutAreas = (document: DesignDocument) => ({ ...document, areas: [] });

async function openEditor(clockSkewMs = HOUR_MS) {
  session.user = RESIDENT;
  const project = await projectFixture();
  const example = (await (await fetch(`${TEST_API_URL}/designs/example`)).json()) as Design;
  const design: Design = {
    ...example,
    id: 'd1',
    projectId: 'jrp',
    status: 'draft',
    updatedAt: TEST_NOW.toISOString(),
  };
  const server = createDraftServer(design);
  apiServer.use(
    http.get(`${TEST_API_URL}/projects/jrp`, () => HttpResponse.json(project)),
    ...server.handlers,
  );
  // The browser clock is an hour off the server; reconciliation must never read it.
  const deps = {
    ...createTestDeps(),
    clock: new FakeClock(new Date(TEST_NOW.getTime() + clockSkewMs)),
  };
  const { router } = renderApp(PATHS.design('jrp', 'd1'), deps);
  await screen.findByTestId('park-editor', {}, { timeout: 10_000 });
  await act(() => Promise.resolve());
  return { server, router, first: designDocumentSchema.parse(design.document) };
}

async function findChoice() {
  return screen.findByRole('button', { name: editor.save.keepMine }, SAVE_WAIT);
}

describe('two tabs editing one draft', () => {
  it(
    'shows the choice when the other tab saved first, and overwrites nothing',
    TEST_TIMEOUT,
    async () => {
      const { server, first } = await openEditor();
      const tabA = server.saveFromOtherTab(withoutPaths(first));
      edit(withoutItems);
      await findChoice();
      expect(screen.getByRole('button', { name: editor.save.useSaved })).toBeVisible();
      expect(server.stored()).toEqual(tabA);
      expect(store().getState().document.items).toEqual([]);
      expect(server.puts.at(-1)?.expectedUpdatedAt).toBe(TEST_NOW.toISOString());
    },
  );

  it('overwrites the saved version with Keep my changes', TEST_TIMEOUT, async () => {
    const { server, first } = await openEditor();
    const tabA = server.saveFromOtherTab(withoutPaths(first));
    edit(withoutItems);
    await userEvent.click(await findChoice());
    await waitFor(() => {
      expect(server.stored().document).toEqual(withoutItems(first));
    }, SAVE_WAIT);
    expect(server.puts.at(-1)?.expectedUpdatedAt).toBe(tabA.updatedAt);
    expect(await screen.findByText(editor.save.saved)).toBeVisible();
    expect(screen.queryByRole('button', { name: editor.save.keepMine })).toBeNull();
  });

  it(
    'replaces the editor and clears the device copy with Use the saved version',
    TEST_TIMEOUT,
    async () => {
      const { server, first } = await openEditor();
      const tabA = server.saveFromOtherTab(withoutPaths(first));
      edit(withoutItems);
      await findChoice();
      const putsBefore = server.puts.length;
      await userEvent.click(screen.getByRole('button', { name: editor.save.useSaved }));
      expect(store().getState().document).toEqual(tabA.document);
      expect(readLocalDraft(window.localStorage, 'd1')).toBeNull();
      await new Promise((done) => setTimeout(done, 1_000));
      expect(server.puts).toHaveLength(putsBefore);
      expect(screen.queryByRole('button', { name: editor.save.keepMine })).toBeNull();
    },
  );
});

describe('submitting after another tab saved', () => {
  it('does not submit or overwrite, and shows the choice', TEST_TIMEOUT, async () => {
    const { server, first } = await openEditor();
    const submits: string[] = [];
    apiServer.use(
      http.post(`${TEST_API_URL}/designs/d1/submit`, () => {
        submits.push('d1');
        return HttpResponse.json({
          status: 'submitted',
          metrics: {},
          hardFailures: [],
          softWarnings: [],
        });
      }),
    );
    const tabA = server.saveFromOtherTab(withoutPaths(first));
    await userEvent.click(screen.getByRole('button', { name: editor.submit }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: messages.submit.action }));
    expect(await within(dialog).findByText(messages.failure.serverError)).toBeVisible();
    expect(submits).toEqual([]);
    expect(server.stored()).toEqual(tabA);
    expect(await findChoice()).toBeVisible();
  });
});

describe('offline replay', () => {
  it(
    'asks when the server draft moved on while offline, and overwrites neither copy',
    TEST_TIMEOUT,
    async () => {
      const { server, first } = await openEditor();
      server.setLink('offline');
      edit(withoutItems);
      expect(await screen.findByText(editor.save.paused, {}, SAVE_WAIT)).toBeVisible();
      const tabA = server.saveFromOtherTab(withoutPaths(first));
      server.setLink('online');
      act(() => {
        window.dispatchEvent(new Event('online'));
      });
      await findChoice();
      expect(server.stored()).toEqual(tabA);
      expect(store().getState().document).toEqual(withoutItems(first));
      expect(readLocalDraft(window.localStorage, 'd1')?.state).toBe('unsynced');
    },
  );

  it.each([
    ['an hour ahead', HOUR_MS],
    ['an hour behind', -HOUR_MS],
  ])(
    'saves without asking when the server is unchanged, with the clock %s',
    async (_, skew) => {
      const { server, first } = await openEditor(skew);
      server.setLink('offline');
      edit(withoutItems);
      expect(await screen.findByText(editor.save.paused, {}, SAVE_WAIT)).toBeVisible();
      server.setLink('online');
      act(() => {
        window.dispatchEvent(new Event('online'));
      });
      expect(await screen.findByText(editor.save.saved, {}, SAVE_WAIT)).toBeVisible();
      expect(server.stored().document).toEqual(withoutItems(first));
      expect(screen.queryByRole('button', { name: editor.save.keepMine })).toBeNull();
    },
    TEST_TIMEOUT.timeout,
  );

  it('keeps a newer edit when an older save answers late', TEST_TIMEOUT, async () => {
    const { server, first } = await openEditor();
    const release = server.hold();
    edit(withoutItems);
    await waitFor(() => {
      expect(server.held()).toBe(1);
    }, SAVE_WAIT);
    edit(withoutAreas);
    release();
    await waitFor(() => {
      expect(server.stored().document).toEqual(withoutAreas(withoutItems(first)));
    }, SAVE_WAIT);
    expect(store().getState().document).toEqual(withoutAreas(withoutItems(first)));
    expect(server.puts.filter((put) => put.expectedUpdatedAt !== undefined)).toHaveLength(2);
    expect(screen.queryByRole('button', { name: editor.save.keepMine })).toBeNull();
  });
});

describe('signing out', () => {
  it('clears this device copy of the draft', TEST_TIMEOUT, async () => {
    const { server, router } = await openEditor();
    server.setLink('offline');
    edit(withoutItems);
    expect(window.localStorage.getItem(localDraftKey('d1'))).not.toBeNull();
    await act(() =>
      router.navigate(PATHS.logout, { formMethod: 'post', formData: new FormData() }),
    );
    expect(window.localStorage.getItem(localDraftKey('d1'))).toBeNull();
  });
});
