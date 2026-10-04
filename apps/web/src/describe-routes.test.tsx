import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

// The real viewer needs WebGL; Playwright covers it.
vi.mock('@parkshape/scene/viewer', () => {
  const ParkViewer = () => <div data-testid="park-viewer" />;
  const viewerScene = () => ({ heightmap: null, document: null, catalog: null });
  return { ParkViewer, viewerScene };
});

const { describe: text, describePreview: preview, newDesign } = messages;
const LAZY_PAGE_TIMEOUT_MS = 15_000;
const NOTE = 'The pond did not fit on the low side. It is near the south edge instead.';
const INTENT = { features: [], paths: { style: 'loop' }, canopy: 'maximize', character: 'natural' };

async function generatedDesign(
  id: string,
  seed: number,
  readBy: Record<string, string> = {},
): Promise<Design> {
  const response = await fetch(`${TEST_API_URL}/designs/example`);
  const example = (await response.json()) as Design;
  return {
    ...example,
    id,
    projectId: 'jrp',
    status: 'draft',
    document: {
      ...example.document,
      generated: { intent: INTENT, seed, notes: [NOTE], ...readBy },
    },
  } as Design;
}

async function signedIn() {
  session.user = RESIDENT;
  const project = await projectFixture();
  const first = await generatedDesign('g1', 5);
  const second = await generatedDesign('g2', 6);
  const posted: unknown[] = [];
  apiServer.use(
    http.get(`${TEST_API_URL}/projects/jrp`, () => HttpResponse.json(project)),
    http.get(`${TEST_API_URL}/designs/g1`, () => HttpResponse.json(first)),
    http.get(`${TEST_API_URL}/designs/g2`, () => HttpResponse.json(second)),
    http.post(`${TEST_API_URL}/projects/jrp/designs`, async ({ request }) => {
      const body = (await request.json()) as { seed?: number };
      posted.push(body);
      return HttpResponse.json(body.seed === undefined ? first : second, { status: 201 });
    }),
  );
  return { posted };
}

function withDescribeIt(state: 'on' | 'off') {
  return { ...createTestDeps(), describeIt: state };
}

afterEach(() => {
  delete (window as { __parkshapePreview?: unknown }).__parkshapePreview;
});

describe('Describe it on the new design chooser', () => {
  it('offers Describe it as a secondary third option', { timeout: 20_000 }, async () => {
    await signedIn();
    const { router } = renderApp(PATHS.newDesign('jrp'), withDescribeIt('on'));
    const button = await screen.findByRole(
      'button',
      { name: newDesign.describe },
      { timeout: LAZY_PAGE_TIMEOUT_MS },
    );
    expect(button).toHaveAttribute('data-variant', 'secondary');
    await userEvent.click(button);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(PATHS.describe('jrp'));
    });
  });

  it('hides Describe it when the flag is off', async () => {
    await signedIn();
    renderApp(PATHS.newDesign('jrp'), withDescribeIt('off'));
    await screen.findByRole('button', { name: newDesign.blank });
    expect(screen.queryByRole('button', { name: newDesign.describe })).toBeNull();
  });

  it('shows the not-found page for the describe route when the flag is off', async () => {
    await signedIn();
    renderApp(PATHS.describe('jrp'), withDescribeIt('off'));
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      messages.errors.notFoundHeading,
    );
  });
});

describe('the describe page', () => {
  it('fills the field from an example and generates a draft', async () => {
    const { posted } = await signedIn();
    const { router } = renderApp(PATHS.describe('jrp'), withDescribeIt('on'));
    await userEvent.click(
      await screen.findByRole('button', { name: text.example1 }, { timeout: LAZY_PAGE_TIMEOUT_MS }),
    );
    const field = screen.getByLabelText(text.field);
    expect(field).toHaveValue(text.example1);
    expect(field).toHaveAttribute('maxLength', '400');
    const picked = screen.getByRole('button', { name: text.example1 });
    expect(picked).toHaveAttribute('data-variant', 'secondary');
    expect(picked).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: text.example2 })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await userEvent.type(field, ' and a bench');
    expect(picked).toHaveAttribute('aria-pressed', 'false');
    const generate = screen.getByRole('button', { name: text.generate });
    expect(generate).toHaveAttribute('data-variant', 'primary');
    await userEvent.click(generate);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(PATHS.describePreview('jrp', 'g1'));
    });
    expect(posted).toEqual([{ from: 'describe', text: `${text.example1} and a bench` }]);
  });

  it('asks for a description before generating', async () => {
    const { posted } = await signedIn();
    renderApp(PATHS.describe('jrp'), withDescribeIt('on'));
    await userEvent.click(
      await screen.findByRole('button', { name: text.generate }, { timeout: LAZY_PAGE_TIMEOUT_MS }),
    );
    expect(await screen.findByText(text.empty)).toBeVisible();
    expect(screen.getByLabelText(text.field)).toHaveFocus();
    expect(screen.getByLabelText(text.field)).toHaveAttribute('aria-invalid', 'true');
    expect(posted).toEqual([]);
  });
});

