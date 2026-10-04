import { describe, expect, it } from 'vitest';

import { metres } from '@parkshape/core';

import type { ElementCommentRepository, OpenComment } from '../element-comment-repository.js';
import type { RepositoryDeps } from '../records.js';
import { MissingReferenceError, PhaseClosedError, type Repositories } from '../repositories.js';

import { MINUTE_MS, makeWorld, seedDraft, seedProject, seedUser, uncapped } from './fixtures.js';

/** Repositories over one store, with the element comment repository beside them. */
export type ElementCommentReposFactory = (
  deps: RepositoryDeps,
) => Promise<Repositories & { readonly elementComments: ElementCommentRepository }>;

async function withSubmittedDesign(factory: ElementCommentReposFactory) {
  let comments: ElementCommentRepository | undefined;
  const world = await makeWorld(async (deps) => {
    const repos = await factory(deps);
    comments = repos.elementComments;
    return repos;
  });
  if (comments === undefined) throw new Error('factory gave no element comment repository');
  const { repos } = world;
  const author = await seedUser(repos, 'author');
  const resident = await seedUser(repos, 'resident');
  const project = await seedProject(repos);
  const draft = await seedDraft(repos, project.id, author.id);
  await repos.designs.submit(draft.id, uncapped({}));
  const bench: OpenComment = {
    designId: draft.id,
    authorId: resident.id,
    elementId: 'bench-1',
    elementKind: 'item',
    category: 'seating',
    kind: 'move',
    text: 'Face the playground',
  };
  return { ...world, comments, author, resident, project, design: draft, bench };
}

function changed(result: Awaited<ReturnType<ElementCommentRepository['edit']>>) {
  if (result.kind !== 'changed') throw new Error(`the write returned ${result.kind}`);
  return result.comment;
}

function upsertContract(name: string, factory: ElementCommentReposFactory): void {
  describe(`${name} meets the ElementCommentRepository contract: upsert`, () => {
    it('creates an open, visible comment stamped by the clock', async () => {
      const { comments, bench, clock } = await withSubmittedDesign(factory);
      const { comment, outcome } = await comments.upsertOpen(bench);
      expect(outcome).toBe('created');
      expect(comment).toMatchObject({ ...bench, status: 'open', hidden: false });
      expect(comment.createdAt).toBe(clock.now().toISOString());
      expect(comment.plannerReply).toBeUndefined();
    });

    it('keeps one open comment per author, element and kind', async () => {
      const { comments, bench, clock, design } = await withSubmittedDesign(factory);
      const first = await comments.upsertOpen(bench);
      clock.advance(MINUTE_MS);
      const second = await comments.upsertOpen({ ...bench, text: 'Face south' });
      expect(second.outcome).toBe('updated');
      expect(second.comment.id).toBe(first.comment.id);
      expect(second.comment.text).toBe('Face south');
      expect(second.comment.createdAt).toBe(first.comment.createdAt);
      expect(await comments.listByDesign(design.id, { hidden: 'include' })).toHaveLength(1);
    });

    it('adds a row for another kind, another author or after a resolve', async () => {
      const { comments, bench, author, design } = await withSubmittedDesign(factory);
      const first = await comments.upsertOpen(bench);
      await comments.upsertOpen({ ...bench, kind: 'keep' });
      await comments.upsertOpen({ ...bench, authorId: author.id });
      await comments.resolve({ commentId: first.comment.id });
      const again = await comments.upsertOpen(bench);
      expect(again.outcome).toBe('created');
      expect(await comments.listByDesign(design.id, { hidden: 'include' })).toHaveLength(4);
    });

    it('keeps the surface point of a path comment', async () => {
      const { comments, bench } = await withSubmittedDesign(factory);
      const surfacePoint = { x: metres(4), y: metres(5.5) };
      const path = {
        ...bench,
        elementId: 'walk-1',
        elementKind: 'path',
        category: 'path',
      } as const;
      const { comment } = await comments.upsertOpen({ ...path, surfacePoint });
      expect(comment.surfacePoint).toEqual(surfacePoint);
    });
  });
}

function guardContract(name: string, factory: ElementCommentReposFactory): void {
  describe(`${name} meets the ElementCommentRepository contract: guards`, () => {
    it('refuses an unknown design', async () => {
      const { comments, bench } = await withSubmittedDesign(factory);
      await expect(comments.upsertOpen({ ...bench, designId: 'nope' })).rejects.toBeInstanceOf(
        MissingReferenceError,
      );
    });

    it('writes nothing once the project closes', async () => {
      const { comments, bench, repos, project, design } = await withSubmittedDesign(factory);
      await repos.projects.setStatus(project.id, 'closed');
      await expect(comments.upsertOpen(bench)).rejects.toBeInstanceOf(PhaseClosedError);
      expect(await comments.listByDesign(design.id, { hidden: 'include' })).toEqual([]);
    });
  });
}

