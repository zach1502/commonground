import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { ApiRequestError, createApiClient } from '@parkshape/api-client';

import { apiServer, TEST_API_URL } from '../../test/api-server';
import { commentOf } from '../../test/review-fixtures';

import { createReviewApi } from './review-api';

const comment = commentOf({ id: 'c1', kind: 'move', text: 'Face the playground' });
const group = {
  elementId: 'bench-1',
  elementKind: 'item',
  category: 'seating',
  label: 'Bench, south-west',
  counts: { keep: 0, move: 1, change: 0, remove: 0, question: 0 },
  openCount: 1,
  comments: [comment],
};

const api = createReviewApi(createApiClient({ baseUrl: TEST_API_URL }));

describe('createReviewApi', () => {
  it('reads the comments on a design, grouped by element', async () => {
    apiServer.use(
      http.get(`${TEST_API_URL}/designs/d1/comments`, () =>
        HttpResponse.json({ designId: 'd1', commenting: 'open', elements: [group] }),
      ),
    );
    const listed = await api.listComments('d1');
    expect(listed.elements[0]?.comments).toEqual([comment]);
    expect(listed.commenting).toBe('open');
  });

  it('posts a new comment and passes on the outcome', async () => {
    let sent: unknown;
    apiServer.use(
      http.post(`${TEST_API_URL}/designs/d1/comments`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ outcome: 'created', comment }, { status: 201 });
      }),
    );
    const added = await api.addComment('d1', { elementId: 'bench-1', kind: 'move', text: 'Hi' });
    expect(sent).toEqual({ elementId: 'bench-1', kind: 'move', text: 'Hi' });
    expect(added).toEqual({ outcome: 'created', comment });
  });

  it('edits the text of a comment by its id', async () => {
    let sent: unknown;
    apiServer.use(
      http.patch(`${TEST_API_URL}/comments/c1`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ comment: { ...comment, text: 'Closer to the swings' } });
      }),
    );
    const edited = await api.editComment('c1', { text: 'Closer to the swings' });
    expect(sent).toEqual({ text: 'Closer to the swings' });
    expect(edited.text).toBe('Closer to the swings');
  });
});

describe('createReviewApi for planners', () => {
  it('resolves with a reply and hides for planners', async () => {
    const bodies: unknown[] = [];
    apiServer.use(
      http.post(`${TEST_API_URL}/comments/c1/resolve`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ comment: { ...comment, status: 'resolved' } });
      }),
      http.post(`${TEST_API_URL}/comments/c1/hide`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ comment: { ...comment, hidden: true } });
      }),
    );
    expect((await api.resolveComment('c1', 'We turned it.')).status).toBe('resolved');
    expect((await api.hideComment('c1', { hidden: true })).hidden).toBe(true);
    expect(bodies).toEqual([{ reply: 'We turned it.' }, { hidden: true }]);
  });

  it('reads the element feedback counts of a project', async () => {
    const feedback = { total: 0, designs: [] };
    apiServer.use(
      http.get(`${TEST_API_URL}/projects/jrp/insights/element-feedback`, () =>
        HttpResponse.json(feedback),
      ),
    );
    expect(await api.elementFeedback('jrp')).toEqual(feedback);
  });
});

describe('createReviewApi refusals', () => {
  it('throws the API error kind on a refusal', async () => {
    apiServer.use(
      http.post(`${TEST_API_URL}/designs/d1/comments`, () =>
        HttpResponse.json(
          { error: { kind: 'phase-closed', message: 'Closed', requestId: 'r1' } },
          { status: 409 },
        ),
      ),
    );
    const sending = api.addComment('d1', { elementId: 'bench-1', kind: 'keep', text: '' });
    await expect(sending).rejects.toBeInstanceOf(ApiRequestError);
    await expect(sending).rejects.toMatchObject({ status: 409, kind: 'phase-closed' });
  });
});
