export const items = [
  {
    id: 'bench',
    geometryKind: 'point',
    footprint: { widthM: 1.8, depthM: 0.6 },
    modelKey: 'bench-wood',
    scalePolicy: 'fixed',
  },
  {
    id: 'path-gravel',
    geometryKind: 'linear',
    footprint: { widthM: 2 },
    modelKey: 'path-gravel',
    scalePolicy: 'segment',
  },
  {
    id: 'community-garden',
    geometryKind: 'area',
    footprint: {
      minAreaM2: 40,
      defaultAreaM2: 160,
      module: { kind: 'raised-bed', widthM: 1.2, depthM: 3, aisleM: 0.6 },
    },
    modelKey: 'community-garden',
    scalePolicy: 'tile',
  },
  {
    id: 'douglas-fir',
    geometryKind: 'point',
    footprint: { widthM: 0.6, depthM: 0.6 },
    heightM: 35,
    crownRadiusMatureM: 6,
    modelKey: 'tree-douglas-fir',
    scalePolicy: 'fixed',
  },
];
