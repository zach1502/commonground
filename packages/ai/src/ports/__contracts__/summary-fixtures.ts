import type { SummaryInput } from '../../types.js';

/** Four top designs that split on trees against play and on garden against sports. */
export const SUMMARY_INPUT: SummaryInput = {
  topDesigns: [
    {
      id: 'design-a',
      score: 0.8,
      categoryCounts: { tree: 9, path: 2, seating: 3, water: 1 },
    },
    {
      id: 'design-b',
      score: 0.7,
      categoryCounts: { play: 3, seating: 4, path: 1, sports: 1 },
    },
    {
      id: 'design-c',
      score: 0.6,
      categoryCounts: { tree: 5, garden: 1, path: 1, seating: 2 },
    },
    {
      id: 'design-d',
      score: 0.5,
      categoryCounts: { dog: 1, tree: 2, play: 1, path: 1 },
    },
  ],
  insights: { designs: 7, votes: 41, uniqueVoters: 12 },
  reasonCounts: { trees: 14, play: 9, 'dog-area': 4, 'too-paved': 2 },
  elementFeedback: { comments: 0, topElements: [] },
};

/** The same designs once residents have left 6 comments on elements, most on benches. */
export const COMMENTED_SUMMARY_INPUT: SummaryInput = {
  ...SUMMARY_INPUT,
  elementFeedback: {
    comments: 6,
    topElements: [
      { label: 'Bench', comments: 3 },
      { label: 'Gravel path', comments: 2 },
    ],
  },
};

export const EMPTY_SUMMARY_INPUT: SummaryInput = {
  topDesigns: [],
  insights: { designs: 0, votes: 0, uniqueVoters: 0 },
  reasonCounts: {},
  elementFeedback: { comments: 0, topElements: [] },
};
