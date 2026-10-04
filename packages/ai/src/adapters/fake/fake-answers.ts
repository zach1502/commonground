/** Canned answers by schema name. The intent is the dog park sentence from the contract test. */
export const FAKE_ANSWERS: Readonly<Record<string, unknown>> = {
  'contract-probe': { answer: 'ok' },
  'park-summary': { themes: [], tradeoffs: [] },
  'park-intent': {
    features: [
      { category: 'dog', catalogId: 'off-leash-area', count: 1, placement: { zone: 'south-east' } },
      { catalogId: 'pond', count: 1, placement: { terrain: 'low' } },
      { category: 'tree', count: 8 },
    ],
    paths: { style: 'loop' },
    canopy: 'maximize',
    character: 'natural',
  },
};