function editAndModerateContract(name: string, factory: ElementCommentReposFactory): void {
  describe(`${name} meets the ElementCommentRepository contract: edit and moderate`, () => {
    it('finds a comment by id, hidden or not, and nothing for an unknown id', async () => {
      const { comments, bench } = await withSubmittedDesign(factory);
      const { comment } = await comments.upsertOpen(bench);
      expect(await comments.findById(comment.id)).toEqual(comment);
      const hidden = changed(await comments.setHidden({ commentId: comment.id, hidden: true }));
      expect(await comments.findById(comment.id)).toEqual(hidden);
      expect(await comments.findById('nope')).toBeUndefined();
    });

    it('edits the text, and answers missing for an unknown id', async () => {
      const { comments, bench } = await withSubmittedDesign(factory);
      const { comment } = await comments.upsertOpen(bench);
      const edited = changed(await comments.edit({ commentId: comment.id, text: 'Turn it' }));
      expect(edited).toMatchObject({ id: comment.id, text: 'Turn it' });
      expect(await comments.edit({ commentId: 'nope', text: 'x' })).toEqual({ kind: 'missing' });
    });

    it('refuses an edit once the project closes', async () => {
      const { comments, bench, repos, project } = await withSubmittedDesign(factory);
      const { comment } = await comments.upsertOpen(bench);
      await repos.projects.setStatus(project.id, 'closed');
      await expect(comments.edit({ commentId: comment.id, text: 'x' })).rejects.toBeInstanceOf(
        PhaseClosedError,
      );
    });

    it('resolves with a reply after close, and keeps the reply on a later resolve', async () => {
      const { comments, bench, repos, project, clock } = await withSubmittedDesign(factory);
      const { comment } = await comments.upsertOpen(bench);
      await repos.projects.setStatus(project.id, 'closed');
      clock.advance(MINUTE_MS);
      const reply = 'We moved it.';
      const resolved = changed(await comments.resolve({ commentId: comment.id, reply }));
      const plannerReply = { text: reply, repliedAt: clock.now().toISOString() };
      expect(resolved).toMatchObject({ status: 'resolved', plannerReply });
      const again = changed(await comments.resolve({ commentId: comment.id }));
      expect(again.plannerReply).toEqual(plannerReply);
      expect(await comments.resolve({ commentId: 'nope' })).toEqual({ kind: 'missing' });
    });

    it('hides a comment from resident lists and from the counts', async () => {
      const { comments, bench, design, project } = await withSubmittedDesign(factory);
      const { comment } = await comments.upsertOpen(bench);
      await comments.upsertOpen({ ...bench, kind: 'keep' });
      changed(await comments.setHidden({ commentId: comment.id, hidden: true }));
      const visible = await comments.listByDesign(design.id, { hidden: 'exclude' });
      expect(visible.map((entry) => entry.kind)).toEqual(['keep']);
      expect(await comments.listByDesign(design.id, { hidden: 'include' })).toHaveLength(2);
      expect(await comments.countsByProject(project.id)).toEqual([
        { designId: design.id, elementKind: 'item', kind: 'keep', count: 1 },
      ]);
      const shown = changed(await comments.setHidden({ commentId: comment.id, hidden: false }));
      expect(shown.hidden).toBe(false);
    });
  });
}

function listContract(name: string, factory: ElementCommentReposFactory): void {
  describe(`${name} meets the ElementCommentRepository contract: lists`, () => {
    it('lists oldest first, then by id, and groups a project by design', async () => {
      const world = await withSubmittedDesign(factory);
      const { comments, bench, clock, repos, project, author } = world;
      const other = await seedDraft(repos, project.id, author.id);
      await repos.designs.submit(other.id, uncapped({}));
      const later = await comments.upsertOpen({ ...bench, kind: 'remove' });
      const sameTime = await comments.upsertOpen({ ...bench, kind: 'keep' });
      clock.advance(-MINUTE_MS);
      const earlier = await comments.upsertOpen({ ...bench, kind: 'question' });
      const onOther = await comments.upsertOpen({ ...bench, designId: other.id });
      const byDesign = await comments.listByDesign(world.design.id, { hidden: 'exclude' });
      const tied = [later, sameTime].map((entry) => entry.comment.id).sort();
      expect(byDesign.map((entry) => entry.id)).toEqual([earlier.comment.id, ...tied]);
      const byProject = await comments.listByProject(project.id, { hidden: 'exclude' });
      const designOrder = [world.design.id, other.id].sort();
      expect([...new Set(byProject.map((entry) => entry.designId))]).toEqual(designOrder);
      expect(byProject).toContainEqual(onOther.comment);
    });

    it('counts per design, element kind and comment kind', async () => {
      const { comments, bench, project, design, author } = await withSubmittedDesign(factory);
      await comments.upsertOpen(bench);
      await comments.upsertOpen({ ...bench, authorId: author.id });
      await comments.upsertOpen({
        ...bench,
        kind: 'change',
        elementKind: 'area',
        category: 'garden',
      });
      expect(await comments.countsByProject(project.id)).toEqual([
        { designId: design.id, elementKind: 'item', kind: 'move', count: 2 },
        { designId: design.id, elementKind: 'area', kind: 'change', count: 1 },
      ]);
    });
  });
}

/**
 * Behaviour every ElementCommentRepository adapter must have. Each adapter test calls this with
 * a factory over a fresh store.
 */
export function elementCommentRepositoryContract(
  name: string,
  factory: ElementCommentReposFactory,
): void {
  upsertContract(name, factory);
  guardContract(name, factory);
  editAndModerateContract(name, factory);
  listContract(name, factory);
}
