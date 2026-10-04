import { describe, expect, it, vi } from 'vitest';

import { ApiRequestError } from '@parkshape/api-client';

import { RESIDENT, STAFF } from '../test/api-server';
import {
  args,
  DESIGN,
  fakeApi,
  loaded,
  loadersWith,
  PROJECT,
  QUEUE,
  signedIn,
} from '../test/loader-fakes';

import { EARLY_QUEUE_KEY } from './early-queue';
import { NotFoundError } from './not-found';
import { PATHS } from './paths';

const THUMBNAIL = 'http://api.test/blobs/thumbnails/d1.webp';

async function redirectOf(promise: Promise<unknown>): Promise<string | null> {
  const result = await promise;
  return result instanceof Response ? result.headers.get('Location') : null;
}

describe('root loader', () => {
  it('returns the signed-in user', async () => {
    const loaders = loadersWith(fakeApi({ getMe: vi.fn().mockResolvedValue(RESIDENT) }));
    expect(await loaders.root()).toEqual({ user: RESIDENT });
  });
});

describe('login loaders', () => {
  it('offer only the personas for the audience', async () => {
    const loaders = loadersWith(fakeApi());
    const residents = loaded(await loaders.login('resident')());
    expect(residents.personas.map((persona) => persona.role)).toEqual(['resident', 'resident']);
    const staff = loaded(await loaders.login('staff')());
    expect(staff.personas.map((persona) => persona.id)).toEqual([STAFF.id]);
    expect(staff.staffCodeRequired).toBe(true);
  });

  it('send a signed-in person home', async () => {
    const loaders = loadersWith(fakeApi({ getMe: vi.fn().mockResolvedValue(STAFF) }));
    expect(await redirectOf(loaders.login('resident')())).toBe(PATHS.staff);
  });
});

