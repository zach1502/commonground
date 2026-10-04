import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { format, messages } from '../messages';
import { PATHS } from '../routing/paths';
import { apiServer, RESIDENT, session, STAFF, TEST_API_URL } from '../test/api-server';
import { usePlannerHandlers } from '../test/planner-fixtures';
import { renderApp } from '../test/render-app';

import { WIZARD_STORAGE_KEY } from './wizard-state';
import { stepHref } from './wizard-steps';

interface StubMapProps {
  readonly strings: { readonly region: string };
  readonly draw?: 'on' | 'off';
  readonly markers?: readonly { readonly id: string; readonly locked: string }[];
  readonly onFinishDrawing?: (ring: [number, number][]) => void;
}

// MapLibre needs WebGL; the real map is covered by the Playwright planner test.
vi.mock('@parkshape/ui/map', () => {
  const ParcelMap = ({ strings, draw, markers, onFinishDrawing }: StubMapProps) => (
    <div
      role="region"
      aria-label={strings.region}
      data-markers={markers?.map((m) => m.locked).join(',')}
    >
      {draw === 'on' ? (
        <button
          type="button"
          onClick={() => {
            onFinishDrawing?.([
              [-123.1, 49.26],
              [-123.09, 49.26],
              [-123.09, 49.27],
              [-123.1, 49.26],
            ]);
          }}
        >
          stub finish
        </button>
      ) : null}
    </div>
  );
  return { ParcelMap };
});

vi.mock('@parkshape/scene', () => {
  const ParkEditor = () => <p>stub editor</p>;
  return { ParkEditor };
});

// jsdom has no WebGL; the stub stands in for the offline renderer the seed uses.
const rendered = vi.hoisted(() => ({ frames: [] as string[] }));
vi.mock('@parkshape/scene/thumbnail', () => ({
  viewerScene: () => ({ heightmap: null, document: null, catalog: null }),
  renderThumbnail: (_input: unknown, frame: string) => {
    rendered.frames.push(frame);
    return Promise.resolve(new Blob(['RIFF'], { type: 'image/webp' }));
  },
}));

const wizard = messages.planner.wizard;
// Each step is a lazy route. Under the full-tier turbo run, a step can take more than the
// 1 s findBy default to load.
const LAZY_STEP_TIMEOUT_MS = 10_000;

function findStepHeading(step: keyof typeof wizard.steps) {
  return screen.findByRole(
    'heading',
    { level: 2, name: wizard.steps[step] },
    { timeout: LAZY_STEP_TIMEOUT_MS },
  );
}

async function continueTo(step: keyof typeof wizard.steps) {
  await userEvent.click(screen.getByRole('button', { name: wizard.continue }));
  await findStepHeading(step);
}

async function searchPark(name: string) {
  const field = await screen.findByRole('textbox', { name: messages.planner.site.searchLabel });
  await userEvent.clear(field);
  await userEvent.type(field, name);
  await userEvent.click(screen.getByRole('button', { name: messages.planner.site.search }));
}

