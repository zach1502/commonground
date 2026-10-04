import { part, surfacePad, type Part } from './parts.js';
import type { Dims } from './targets.js';

const HALF = 0.5;
const SWING = {
  postM: 0.12,
  beamM: 0.14,
  seats: 3,
  seatWidthM: 0.5,
  seatDepthM: 0.25,
  seatM: 0.05,
  seatY: 0.45,
  ropeM: 0.03,
  frameInset: 0.35,
};
const DECK = { sideM: 3, heightM: 1.5, slabM: 0.12, postM: 0.14, roofM: 0.4, roofGap: 0.9 };
const SLIDE = { steps: 7, widthM: 0.8, stepM: 0.08 };
const CLIMB = { widthM: 2, heightM: 2.2, rungs: 4, rungM: 0.06, postM: 0.1 };
const COURT = {
  slabM: 0.05,
  poleM: 0.15,
  boardM: 1.2,
  boardDepthM: 0.1,
  boardHeightM: 0.9,
  rimM: 0.45,
  rimHeightM: 0.05,
  inset: 1,
};
const NET = { depthM: 0.04, postM: 0.08 };
// Spray jets stand in a ring on the pad; the ring radius is a share of the shorter side.
const SPRAY = { jets: 5, jetM: 0.2, ringShare: 0.3 };
const HALF_TURNS_PER_TURN = 2;
const FULL_TURN_RAD = Math.PI * HALF_TURNS_PER_TURN;

function swingsParts(dims: Dims): Part[] {
  const { widthM, depthM, heightM } = dims;
  const endX = (widthM - SWING.postM) * HALF;
  const legZ = depthM * SWING.frameInset;
  const legs = [-endX, endX].flatMap((x) =>
    [-legZ, legZ].map((z) =>
      part({
        shape: 'cylinder',
        widthM: SWING.postM,
        depthM: SWING.postM,
        heightM: heightM - SWING.beamM,
        x,
        z,
        colour: 'wood',
      }),
    ),
  );
  const beam = part({
    shape: 'box',
    widthM,
    depthM: SWING.beamM,
    heightM: SWING.beamM,
    baseY: heightM - SWING.beamM,
    colour: 'wood',
  });
  const spacing = widthM / (SWING.seats + 1);
  const seats = Array.from(
    { length: SWING.seats },
    (_, index) => spacing * (index + 1) - widthM * HALF,
  ).flatMap((x) => [
    part({
      shape: 'box',
      widthM: SWING.seatWidthM,
      depthM: SWING.seatDepthM,
      heightM: SWING.seatM,
      x,
      baseY: SWING.seatY,
      colour: 'seat',
    }),
    ...[-1, 1].map((side) =>
      part({
        shape: 'cylinder',
        widthM: SWING.ropeM,
        depthM: SWING.ropeM,
        heightM: heightM - SWING.beamM - SWING.seatY - SWING.seatM,
        x: x + side * (SWING.seatWidthM - SWING.ropeM) * HALF,
        baseY: SWING.seatY + SWING.seatM,
        colour: 'metal',
      }),
    ),
  ]);
  return [surfacePad(dims, 'mulch'), ...legs, beam, ...seats];
}

function slideSteps(deckX: number, depthM: number, lengthM: number): Part[] {
  const run = lengthM / SLIDE.steps;
  const drop = DECK.heightM / SLIDE.steps;
  const width = Math.min(SLIDE.widthM, depthM);
  return Array.from({ length: SLIDE.steps }, (_, index) =>
    part({
      shape: 'box',
      widthM: run,
      depthM: width,
      heightM: SLIDE.stepM,
      x: deckX + run * (index + HALF),
      baseY: Math.max(DECK.heightM - drop * (index + 1), 0),
      colour: 'slide',
    }),
  );
}