describe('the describe page layout', () => {
  it('puts the field first, then the examples, and names the button Make my layout', async () => {
    await signedIn();
    renderApp(PATHS.describe('jrp'), withDescribeIt('on'));
    const make = await screen.findByRole(
      'button',
      { name: 'Make my layout' },
      { timeout: LAZY_PAGE_TIMEOUT_MS },
    );
    expect(make).toHaveAttribute('data-variant', 'primary');
    const field = screen.getByLabelText(text.field);
    const examples = screen.getByRole('region', { name: text.examplesLabel });
    expect(text.examplesLabel).toBe('Or start from an example');
    expect(field.compareDocumentPosition(examples) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(examples).getByText(text.examplesLabel)).toHaveClass(
      'web-describe__examples-label',
    );
  });
});

describe('describe it page while generating', () => {
  it('names the terrain source while the layout generates', async () => {
    await signedIn();
    apiServer.use(
      http.post(`${TEST_API_URL}/projects/jrp/designs`, () => new Promise<never>(() => undefined)),
    );
    renderApp(PATHS.describe('jrp'), withDescribeIt('on'));
    await userEvent.click(
      await screen.findByRole('button', { name: text.example1 }, { timeout: LAZY_PAGE_TIMEOUT_MS }),
    );
    await userEvent.click(screen.getByRole('button', { name: text.generate }));
    expect(await screen.findByRole('status')).toHaveTextContent(text.generating);
  });

  it('says so when the layout does not generate', async () => {
    await signedIn();
    apiServer.use(
      http.post(
        `${TEST_API_URL}/projects/jrp/designs`,
        () => new HttpResponse(null, { status: 503 }),
      ),
    );
    renderApp(PATHS.describe('jrp'), withDescribeIt('on'));
    await userEvent.type(
      await screen.findByLabelText(text.field, undefined, { timeout: LAZY_PAGE_TIMEOUT_MS }),
      'a pond',
    );
    await userEvent.click(screen.getByRole('button', { name: text.generate }));
    expect(await screen.findByText(text.failed)).toBeVisible();
  });
});

describe('the generated preview', () => {
  const previewPath = `${PATHS.describePreview('jrp', 'g1')}?text=${encodeURIComponent('a pond')}`;

  it('labels the draft, lists the notes and opens it in the editor', async () => {
    await signedIn();
    renderApp(previewPath, withDescribeIt('on'));
    await screen.findByRole(
      'heading',
      { level: 1, name: preview.label },
      { timeout: LAZY_PAGE_TIMEOUT_MS },
    );
    const main = screen.getByRole('main');
    expect(within(main).getByText(NOTE)).toBeVisible();
    const open = within(main).getByRole('link', { name: preview.openEditor });
    expect(open).toHaveAttribute('href', PATHS.design('jrp', 'g1'));
    expect(open).toHaveAttribute('data-variant', 'primary');
    expect(within(main).getByRole('button', { name: preview.tryAnother })).toHaveAttribute(
      'data-variant',
      'secondary',
    );
    // A draft made before the source was kept says nothing about who read it.
    expect(within(main).queryByText(preview.readByRules)).toBeNull();
    expect(within(main).queryByText(/read your description/)).toBeNull();
  });

  it('tries another arrangement with the next seed and the same text', async () => {
    const { posted } = await signedIn();
    const { router } = renderApp(previewPath, withDescribeIt('on'));
    await userEvent.click(
      await screen.findByRole(
        'button',
        { name: preview.tryAnother },
        { timeout: LAZY_PAGE_TIMEOUT_MS },
      ),
    );
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(PATHS.describePreview('jrp', 'g2'));
    });
    expect(router.state.location.search).toBe('?text=a+pond');
    expect(posted).toEqual([{ from: 'describe', text: 'a pond', seed: 6 }]);
  });

  it('exposes the document on window in test builds', async () => {
    await signedIn();
    const deps = withDescribeIt('on');
    renderApp(previewPath, { ...deps, editor: { ...deps.editor, testHook: 'on' } });
    await waitFor(
      () => {
        expect(window.__parkshapePreview?.document.generated?.seed).toBe(5);
      },
      { timeout: LAZY_PAGE_TIMEOUT_MS },
    );
  });
});

describe('who read the description, on the generated preview', () => {
  const previewPath = `${PATHS.describePreview('jrp', 'g1')}?text=${encodeURIComponent('a pond')}`;

  async function showPreview(readBy: Record<string, string>) {
    await signedIn();
    const design = await generatedDesign('g1', 5, readBy);
    apiServer.use(http.get(`${TEST_API_URL}/designs/g1`, () => HttpResponse.json(design)));
    renderApp(previewPath, withDescribeIt('on'));
  }

  it('names the model that read the description', async () => {
    await showPreview({ source: 'model', model: 'gemini-3.1-flash-lite' });
    const line = format(preview.readByModel, { model: 'gemini-3.1-flash-lite' });
    expect(
      await screen.findByText(line, undefined, { timeout: LAZY_PAGE_TIMEOUT_MS }),
    ).toBeVisible();
  });

  it('says the fixed rules read the description when they did', async () => {
    await showPreview({ source: 'rule-based' });
    const line = await screen.findByText(preview.readByRules, undefined, {
      timeout: LAZY_PAGE_TIMEOUT_MS,
    });
    expect(line).toBeVisible();
  });
});