/** Step 3: the source reads as a name, and locking the hedge maple sticks. */
async function reviewAndLockMaple() {
  const table = await screen.findByRole('table');
  expect(within(table).getAllByText('Vancouver Open Data, public trees')).toHaveLength(2);
  expect(table).not.toHaveTextContent('public-trees');
  await userEvent.click(within(table).getByRole('button', { name: /Lock Hedge maple/ }));
  expect(within(table).getByRole('button', { name: /Lock Hedge maple/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
}

/** Records the design ids that get a stored picture. */
function recordPictures(): string[] {
  const pictures: string[] = [];
  apiServer.use(
    http.post(`${TEST_API_URL}/designs/:id/thumbnail`, async ({ params }) => {
      pictures.push(String(params.id));
      const example: unknown = await (await fetch(`${TEST_API_URL}/designs/example`)).json();
      return HttpResponse.json(example as object);
    }),
  );
  return pictures;
}

describe('project setup wizard, the whole way', () => {
  // Six lazy steps under a loaded coverage run can take longer than the 5 s default.
  it('walks the six steps and publishes the project', { timeout: 20_000 }, async () => {
    const { created } = usePlannerHandlers();
    const pictures = recordPictures();
    session.user = STAFF;
    const { router } = renderApp('/staff/projects/new');
    await findStepHeading('site');
    expect(router.state.location.pathname).toBe(stepHref('site'));
    expect(screen.getByRole('navigation', { name: wizard.stepsLabel })).toBeVisible();
    expect(document.title).toBe(messages.plannerMeta.site.title);
    await searchPark('Jonathan Rogers Park');
    expect(
      await screen.findByText(
        format(messages.planner.site.found, { name: 'Jonathan Rogers Park' }),
      ),
    ).toBeVisible();
    expect(document.body).toHaveTextContent('Vancouver parks boundaries');
    expect(document.body).not.toHaveTextContent('parks-polygon-representation');
    await continueTo('terrain');
    expect(await screen.findByTestId('terrain-source')).toHaveTextContent(
      'Bundled elevation for this park',
    );
    await continueTo('review');
    await reviewAndLockMaple();
    await continueTo('parameters');
    const canopy = screen.getByRole('textbox', {
      name: messages.planner.parameters.fields.canopyMin.label,
    });
    await userEvent.clear(canopy);
    await userEvent.type(canopy, '35');
    const column = screen.getByRole('navigation', { name: wizard.stepsLabel }).parentElement;
    await continueTo('refine');
    expect(await screen.findByText('stub editor')).toBeVisible();
    // Step 5 keeps the page column the other steps use, so its content starts on the same edge.
    expect(screen.getByRole('navigation', { name: wizard.stepsLabel }).parentElement).toBe(column);
    expect(column).toHaveClass('web-page');
    await continueTo('publish');
    await userEvent.click(screen.getByRole('button', { name: messages.planner.publish.publish }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(PATHS.staff);
    });
    const [body] = created as {
      name: string;
      parameters: { canopy: { minPercent: number } };
      baselineDocument: { items: { locked: boolean }[] };
    }[];
    expect(body?.name).toBe('Jonathan Rogers Park');
    expect(body?.parameters.canopy.minPercent).toBe(35);
    expect(body?.baselineDocument.items.map((item) => item.locked)).toEqual([true, true]);
    expect(window.sessionStorage.getItem(WIZARD_STORAGE_KEY)).toBeNull();
    // Publishing draws the park today with the baseline frame and stores it on the baseline.
    expect(rendered.frames).toEqual(['baseline']);
    expect(pictures).toHaveLength(1);
  });
});

describe('project setup wizard, going back and guards', () => {
  it(
    'keeps answers when going back and sends later steps to the first open one',
    {
      timeout: 20_000,
    },
    async () => {
      usePlannerHandlers();
      session.user = STAFF;
      const { router } = renderApp(stepHref('review'));
      await findStepHeading('site');
      expect(router.state.location.pathname).toBe(stepHref('site'));
      await userEvent.click(screen.getByRole('radio', { name: messages.planner.site.modes.draw }));
      await userEvent.click(screen.getByRole('button', { name: 'stub finish' }));
      expect(screen.getByText(format(messages.planner.site.drawn, { count: 3 }))).toBeVisible();
      await continueTo('terrain');
      await screen.findByTestId('terrain-source');
      await userEvent.click(screen.getByRole('link', { name: wizard.back }));
      await findStepHeading('site');
      expect(screen.getByRole('radio', { name: messages.planner.site.modes.draw })).toBeChecked();
      expect(screen.getByRole('link', { name: /Load terrain/ })).toBeVisible();
    },
  );

  it('says when the park is not in the dataset', async () => {
    usePlannerHandlers();
    session.user = STAFF;
    renderApp(stepHref('site'));
    await searchPark('No Such Park');
    expect(
      await screen.findByText(format(messages.planner.site.notFound, { name: 'No Such Park' })),
    ).toBeVisible();
    expect(screen.getByText(messages.planner.site.needSite)).toBeVisible();
  });

  it('sends residents to their projects', async () => {
    session.user = RESIDENT;
    const { router } = renderApp(stepHref('site'));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(PATHS.projects);
    });
  });
});

async function walkToPublish() {
  usePlannerHandlers();
  session.user = STAFF;
  renderApp('/staff/projects/new');
  await findStepHeading('site');
  await searchPark('Jonathan Rogers Park');
  await screen.findByText(format(messages.planner.site.found, { name: 'Jonathan Rogers Park' }));
  await continueTo('terrain');
  await screen.findByTestId('terrain-source');
  // The lede names what the step reads, not the fallback chain behind it.
  expect(document.body).not.toHaveTextContent('MRDEM at 30 m');
  await continueTo('review');
  await screen.findByRole('table');
  await continueTo('parameters');
  expect(document.body).not.toHaveTextContent('Designs are checked against these when residents');
  await continueTo('refine');
  await continueTo('publish');
}

describe('project setup wizard, publish review', () => {
  it(
    'lists the 5 rules on Publish and follows an Edit link back to step 4',
    { timeout: 20_000 },
    async () => {
      await walkToPublish();
      const rules = screen.getByRole('region', { name: messages.planner.publish.rulesHeading });
      expect(within(rules).getAllByRole('term')).toHaveLength(5);
      const edits = within(rules).getAllByRole('link', { name: /^Edit / });
      expect(edits).toHaveLength(5);
      expect(edits.map((link) => link.textContent)).toEqual(
        Array(5).fill(messages.planner.publish.edit),
      );
      await userEvent.click(
        within(rules).getByRole('link', {
          name: format(messages.planner.publish.editRule, { rule: 'Tree canopy, at least' }),
        }),
      );
      await findStepHeading('parameters');
    },
  );

  it('puts the primary action first, with Back after it', { timeout: 20_000 }, async () => {
    await walkToPublish();
    const primary = screen.getByRole('button', { name: messages.planner.publish.publish });
    const back = screen.getByRole('link', { name: wizard.back });
    expect(primary.compareDocumentPosition(back)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(back).toHaveAttribute('data-variant', 'tertiary');
  });
});
