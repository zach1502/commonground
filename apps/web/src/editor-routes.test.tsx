import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ParkEditorProps } from '@parkshape/scene';

import type { Design } from './api/web-api';
import { format, messages } from './messages';
import { PATHS } from './routing/paths';
import {
  apiServer,
  createTestDeps,
  projectFixture,
  RESIDENT,
  session,
  TEST_API_URL,
} from './test/api-server';
import { renderApp } from './test/render-app';

const editorProps = vi.hoisted(() => ({ current: null as ParkEditorProps | null }));

// The real editor needs WebGL; Playwright covers it. Here it only reports the props it got.
vi.mock('@parkshape/scene', () => {
  const ParkEditor = (props: ParkEditorProps) => {
    editorProps.current = props;
    return <div data-testid="park-editor">{props.details}</div>;
  };
  return { ParkEditor };
});

const { editor, newDesign } = messages;
const DESKTOP_WIDTH = 1440;
const PHONE_WIDTH = 800;
const LAZY_PAGE_TIMEOUT_MS = 10_000;

async function exampleDesign(): Promise<Design> {
  const response = await fetch(`${TEST_API_URL}/designs/example`);
  return { ...((await response.json()) as Design), id: 'd1', projectId: 'jrp', status: 'draft' };
}

async function signedInWithProject(baselineDesignId: string | null = 'base-1') {
  session.user = RESIDENT;
  const project = await projectFixture({ baselineDesignId });
  const design = await exampleDesign();
  const saved: unknown[] = [];
  apiServer.use(
    http.get(`${TEST_API_URL}/projects/jrp`, () => HttpResponse.json(project)),
    http.get(`${TEST_API_URL}/designs/d1`, () => HttpResponse.json(design)),
    http.put(`${TEST_API_URL}/designs/d1`, async ({ request }) => {
      saved.push(await request.json());
      return HttpResponse.json(design);
    }),
    http.post(`${TEST_API_URL}/projects/jrp/designs`, () =>
      HttpResponse.json(design, { status: 201 }),
    ),
  );
  return { project, design, saved };
}

/** The first editor page test pays for the lazy editor-page import. */
async function findSmallScreenHeading(): Promise<HTMLElement> {
  return screen.findByRole(
    'heading',
    { name: editor.smallScreen.heading },
    { timeout: LAZY_PAGE_TIMEOUT_MS },
  );
}

function setWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
}

afterEach(() => {
  editorProps.current = null;
  setWidth(DESKTOP_WIDTH);
  delete (window as { __parkshapeEditor?: unknown }).__parkshapeEditor;
});

/** The three start choices: Start from the park primary, Blank and Describe secondary. */
function expectStartChoices(main: HTMLElement) {
  expect(within(main).getByRole('button', { name: newDesign.baseline })).toHaveAttribute(
    'data-variant',
    'primary',
  );
  expect(within(main).getByRole('button', { name: newDesign.blank })).toHaveAttribute(
    'data-variant',
    'secondary',
  );
  expect(within(main).getByRole('button', { name: newDesign.describe })).toHaveAttribute(
    'data-variant',
    'secondary',
  );
  expect(within(main).getAllByRole('button')).toHaveLength(3);
}

