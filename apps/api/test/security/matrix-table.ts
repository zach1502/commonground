import { BLANK, JONATHAN_ROGERS_OUTLINE, projectBody, thumbnailPath } from '../fixtures.js';
import { BOB } from '../harness.js';

import { PNG_BASE64, type Role, type World } from './world.js';

export type Expected = Readonly<Record<Role, number>>;

/** One probe of a route: its target, its minimal valid body and the status each role gets. */
export interface MatrixCase {
  readonly name: string;
  /** The id the path or body names; built once per case and shared by every role. */
  readonly target?: (world: World) => string | Promise<string>;
  /** The path id when the target goes in the body instead, such as a fork's project. */
  readonly pathTarget?: (world: World) => string;
  readonly body?: (id: string) => unknown;
  readonly expected: Expected;
  /** A's private work: B and staff must get the same answer as for an id that does not exist. */
  readonly privacy?: 'private';
  /** Sign in again for the call, for routes that end the session. */
  readonly session?: 'fresh';
}

const all = (status: number): Expected => ({
  guest: status,
  residentA: status,
  residentB: status,
  staff: status,
});
const as = (guest: number, residentA: number, residentB: number, staff: number): Expected => ({
  guest,
  residentA,
  residentB,
  staff,
});

const signedIn = as(401, 200, 200, 200);
const staffOnly = as(401, 403, 403, 200);
const draft = (world: World) => world.draftId;
const live = (world: World) => world.liveId;
const project = (world: World) => world.projectId;
const ownComment = (world: World) => world.commentId;
const draftSave = () => ({ title: 'Lane', blurb: '', document: BLANK });
const vote = (id: string) => ({ designId: id, value: 1, reasons: [] });
const voteChange = () => ({ value: -1, reasons: ['water'], comment: 'More shade.' });
const voteWrite = (body?: () => unknown): readonly MatrixCase[] => [
  {
    name: "A's live design",
    target: live,
    ...(body === undefined ? {} : { body }),
    expected: as(401, 403, 200, 200),
  },
  {
    name: "A's draft",
    target: draft,
    ...(body === undefined ? {} : { body }),
    expected: as(401, 403, 404, 404),
    privacy: 'private',
  },
];

const newComment = () => ({ elementId: 'garden-1', kind: 'keep', text: 'Keep the beds.' });

const exportCase: readonly MatrixCase[] = [
  { name: 'staff export', target: project, expected: staffOnly },
];

