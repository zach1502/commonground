import { describe, expect, it } from 'vitest';

import { stageBlockSize, type VoteCardFrame } from './vote-card-layout';

// The phone card, top to bottom, in CSS px, as vote-3d-360 measures it: header 65, padding 8,
// title 70, design name 20 and two gaps put the stage top at 185. Under the stage: 8 gap, 44
// view buttons, 8 gap, the one-line region (progress and hint) 21, 8 gap, 44 vote buttons and
// the footer, the 8 px page padding. The reason chips open as a sheet over the vote buttons, so
// they take no room here.
const STAGE_TOP = 185;
const GAP = 8;
const VIEW_ROW = 44;
const LINE = 21;
const BUTTONS = 44;
const FOOTER = 8;
const BELOW = GAP + VIEW_ROW + GAP + LINE + GAP + BUTTONS + FOOTER;
// Any stage height works: the helper reads only the chrome around it.
const MEASURED_STAGE = 145;
const MIN_SHARE = 0.55;

function phone(width: number, height: number): VoteCardFrame {
  const stageBottom = STAGE_TOP + MEASURED_STAGE;
  return {
    viewportHeight: height,
    stageInline: width - 2 * 16,
    stageTop: STAGE_TOP,
    stageBottom,
    cardBottom: stageBottom + BELOW,
  };
}

const PHONE_360 = phone(360, 740);
const PHONE_390 = phone(390, 844);

function cardEnd(frame: VoteCardFrame, stage: number): number {
  return frame.stageTop + stage + (frame.cardBottom - frame.stageBottom);
}

describe('stageBlockSize', () => {
  it('gives the stage at least 55 percent of a 360x740 window', () => {
    const stage = stageBlockSize(PHONE_360);
    expect(stage).toBe(740 - STAGE_TOP - BELOW);
    expect(stage / PHONE_360.viewportHeight).toBeGreaterThanOrEqual(MIN_SHARE);
  });

  it('gives the stage at least 55 percent of a 390x844 window', () => {
    const stage = stageBlockSize(PHONE_390);
    expect(stage).toBe(844 - STAGE_TOP - BELOW);
    expect(stage / PHONE_390.viewportHeight).toBeGreaterThanOrEqual(MIN_SHARE);
  });

  it('ends the card at the window bottom on both phones', () => {
    for (const frame of [PHONE_360, PHONE_390]) {
      expect(cardEnd(frame, stageBlockSize(frame))).toBe(frame.viewportHeight);
    }
  });

  it('reads only the chrome, so a stage measured at another height gives the same size', () => {
    const taller = { ...PHONE_360, stageBottom: PHONE_360.stageBottom + 100 };
    const moved = { ...taller, cardBottom: PHONE_360.cardBottom + 100 };
    expect(stageBlockSize(moved)).toBe(stageBlockSize(PHONE_360));
  });

  it('stops at one and a half times the width on a tall phone, so the picture keeps a shape', () => {
    const tall = { ...PHONE_390, viewportHeight: 1400 };
    expect(stageBlockSize(tall)).toBe(Math.floor(tall.stageInline * 1.5));
  });

  it('keeps a minimum on a short window, and the page scrolls instead', () => {
    const short = { ...PHONE_360, viewportHeight: 400 };
    expect(stageBlockSize(short)).toBe(120);
  });
});
