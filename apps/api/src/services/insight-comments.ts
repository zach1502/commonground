import type { Design, Repositories, Vote } from '@parkshape/db';

import type { InsightsBody } from '../contracts/insights.js';

type VoteComments = InsightsBody['comments'];

async function displayNames(repos: Repositories, userIds: readonly string[]) {
  const users = await Promise.all([...new Set(userIds)].map((id) => repos.users.findById(id)));
  return new Map(
    users.flatMap((user) => (user === undefined ? [] : [[user.id, user.displayName]])),
  );
}

const newestFirst = (a: Vote, b: Vote) => b.updatedAt.getTime() - a.updatedAt.getTime();

/**
 * The comments voters left on live designs, under each design in the order the designs came,
 * newest first, with the voter's display name. Designs with no comment are left out.
 */
export async function voteComments(
  repos: Repositories,
  live: readonly Pick<Design, 'id' | 'title'>[],
  votes: readonly Vote[],
): Promise<VoteComments> {
  const commented = votes.filter((vote) => vote.comment !== null);
  const names = await displayNames(
    repos,
    commented.map((vote) => vote.userId),
  );
  const byDesign = live.flatMap((design) => {
    const comments = commented
      .filter((vote) => vote.designId === design.id)
      .sort(newestFirst)
      .map((vote) => ({
        voteId: vote.id,
        displayName: names.get(vote.userId) ?? '',
        text: vote.comment ?? '',
        updatedAt: vote.updatedAt.toISOString(),
      }));
    return comments.length === 0 ? [] : [{ designId: design.id, title: design.title, comments }];
  });
  return { total: byDesign.reduce((sum, design) => sum + design.comments.length, 0), byDesign };
}