/** The plan's access rules, one row per operationId in apps/api/openapi.json. */
export const MATRIX: Readonly<Record<string, readonly MatrixCase[]>> = {
  login: [{ name: 'persona', body: () => ({ persona: BOB }), expected: all(200) }],
  logout: [{ name: 'own session', session: 'fresh', expected: all(204) }],
  listPersonas: [{ name: 'public', expected: all(200) }],
  getHealth: [{ name: 'public', expected: all(200) }],
  getReady: [{ name: 'public', expected: all(200) }],
  getMe: [{ name: 'own', expected: signedIn }],
  saveSelfReport: [
    { name: 'own', body: () => ({ fsa: 'V5T', ageBand: '30-44' }), expected: signedIn },
  ],
  listProjects: [{ name: 'public', expected: all(200) }],
  createProject: [
    { name: 'staff only', body: () => projectBody(), expected: as(401, 403, 403, 201) },
  ],
  getProject: [{ name: 'public', target: project, expected: all(200) }],
  setProjectStatus: [
    {
      name: 'staff only',
      target: async (world) => world.freshProject(),
      body: () => ({ status: 'closed' }),
      expected: staffOnly,
    },
  ],
  getProjectBaseline: [{ name: 'signed in, author hidden', target: project, expected: signedIn }],
  getProjectTerrain: [{ name: 'public', target: project, expected: all(200) }],
  getProjectContext: [{ name: 'public', target: project, expected: all(200) }],
  listDesigns: [{ name: 'public gallery', target: project, expected: all(200) }],
  getLeaderboard: [{ name: 'public', target: project, expected: all(200) }],
  getQueue: [{ name: 'signed in', target: project, expected: signedIn }],
  getInsights: [{ name: 'staff only', target: project, expected: staffOnly }],
  exportInsightsCsv: exportCase,
  exportInsightsGeoJson: exportCase,
  exportInsightsDxf: exportCase,
  getProjectSummary: [{ name: 'staff only', target: project, expected: staffOnly }],
  describeIntent: [
    { name: 'signed in', target: project, body: () => ({ text: 'a pond' }), expected: signedIn },
  ],
  loadTerrain: [
    {
      name: 'staff only',
      body: () => ({ polygonWgs84: JONATHAN_ROGERS_OUTLINE, resolutionM: 2 }),
      expected: as(401, 403, 403, 201),
    },
  ],
  loadSiteFeatures: [
    { name: 'staff only', body: () => ({ parkName: 'Jonathan Rogers Park' }), expected: staffOnly },
  ],
  createDesign: [
    {
      name: 'blank',
      target: project,
      body: () => ({ from: 'blank' }),
      expected: as(401, 201, 201, 201),
    },
    {
      name: "fork of A's draft",
      target: draft,
      pathTarget: project,
      body: (id) => ({ from: 'fork', sourceDesignId: id }),
      expected: as(401, 409, 404, 404),
      privacy: 'private',
    },
  ],
  getDesign: [
    { name: "A's draft", target: draft, expected: as(404, 200, 404, 404), privacy: 'private' },
    { name: "A's live design", target: live, expected: all(200) },
    { name: 'baseline', target: (world) => world.baselineId, expected: as(404, 200, 200, 200) },
  ],
  saveDesign: [
    {
      name: "A's draft",
      target: draft,
      body: draftSave,
      expected: as(401, 200, 404, 404),
      privacy: 'private',
    },
    { name: "A's live design", target: live, body: draftSave, expected: as(401, 409, 403, 403) },
    {
      name: 'baseline',
      target: (world) => world.baselineId,
      body: draftSave,
      expected: as(401, 403, 403, 200),
    },
  ],
  submitDesign: [
    {
      name: "A's blank draft",
      target: async (world) => world.freshDraft(),
      expected: as(401, 200, 404, 404),
      privacy: 'private',
    },
  ],
  setDesignThumbnail: [
    {
      name: "A's draft",
      target: draft,
      body: () => ({ image: PNG_BASE64 }),
      expected: as(401, 200, 404, 404),
      privacy: 'private',
    },
    {
      name: "A's live design",
      target: live,
      body: () => ({ image: PNG_BASE64 }),
      expected: as(401, 200, 403, 403),
    },
  ],
  versionDesign: [
    {
      name: "A's live design",
      target: async (world) => world.freshLive(),
      expected: as(401, 201, 403, 403),
    },
    { name: "A's draft", target: draft, expected: as(401, 409, 404, 404), privacy: 'private' },
  ],
  getMyVote: [
    { name: "A's live design", target: live, expected: signedIn },
    { name: "A's draft", target: draft, expected: as(401, 200, 404, 404), privacy: 'private' },
  ],
  setMyVote: voteWrite(voteChange),
  withdrawMyVote: voteWrite(),
  listDesignComments: [
    { name: "A's live design", target: live, expected: all(200) },
    { name: "A's draft", target: draft, expected: all(404), privacy: 'private' },
  ],
  createComment: [
    { name: "A's live design", target: live, body: newComment, expected: as(401, 201, 201, 201) },
    {
      name: "A's draft",
      target: draft,
      body: newComment,
      expected: as(401, 404, 404, 404),
      privacy: 'private',
    },
  ],
  editComment: [
    {
      name: "A's comment",
      target: ownComment,
      body: () => ({ text: 'Keep the beds by the lane.' }),
      expected: as(401, 200, 404, 404),
      privacy: 'private',
    },
  ],
  resolveComment: [
    { name: 'staff only', target: ownComment, body: () => ({}), expected: staffOnly },
  ],
  hideComment: [
    {
      name: 'staff only',
      target: ownComment,
      body: () => ({ hidden: false }),
      expected: staffOnly,
    },
  ],
  getElementFeedback: [{ name: 'staff only', target: project, expected: staffOnly }],
  exportElementCommentsCsv: exportCase,
  castVote: [
    { name: "A's live design", target: live, body: vote, expected: as(401, 403, 200, 200) },
    {
      name: "A's draft",
      target: draft,
      body: vote,
      expected: as(401, 403, 404, 404),
      privacy: 'private',
    },
  ],
};

/** Routes outside the OpenAPI document that still answer: the blob reader. */
export const EXTRA_ROUTES: readonly {
  readonly path: (id: string) => string;
  readonly cases: readonly MatrixCase[];
}[] = [
  {
    path: (id) => thumbnailPath(id, PNG_BASE64),
    cases: [
      {
        name: "A's draft thumbnail",
        target: draft,
        expected: as(404, 200, 404, 404),
        privacy: 'private',
      },
      { name: "A's live thumbnail", target: live, expected: all(200) },
    ],
  },
];
