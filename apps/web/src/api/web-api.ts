import { ApiRequestError, type ApiClient, type components } from '@parkshape/api-client';
import {
  siteContextSchema,
  type DesignDocument,
  type Heightmap,
  type SiteContext,
} from '@parkshape/core';

import { staffCalls, type StaffApi } from './staff-api';
import { heightmapOf } from './terrain';

type Schemas = components['schemas'];
export type User = Schemas['User'];
export type Role = User['role'];
export type Persona = Schemas['Persona'];
export type PersonaList = Schemas['PersonaList'];
export type Project = Schemas['Project'];
export type SelfReportAnswers = Schemas['SelfReport'];
export type Design = Schemas['Design'];
export type DesignSummary = Schemas['DesignSummary'];
export type SoftWarning = Schemas['SoftWarning'];
export type HardFailure = Schemas['HardFailure'];
export type Queue = Schemas['Queue'];
export type QueuePoster = Schemas['QueuePoster'];
export type Leaderboard = Schemas['Leaderboard'];
export type LeaderboardEntry = Leaderboard['entries'][number];
export type VoteResult = Schemas['VoteResult'];
export type MyVote = Schemas['MyVote'];
export type VoteValue = Schemas['VoteBody']['value'];
export type VoteReason = Schemas['VoteBody']['reasons'][number];
export type WithdrawResult = Schemas['WithdrawResult'];
export interface CastVoteInput {
  readonly designId: string;
  readonly value: VoteValue;
  readonly reasons: readonly VoteReason[];
}
/** The whole vote a change stores: the direction, the reasons and the comment, or null for none. */
export interface SetVoteInput extends CastVoteInput {
  readonly comment: string | null;
}
export interface DraftInput {
  readonly title: string;
  readonly blurb: string;
  readonly document: DesignDocument;
  /** The updatedAt this tab last saw; the save goes through only if the server still has it. */
  readonly expectedUpdatedAt?: string;
}
/** A save that went through, or the version someone saved after the stamp this tab sent. */
export type DraftSaveOutcome =
  | { readonly kind: 'saved'; readonly design: Design }
  | { readonly kind: 'changed'; readonly current: Design };
export type DesignStart = 'blank' | 'baseline';

/** What a Describe it draft is made from; the same text and seed give the same layout. */
export interface DescribeInput {
  readonly text: string;
  readonly seed?: number;
}
/** What a submit produced: it went live, hard rules blocked it, or the author hit the live cap. */
export type SubmitOutcome =
  | { readonly kind: 'submitted'; readonly softWarnings: readonly SoftWarning[] }
  | {
      readonly kind: 'blocked';
      readonly hardFailures: readonly HardFailure[];
      readonly softWarnings: readonly SoftWarning[];
    }
  | { readonly kind: 'capReached'; readonly message: string };

const UNAUTHORIZED = 401;
const CONFLICT = 409;
const UNPROCESSABLE = 422;

/** The stored draft in a 409 draftChanged answer, or null for any other error. */
function changedDraft(error: unknown): Design | null {
  if (!(error instanceof ApiRequestError) || error.status !== CONFLICT) return null;
  const body = error.body as Partial<Schemas['DraftChanged']> | undefined;
  return body?.code === 'draftChanged' && body.current !== undefined ? body.current : null;
}

/** The API calls the web app makes, returning domain values. */
export interface WebApi extends StaffApi {
  getMe(): Promise<User | null>;
  /** The personas, and whether staff need the access code to log in. */
  listPersonas(): Promise<PersonaList>;
  login(personaId: string, accessCode?: string): Promise<User>;
  logout(): Promise<void>;
  listProjects(): Promise<readonly Project[]>;
  getProject(id: string): Promise<Project>;
  /** The ground the project's 3D views draw, the same one the server measures on. */
  getTerrain(projectId: string): Promise<Heightmap>;
  /** The streets, sidewalks, stops, bikeways and parking around the parcel, for the 3D views. */
  getContext(projectId: string): Promise<SiteContext>;
  countDesigns(projectId: string): Promise<number>;
  listDesigns(projectId: string): Promise<readonly DesignSummary[]>;
  saveSelfReport(report: SelfReportAnswers): Promise<SelfReportAnswers>;
  createDesign(projectId: string, from: DesignStart): Promise<Design>;
  describeDesign(projectId: string, input: DescribeInput): Promise<Design>;
  getDesign(id: string): Promise<Design>;
  saveDraft(id: string, draft: DraftInput): Promise<DraftSaveOutcome>;
  submitDesign(id: string): Promise<SubmitOutcome>;
  saveThumbnail(id: string, image: string): Promise<Design>;
  makeVersion(id: string): Promise<Design>;
  getQueue(projectId: string, size: number): Promise<Queue>;
  castVote(input: CastVoteInput): Promise<VoteResult>;
  getLeaderboard(projectId: string): Promise<Leaderboard>;
  getMyVote(designId: string): Promise<MyVote>;
  setMyVote(input: SetVoteInput): Promise<VoteResult>;
  withdrawMyVote(designId: string): Promise<WithdrawResult>;
}

type DesignCalls = Pick<
  WebApi,
  | 'createDesign'
  | 'describeDesign'
  | 'getDesign'
  | 'saveDraft'
  | 'submitDesign'
  | 'saveThumbnail'
  | 'makeVersion'
>;