describe('new design chooser', () => {
  // The first render loads the route modules, so it gets a longer time limit.
  it(
    'offers Start from the park as it is as the primary action and Blank beside it',
    { timeout: 20_000 },
    async () => {
      await signedInWithProject();
      renderApp(PATHS.newDesign('jrp'));
      await screen.findByRole('button', { name: newDesign.baseline }, { timeout: 15_000 });
      expect(newDesign.baseline).toBe('Start from the park as it is');
      expect(screen.getByRole('button', { name: newDesign.baseline })).toHaveAccessibleDescription(
        newDesign.baselineHelp,
      );
      const main = screen.getByRole('main');
      expect(within(main).getByRole('heading', { level: 1 })).toHaveTextContent(
        'Jonathan Rogers Park',
      );
      expectStartChoices(main);
    },
  );

  it('starts a blank design and opens it in the editor', async () => {
    await signedInWithProject();
    const { router } = renderApp(PATHS.newDesign('jrp'));
    await userEvent.click(await screen.findByRole('button', { name: newDesign.blank }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(PATHS.design('jrp', 'd1'));
    });
  });

  it('offers only Blank, as the primary action, when the project has no baseline', async () => {
    await signedInWithProject(null);
    renderApp(PATHS.newDesign('jrp'));
    const blank = await screen.findByRole('button', { name: newDesign.blank });
    expect(blank).toHaveAttribute('data-variant', 'primary');
    expect(screen.queryByRole('button', { name: newDesign.baseline })).toBeNull();
  });

  it('says so when the design does not start', async () => {
    await signedInWithProject();
    apiServer.use(
      http.post(
        `${TEST_API_URL}/projects/jrp/designs`,
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    renderApp(PATHS.newDesign('jrp'));
    await userEvent.click(await screen.findByRole('button', { name: newDesign.blank }));
    expect(await screen.findByText(newDesign.failed)).toBeVisible();
  });
});

describe('editor page', () => {
  it('shows the small-screen notice under 1024 px, with a link to voting', async () => {
    await signedInWithProject();
    setWidth(PHONE_WIDTH);
    renderApp(PATHS.design('jrp', 'd1'));
    expect(await findSmallScreenHeading()).toBeVisible();
    expect(screen.getByRole('link', { name: editor.smallScreen.link })).toHaveAttribute(
      'href',
      PATHS.project('jrp'),
    );
    expect(screen.queryByTestId('park-editor')).toBeNull();
  });

  it('opens the editor with the design, one primary Submit and the meters slot', async () => {
    const { project } = await signedInWithProject();
    renderApp(PATHS.design('jrp', 'd1'));
    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(format(editor.heading, { name: project.name }));
    expect(await screen.findByTestId('park-editor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: editor.submit })).toHaveAttribute(
      'data-variant',
      'primary',
    );
    await waitFor(() => {
      expect(document.title).toBe(format(messages.meta.editor.title, { name: project.name }));
    });
  });
});

describe('editor page brief', () => {
  it('puts the project brief in the side panel', async () => {
    const { project } = await signedInWithProject();
    renderApp(PATHS.design('jrp', 'd1'));
    const panel = await screen.findByTestId('park-editor');
    expect(within(panel).getByText(editor.brief)).toBeInTheDocument();
    expect(within(panel).getByText(project.parameters.brief)).toBeInTheDocument();
  });
});

describe('editor page chrome', () => {
  it('drops the site header, so the editor bar is the one bar of chrome', async () => {
    await signedInWithProject();
    renderApp(PATHS.design('jrp', 'd1'));
    await screen.findByTestId('park-editor');
    expect(screen.queryByRole('banner')).toBeNull();
    expect(screen.getByRole('link', { name: messages.app.skipLink })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: messages.app.homeLink })).toHaveAttribute(
      'href',
      PATHS.home,
    );
  });

  // The 500 ms autosave runs on real timers here, so a loaded machine gets room.
  it('saves the draft through the API after a change', { timeout: 20_000 }, async () => {
    const { saved } = await signedInWithProject();
    renderApp(PATHS.design('jrp', 'd1'));
    await screen.findByTestId('park-editor');
    // findBy can resolve before React runs the effects that subscribe autosave.
    await act(() => Promise.resolve());
    const ctx = editorProps.current?.ctx;
    act(() => {
      ctx?.store.getState().replaceDocument({ ...ctx.store.getState().document, zones: [] });
      ctx?.store.getState().execute({ kind: 'batch', commands: [] });
    });
    await waitFor(
      () => {
        expect(saved).toHaveLength(1);
      },
      { timeout: 18_000 },
    );
    expect(await screen.findByText(editor.save.saved)).toBeVisible();
  });

  it('shows the not found page for a design the API does not have', async () => {
    await signedInWithProject();
    apiServer.use(
      http.get(`${TEST_API_URL}/designs/d1`, () => new HttpResponse(null, { status: 404 })),
    );
    renderApp(PATHS.design('jrp', 'd1'));
    expect(
      await screen.findByRole('heading', { name: messages.errors.notFoundHeading }),
    ).toBeVisible();
  });
});

describe('editor page actions', () => {
  it('opens the shortcuts from Help', async () => {
    await signedInWithProject();
    renderApp(PATHS.design('jrp', 'd1'));
    await screen.findByTestId('park-editor');
    const store = editorProps.current?.ctx.store;
    await userEvent.click(screen.getByRole('button', { name: editor.help }));
    await userEvent.click(screen.getByRole('button', { name: editor.showShortcuts }));
    expect(store?.getState().shortcuts).toBe('open');
  });
});

describe('editor page submit and test hook', () => {
  it('opens the submit dialog with the lifecycle rules from Submit', async () => {
    await signedInWithProject();
    renderApp(PATHS.design('jrp', 'd1'));
    await userEvent.click(await screen.findByRole('button', { name: editor.submit }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(messages.submit.rules.final);
    expect(dialog.querySelectorAll('[data-variant="primary"]')).toHaveLength(1);
  });

  it('lists the hard failures the server returns in the dialog', async () => {
    await signedInWithProject();
    apiServer.use(
      http.post(`${TEST_API_URL}/designs/d1/submit`, () =>
        HttpResponse.json({
          status: 'draft',
          metrics: {},
          hardFailures: [{ key: 'budget', message: 'Budget is $4,200 over.' }],
          softWarnings: [],
        }),
      ),
    );
    renderApp(PATHS.design('jrp', 'd1'));
    await userEvent.click(await screen.findByRole('button', { name: editor.submit }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: messages.submit.action }));
    expect(await screen.findByText('Budget is $4,200 over.')).toBeVisible();
  });

  it('exposes the store on window only when the test hook is on', async () => {
    await signedInWithProject();
    const deps = createTestDeps();
    renderApp(PATHS.design('jrp', 'd1'), { ...deps, editor: { ...deps.editor, testHook: 'on' } });
    await screen.findByTestId('park-editor');
    await waitFor(() => {
      const hook = (window as { __parkshapeEditor?: { getState: () => unknown } })
        .__parkshapeEditor;
      expect(hook?.getState()).toBe(editorProps.current?.ctx.store.getState());
    });
  });
});
