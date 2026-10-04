import type { ApiApp, AppDeps } from '@parkshape/api';
import type { Design } from '@parkshape/db';
import {
  type LeaderboardEntry,
  type SeedBlob,
  type SeedCounts,
  type SeededDesign,
  type SeedGateway,
  type SeedPersona,
  type SeedSite,
} from '@parkshape/db/seed';

/** The API handler and its deps, in the same process as the seed. */
export interface InProcessApi {
  readonly app: ApiApp;
  readonly deps: AppDeps;
}

interface Call {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH';
  readonly path: string;
  readonly as?: SeedPersona;
  readonly body?: unknown;
}

function seededDesign(design: Design): SeededDesign {
  return {
    id: design.id,
    title: design.title,
    authorId: design.authorId,
    status: design.status,
    thumbnailRef: design.thumbnailRef,
    document: design.document as SeededDesign['document'],
  };
}

/**
 * Seeds through the API's own routes, so each submit runs the server's metrics and hard checks
 * and each vote the server's rules. Sessions are signed with the process's own auth provider,
 * because the seeded residents are not sign-in personas.
 */
export class ApiSeedGateway implements SeedGateway {
  private readonly cookies = new Map<string, string>();

  constructor(private readonly api: InProcessApi) {}

  /** Sends one request as a persona and returns the parsed body; any error status throws. */
  async call(request: Call): Promise<unknown> {
    const headers: Record<string, string> = {};
    if (request.as !== undefined) headers.Cookie = await this.cookieFor(request.as);
    if (request.body !== undefined) headers['Content-Type'] = 'application/json';
    const init: RequestInit = { method: request.method, headers };
    if (request.body !== undefined) init.body = JSON.stringify(request.body);
    const response = await this.api.app.request(request.path, init);
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${request.method} ${request.path}: ${String(response.status)} ${text}`);
    }
    return text === '' ? undefined : (JSON.parse(text) as unknown);
  }

  async upsertUser(persona: SeedPersona): Promise<void> {
    await this.api.deps.repos.users.upsert(persona);
  }

  async findProject(name: string) {
    return (await this.api.deps.repos.projects.list()).find((project) => project.name === name);
  }

  async createProject(site: SeedSite, staff: SeedPersona) {
    for (const blob of site.blobs) await this.storeBlob(blob);
    const created = (await this.call({
      method: 'POST',
      path: '/projects',
      as: staff,
      body: {
        name: site.name,
        parameters: site.parameters,
        parcel: site.parcel,
        heightmapRef: site.heightmapRef,
        baselineDocument: site.baseline,
        closesAt: site.closesAt,
      },
    })) as { id: string; baselineDesignId: string | null };
    return { id: created.id, baselineDesignId: created.baselineDesignId };
  }

  /** Reads the blob through the same store the API serves from; a get is the store's one check. */
  async hasBlob(key: string): Promise<boolean> {
    return (await this.api.deps.blobStore.get(key)) !== undefined;
  }

  async storeBlob(blob: SeedBlob): Promise<void> {
    await this.api.deps.blobStore.put(blob.key, blob.bytes, blob.contentType);
  }

  async listDesigns(projectId: string): Promise<SeededDesign[]> {
    const { designs } = this.api.deps.repos;
    const stored = [
      ...(await designs.listByProject(projectId, 'submitted')),
      ...(await designs.listByProject(projectId, 'draft')),
    ];
    return stored.map(seededDesign);
  }

  async submitDesign(submission: Parameters<SeedGateway['submitDesign']>[0]) {
    const { projectId, author, title, blurb, document } = submission;
    const id =
      submission.draftId ??
      (
        (await this.call({
          method: 'POST',
          path: `/projects/${projectId}/designs`,
          as: author,
          body: { from: 'blank', title },
        })) as { id: string }
      ).id;
    await this.call({
      method: 'PUT',
      path: `/designs/${id}`,
      as: author,
      body: { title, blurb, document },
    });
    const outcome = (await this.call({
      method: 'POST',
      path: `/designs/${id}/submit`,
      as: author,
    })) as {
      status: string;
      hardFailures: unknown[];
    };
    if (outcome.status !== 'submitted') {
      throw new Error(`${title} broke a hard rule: ${JSON.stringify(outcome.hardFailures)}`);
    }
    const design = await this.api.deps.repos.designs.findById(id);
    if (design === undefined) throw new Error(`${title} vanished after submit`);
    return seededDesign(design);
  }

  async castVote(vote: Parameters<SeedGateway['castVote']>[0]): Promise<void> {
    const voter = await this.api.deps.repos.users.findById(vote.voterId);
    if (voter === undefined) throw new Error(`Unknown voter ${vote.voterId}`);
    await this.call({
      method: 'POST',
      path: '/votes',
      as: { id: voter.id, displayName: voter.displayName, role: voter.role },
      body: { designId: vote.designId, value: vote.value, reasons: vote.reasons },
    });
  }

  async setSelfReport({ userId, report }: Parameters<SeedGateway['setSelfReport']>[0]) {
    const user = await this.api.deps.repos.users.findById(userId);
    if (user === undefined) throw new Error(`Unknown resident ${userId}`);
    const as = { id: user.id, displayName: user.displayName, role: user.role };
    await this.call({ method: 'PATCH', path: '/me/self-report', as, body: report });
  }

  /** Posts the comment through the comment route, as the resident who wrote it. */
  async addComment(comment: Parameters<SeedGateway['addComment']>[0]): Promise<void> {
    const author = await this.api.deps.repos.users.findById(comment.authorId);
    if (author === undefined) throw new Error(`Unknown commenter ${comment.authorId}`);
    const as = { id: author.id, displayName: author.displayName, role: author.role };
    const { elementId, kind, text } = comment;
    const body = text === '' ? { elementId, kind } : { elementId, kind, text };
    await this.call({ method: 'POST', path: `/designs/${comment.designId}/comments`, as, body });
  }

  /** Stores a WebP or PNG through the thumbnail route, as the design's author. */
  async saveThumbnail(designId: string, author: SeedPersona, image: Uint8Array): Promise<void> {
    const body = { image: Buffer.from(image).toString('base64') };
    await this.call({ method: 'POST', path: `/designs/${designId}/thumbnail`, as: author, body });
  }

  async leaderboard(projectId: string): Promise<LeaderboardEntry[]> {
    const board = (await this.call({
      method: 'GET',
      path: `/projects/${projectId}/leaderboard`,
    })) as {
      entries: { rank: number; score: number; design: { id: string; title: string } }[];
    };
    return board.entries.map(({ rank, score, design }) => ({
      rank,
      score,
      designId: design.id,
      title: design.title,
    }));
  }

  async counts(projectId: string, residents: readonly SeedPersona[]): Promise<SeedCounts> {
    const { repos } = this.api.deps;
    const totals = await repos.votes.totalsForProject(projectId);
    const users = await Promise.all(residents.map(({ id }) => repos.users.findById(id)));
    return {
      designs: (await repos.designs.listByProject(projectId, 'submitted')).length,
      votes: totals.votes,
      voters: totals.uniqueVoters,
      selfReports: users.filter((user) => user?.selfReport != null).length,
    };
  }

  /**
   * Reads the project's site context through the route, which stores it in the blob store, so
   * `pnpm dev:local` has streets and stops with no network. Returns the feature count.
   */
  async warmContext(projectId: string): Promise<number> {
    const context = (await this.call({
      method: 'GET',
      path: `/projects/${projectId}/context`,
    })) as {
      features: unknown[];
    };
    return context.features.length;
  }

  private async cookieFor(persona: SeedPersona): Promise<string> {
    const known = this.cookies.get(persona.id);
    if (known !== undefined) return known;
    const { setCookie } = await this.api.deps.auth.createSession(persona.id, persona.role);
    const cookie = setCookie.split(';')[0] ?? '';
    this.cookies.set(persona.id, cookie);
    return cookie;
  }
}