function designCalls(client: ApiClient): DesignCalls {
  return {
    async createDesign(projectId, from) {
      return client.request('post', '/projects/{id}/designs', {
        path: { id: projectId },
        body: { from },
      });
    },
    async describeDesign(projectId, { text, seed }) {
      return client.request('post', '/projects/{id}/designs', {
        path: { id: projectId },
        body: seed === undefined ? { from: 'describe', text } : { from: 'describe', text, seed },
      });
    },
    async getDesign(id) {
      return client.request('get', '/designs/{id}', { path: { id } });
    },
    async saveDraft(id, draft) {
      // The generated polygon type allows exactly 3 points (a known gap in the OpenAPI output),
      // so the core document, which the server parses again, is passed through unchanged.
      const body = draft as unknown as Schemas['SaveDraftBody'];
      try {
        const design = await client.request('put', '/designs/{id}', { path: { id }, body });
        return { kind: 'saved', design };
      } catch (error) {
        const current = changedDraft(error);
        if (current === null) throw error;
        return { kind: 'changed', current };
      }
    },
    async submitDesign(id) {
      try {
        const result = await client.request('post', '/designs/{id}/submit', { path: { id } });
        if (result.hardFailures.length > 0) {
          return {
            kind: 'blocked',
            hardFailures: result.hardFailures,
            softWarnings: result.softWarnings,
          };
        }
        return { kind: 'submitted', softWarnings: result.softWarnings };
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === UNPROCESSABLE) {
          return { kind: 'capReached', message: error.message };
        }
        throw error;
      }
    },
    async saveThumbnail(id, image) {
      return client.request('post', '/designs/{id}/thumbnail', { path: { id }, body: { image } });
    },
    async makeVersion(id) {
      return client.request('post', '/designs/{id}/version', { path: { id } });
    },
  };
}

type ParticipationCalls = Pick<
  WebApi,
  'getQueue' | 'castVote' | 'getLeaderboard' | 'getMyVote' | 'setMyVote' | 'withdrawMyVote'
>;

function participationCalls(client: ApiClient): ParticipationCalls {
  return {
    async getQueue(projectId, size) {
      return client.request('get', '/projects/{id}/queue', {
        path: { id: projectId },
        query: { n: size },
      });
    },
    async castVote({ designId, value, reasons }) {
      return client.request('post', '/votes', {
        body: { designId, value, reasons: [...reasons] },
      });
    },
    async getLeaderboard(projectId) {
      return client.request('get', '/projects/{id}/leaderboard', { path: { id: projectId } });
    },
    async getMyVote(designId) {
      return client.request('get', '/designs/{id}/my-vote', { path: { id: designId } });
    },
    async setMyVote({ designId, value, reasons, comment }) {
      return client.request('put', '/designs/{id}/my-vote', {
        path: { id: designId },
        body: { value, reasons: [...reasons], comment },
      });
    },
    async withdrawMyVote(designId) {
      return client.request('delete', '/designs/{id}/my-vote', { path: { id: designId } });
    },
  };
}

/**
 * One terrain request per project: a loader starts it beside the page data, and the 3D view
 * that mounts later reuses it. A failed request is dropped, so the next caller asks again.
 */
function sharedTerrain(client: ApiClient): Pick<WebApi, 'getTerrain'> {
  const requests = new Map<string, Promise<Heightmap>>();
  return {
    getTerrain(projectId) {
      const known = requests.get(projectId);
      if (known !== undefined) return known;
      const request = client
        .request('get', '/projects/{id}/terrain', { path: { id: projectId } })
        .then(heightmapOf);
      requests.set(projectId, request);
      request.catch(() => requests.delete(projectId));
      return request;
    },
  };
}

/** One context request per project, shared like the terrain; a failure is dropped for a retry. */
function sharedContext(client: ApiClient): Pick<WebApi, 'getContext'> {
  const requests = new Map<string, Promise<SiteContext>>();
  return {
    getContext(projectId) {
      const known = requests.get(projectId);
      if (known !== undefined) return known;
      const request = client
        .request('get', '/projects/{id}/context', { path: { id: projectId } })
        .then((body) => siteContextSchema.parse(body));
      requests.set(projectId, request);
      request.catch(() => requests.delete(projectId));
      return request;
    },
  };
}

export function createWebApi(client: ApiClient): WebApi {
  return {
    ...sharedTerrain(client),
    ...sharedContext(client),
    async getMe() {
      try {
        return (await client.request('get', '/me')).user;
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === UNAUTHORIZED) {
          return null;
        }
        throw error;
      }
    },
    async listPersonas() {
      return client.request('get', '/auth/personas');
    },
    async login(personaId, accessCode) {
      const body =
        accessCode === undefined ? { persona: personaId } : { persona: personaId, accessCode };
      return (await client.request('post', '/auth/login', { body })).user;
    },
    async logout() {
      await client.request('post', '/auth/logout');
    },
    async listProjects() {
      return (await client.request('get', '/projects')).projects;
    },
    async getProject(id) {
      return client.request('get', '/projects/{id}', { path: { id } });
    },
    async countDesigns(projectId) {
      const { designs } = await client.request('get', '/projects/{id}/designs', {
        path: { id: projectId },
      });
      return designs.length;
    },
    async listDesigns(projectId) {
      const { designs } = await client.request('get', '/projects/{id}/designs', {
        path: { id: projectId },
      });
      return designs;
    },
    async saveSelfReport(report) {
      return client.request('patch', '/me/self-report', { body: report });
    },
    ...designCalls(client),
    ...participationCalls(client),
    ...staffCalls(client),
  };
}