function playgroundParts(dims: Dims): Part[] {
  const { widthM, depthM, heightM } = dims;
  const side = Math.min(DECK.sideM, depthM);
  const deckX = -widthM * HALF + side * HALF;
  const postOffset = (side - DECK.postM) * HALF;
  const roofBase = heightM - DECK.roofM;
  const posts = [-postOffset, postOffset].flatMap((dx) =>
    [-postOffset, postOffset].map((z) =>
      part({
        shape: 'cylinder',
        widthM: DECK.postM,
        depthM: DECK.postM,
        heightM: roofBase,
        x: deckX + dx,
        z,
        colour: 'wood',
      }),
    ),
  );
  return [
    surfacePad(dims, 'mulch'),
    ...posts,
    part({
      shape: 'box',
      widthM: side,
      depthM: side,
      heightM: DECK.slabM,
      x: deckX,
      baseY: DECK.heightM,
      colour: 'wood',
    }),
    part({
      shape: 'box',
      widthM: side * DECK.roofGap,
      depthM: side * DECK.roofGap,
      heightM: DECK.roofM,
      x: deckX,
      baseY: roofBase,
      colour: 'roof',
    }),
    ...slideSteps(deckX + side * HALF, depthM, widthM - side - CLIMB.widthM),
    ...climbingFrame(widthM * HALF - CLIMB.widthM * HALF),
  ];
}

/** Two posts and a ladder of rungs at the far end of the play structure. */
function climbingFrame(x: number): Part[] {
  const postX = (CLIMB.widthM - CLIMB.postM) * HALF;
  const posts = [-postX, postX].map((dx) =>
    part({
      shape: 'cylinder',
      widthM: CLIMB.postM,
      depthM: CLIMB.postM,
      heightM: CLIMB.heightM,
      x: x + dx,
      colour: 'wood',
    }),
  );
  const rungs = Array.from({ length: CLIMB.rungs }, (_, index) =>
    part({
      shape: 'box',
      widthM: CLIMB.widthM,
      depthM: CLIMB.rungM,
      heightM: CLIMB.rungM,
      x,
      baseY: (CLIMB.heightM * (index + 1)) / (CLIMB.rungs + 1),
      colour: 'slide',
    }),
  );
  return [...posts, ...rungs];
}

function slab({ widthM, depthM }: Dims): Part {
  return part({ shape: 'box', widthM, depthM, heightM: COURT.slabM, colour: 'court' });
}

function halfCourtParts(dims: Dims): Part[] {
  const backX = -dims.widthM * HALF + COURT.inset;
  const boardY = dims.heightM - COURT.boardHeightM;
  return [
    slab(dims),
    part({
      shape: 'cylinder',
      widthM: COURT.poleM,
      depthM: COURT.poleM,
      heightM: dims.heightM,
      x: backX,
      colour: 'metal',
    }),
    part({
      shape: 'box',
      widthM: COURT.boardDepthM,
      depthM: COURT.boardM,
      heightM: COURT.boardHeightM,
      x: backX + COURT.poleM,
      baseY: boardY,
      colour: 'net',
    }),
    part({
      shape: 'cylinder',
      widthM: COURT.rimM,
      depthM: COURT.rimM,
      heightM: COURT.rimHeightM,
      x: backX + COURT.poleM + COURT.rimM * HALF,
      baseY: boardY,
      colour: 'hoop',
    }),
  ];
}

function tennisParts(dims: Dims): Part[] {
  const postZ = (dims.depthM - NET.postM) * HALF;
  return [
    slab(dims),
    part({
      shape: 'box',
      widthM: NET.depthM,
      depthM: dims.depthM,
      heightM: dims.heightM - COURT.slabM,
      baseY: COURT.slabM,
      colour: 'net',
    }),
    ...[-postZ, postZ].map((z) =>
      part({
        shape: 'cylinder',
        widthM: NET.postM,
        depthM: NET.postM,
        heightM: dims.heightM,
        z,
        colour: 'metal',
      }),
    ),
  ];
}

/** A concrete pad with a ring of spray jets, as tall as the catalog height. */
function sprayPadParts(dims: Dims): Part[] {
  const radius = Math.min(dims.widthM, dims.depthM) * SPRAY.ringShare;
  const jets = Array.from({ length: SPRAY.jets }, (_, index) => {
    const angle = (index / SPRAY.jets) * FULL_TURN_RAD;
    return part({
      shape: 'cylinder',
      widthM: SPRAY.jetM,
      depthM: SPRAY.jetM,
      heightM: dims.heightM,
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      colour: 'play',
    });
  });
  return [surfacePad(dims, 'concrete'), ...jets];
}

/** Composites for single models that read better than their category's generic frame. */
export const MODEL_COMPOSITES: Readonly<Record<string, (dims: Dims) => Part[]>> = {
  swings: swingsParts,
  'playground-structure': playgroundParts,
  'spray-pad': sprayPadParts,
  'basketball-half-court': halfCourtParts,
  'tennis-court': tennisParts,
};