describe('guarded loaders', () => {
  it('redirect a signed-out visitor to the right login', async () => {
    const loaders = loadersWith(fakeApi());
    expect(await redirectOf(loaders.projects())).toBe(PATHS.login);
    expect(await redirectOf(loaders.staff())).toBe(PATHS.staffLogin);
    expect(await redirectOf(loaders.selfReport())).toBe(PATHS.login);
  });

  it('redirect a resident away from staff routes', async () => {
    const loaders = loadersWith(fakeApi({ getMe: vi.fn().mockResolvedValue(RESIDENT) }));
    expect(await redirectOf(loaders.staff())).toBe(PATHS.projects);
  });

  it('load projects for a resident and staff', async () => {
    expect(
      await loadersWith(fakeApi({ getMe: vi.fn().mockResolvedValue(RESIDENT) })).projects(),
    ).toEqual({ projects: [PROJECT], designCounts: [4] });
    expect(await loadersWith(fakeApi({ getMe: vi.fn().mockResolvedValue(STAFF) })).staff()).toEqual(
      { projects: [PROJECT] },
    );
  });

  it('load a project with its design count', async () => {
    const loaders = loadersWith(fakeApi({ getMe: vi.fn().mockResolvedValue(RESIDENT) }));
    expect(await loaders.project(args({ id: 'jrp' }))).toEqual({
      project: PROJECT,
      designCount: 4,
      baseline: null,
    });
  });

  it('turn an unknown project into a 404', async () => {
    const api = fakeApi({
      getMe: vi.fn().mockResolvedValue(RESIDENT),
      getProject: vi.fn().mockRejectedValue(new ApiRequestError(404, 'not-found', 'No project')),
    });
    await expect(loadersWith(api).project(args({ id: 'nope' }))).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('rethrow other project errors', async () => {
    const api = fakeApi({
      getMe: vi.fn().mockResolvedValue(RESIDENT),
      getProject: vi.fn().mockRejectedValue(new Error('down')),
    });
    await expect(loadersWith(api).project(args({ id: 'jrp' }))).rejects.toThrow('down');
  });

  it('let a resident open the self-report', async () => {
    const loaders = loadersWith(fakeApi({ getMe: vi.fn().mockResolvedValue(RESIDENT) }));
    expect(await loaders.selfReport()).toEqual({ user: RESIDENT });
  });
});

describe('project loader', () => {
  it('load the park today from the baseline design', async () => {
    const baseline = { id: 'base', thumbnailUrl: '/blobs/base.png' };
    const getDesign = vi.fn().mockResolvedValue(baseline);
    const getProject = vi.fn().mockResolvedValue({ ...PROJECT, baselineDesignId: 'base' });
    const api = fakeApi({ getMe: vi.fn().mockResolvedValue(RESIDENT), getProject, getDesign });
    const data = loaded(await loadersWith(api).project(args({ id: 'jrp' })));
    expect(getDesign).toHaveBeenCalledWith('base');
    expect(data.baseline).toBe(baseline);
  });
});

describe('shared session lookup', () => {
  it('asks for the session once when the root and a page loader run together', async () => {
    const getMe = vi.fn().mockResolvedValue(RESIDENT);
    const loaders = loadersWith(fakeApi({ getMe }));
    await Promise.all([loaders.root(), loaders.projects()]);
    expect(getMe).toHaveBeenCalledOnce();
  });

  it('asks again on the next navigation', async () => {
    const getMe = vi.fn().mockResolvedValue(RESIDENT);
    const loaders = loadersWith(fakeApi({ getMe }));
    await loaders.root();
    await loaders.root();
    expect(getMe).toHaveBeenCalledTimes(2);
  });

  it('asks again after a failed lookup', async () => {
    // A lost link opens the frame signed out, so the failure here is one the API reported.
    const down = new ApiRequestError(500, 'internal', 'down');
    const getMe = vi.fn().mockRejectedValueOnce(down).mockResolvedValue(null);
    const loaders = loadersWith(fakeApi({ getMe }));
    await expect(loaders.root()).rejects.toThrow('down');
    expect(await loaders.root()).toEqual({ user: null });
  });
});

describe('design and vote loaders', () => {
  it('send a signed-out visitor to login from each resident page', async () => {
    const loaders = loadersWith(fakeApi());
    const startsAtLogin = async (promise: Promise<unknown>) =>
      (await redirectOf(promise))?.startsWith(PATHS.login) ?? false;
    expect(await startsAtLogin(loaders.newDesign(args({ id: 'jrp' })))).toBe(true);
    expect(await startsAtLogin(loaders.vote(args({ id: 'jrp' })))).toBe(true);
    expect(await startsAtLogin(loaders.editor(args({ id: 'jrp', designId: 'd1' })))).toBe(true);
  });

  it('carries the vote route as a returnTo when it sends a signed-out visitor to login', async () => {
    const loaders = loadersWith(fakeApi());
    const target = PATHS.vote('jrp');
    const location = await redirectOf(loaders.vote(args({ id: 'jrp' }, target)));
    expect(location).toBe(`${PATHS.login}?returnTo=${encodeURIComponent(target)}`);
  });

  it('load the project for a new design, with the Describe it setting', async () => {
    expect(await signedIn().newDesign(args({ id: 'jrp' }))).toEqual({
      project: PROJECT,
      describeIt: 'on',
    });
  });
});

describe('vote queue loader', () => {
  it('load the project from the review queue, with no separate project request', async () => {
    const getQueue = vi.fn().mockResolvedValue(QUEUE);
    const getProject = vi.fn();
    expect(await signedIn({ getQueue, getProject }).vote(args({ id: 'jrp' }))).toEqual({
      project: PROJECT,
      queue: QUEUE,
      prefetched: null,
    });
    expect(getQueue).toHaveBeenCalledWith('jrp', expect.any(Number));
    expect(getProject).not.toHaveBeenCalled();
  });

  it('start the queue before the session answers, so the two requests overlap', async () => {
    let answer: (user: typeof RESIDENT) => void = () => undefined;
    const getMe = vi.fn(() => new Promise<typeof RESIDENT>((resolve) => (answer = resolve)));
    const getQueue = vi.fn().mockResolvedValue(QUEUE);
    const pending = loadersWith(fakeApi({ getMe, getQueue })).vote(args({ id: 'jrp' }));
    expect(getQueue).toHaveBeenCalledOnce();
    answer(RESIDENT);
    expect(loaded(await pending).queue).toBe(QUEUE);
  });

  it('start loading the first design only when it has no stored picture', async () => {
    const designs = [
      { id: 'd1', thumbnailUrl: null },
      { id: 'd2', thumbnailUrl: null },
    ];
    const getQueue = vi.fn().mockResolvedValue({ ...QUEUE, designs });
    const getDesign = vi.fn().mockResolvedValue(DESIGN);
    const data = loaded(await signedIn({ getQueue, getDesign }).vote(args({ id: 'jrp' })));
    expect(getDesign).toHaveBeenCalledOnce();
    expect(data.prefetched?.id).toBe('d1');
    expect(await data.prefetched?.design).toBe(DESIGN);
  });

  it('skip the design request when the first card has a stored picture', async () => {
    const designs = [{ id: 'd1', thumbnailUrl: THUMBNAIL }];
    const getQueue = vi.fn().mockResolvedValue({ ...QUEUE, designs });
    const getDesign = vi.fn();
    const data = loaded(await signedIn({ getQueue, getDesign }).vote(args({ id: 'jrp' })));
    expect(getDesign).not.toHaveBeenCalled();
    expect(data.prefetched).toBeNull();
  });
});

describe('vote loader on a first visit', () => {
  it('take the queue that index.html started with the page, with no second request', async () => {
    const getQueue = vi.fn();
    Reflect.set(window, EARLY_QUEUE_KEY, { projectId: 'jrp', queue: Promise.resolve(QUEUE) });
    expect(loaded(await signedIn({ getQueue }).vote(args({ id: 'jrp' }))).queue).toBe(QUEUE);
    expect(getQueue).not.toHaveBeenCalled();
  });
});

describe('public loaders', () => {
  it('load the gallery, the leaderboard and a design page without a session', async () => {
    const board = { entries: [] };
    const loaders = loadersWith(
      fakeApi({
        getLeaderboard: vi.fn().mockResolvedValue(board),
        getDesign: vi.fn().mockResolvedValue(DESIGN),
      }),
    );
    expect(await loaders.gallery(args({ id: 'jrp' }))).toEqual({ project: PROJECT, designs: [] });
    expect(await loaders.leaderboard(args({ id: 'jrp' }))).toEqual({ project: PROJECT, board });
    expect(await loaders.designView(args({ designId: 'd1' }))).toEqual({
      user: null,
      design: DESIGN,
      project: PROJECT,
    });
  });

  it('use an empty id on resident pages when the route has no params', async () => {
    const getProject = vi.fn().mockResolvedValue(PROJECT);
    const getQueue = vi.fn().mockResolvedValue(QUEUE);
    const getDesign = vi.fn().mockResolvedValue(DESIGN);
    const loaders = signedIn({ getProject, getQueue, getDesign });
    await loaders.newDesign(args());
    await loaders.vote(args());
    await loaders.editor(args());
    await loaders.project(args());
    expect(getProject).toHaveBeenCalledWith('');
    expect(getQueue).toHaveBeenCalledWith('', expect.any(Number));
    expect(getDesign).toHaveBeenCalledWith('');
  });

  it('start the ground for the 3D view beside the project, so it is not fetched after three.js', async () => {
    const getTerrain = vi.fn().mockReturnValue(new Promise(() => undefined));
    const loaders = loadersWith(
      fakeApi({ getTerrain, getDesign: vi.fn().mockResolvedValue(DESIGN) }),
    );
    await loaders.designView(args({ designId: 'd1' }));
    expect(getTerrain).toHaveBeenCalledWith('jrp');
  });

  it('use an empty id when the route has no params', async () => {
    const getProject = vi.fn().mockResolvedValue(PROJECT);
    const loaders = loadersWith(
      fakeApi({ getProject, getDesign: vi.fn().mockResolvedValue(DESIGN) }),
    );
    await loaders.gallery(args());
    await loaders.leaderboard(args());
    await loaders.designView(args());
    expect(getProject).toHaveBeenCalledWith('');
  });
});
