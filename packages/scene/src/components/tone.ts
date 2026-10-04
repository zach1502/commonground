/**
 * three.js's ACESFilmicToneMapping in TypeScript. The composer tone maps the whole frame,
 * background included, so the scene hands it a sky colour that tone maps back to the palette.
 */
type Rgb = readonly [number, number, number];
interface Column {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}
type Matrix = readonly [Column, Column, Column];

// Columns, as the GLSL mat3 constructor in the shader chunk takes them.
const INPUT: Matrix = [
  { r: 0.59719, g: 0.076, b: 0.0284 },
  { r: 0.35458, g: 0.90834, b: 0.13383 },
  { r: 0.04823, g: 0.01566, b: 0.83777 },
];
const OUTPUT: Matrix = [
  { r: 1.60475, g: -0.10208, b: -0.00327 },
  { r: -0.53108, g: 1.10813, b: -0.07276 },
  { r: -0.07367, g: -0.00605, b: 1.07602 },
];
const EXPOSURE_BIAS = 0.6;
const FIT = { a: 0.0245786, b: 0.000090537, c: 0.983729, d: 0.432951, e: 0.238081 };
const INVERSE_STEPS = 200;
const STEP_GAIN = 0.8;

function multiply(matrix: Matrix, v: Rgb): Rgb {
  const [c0, c1, c2] = matrix;
  return [
    c0.r * v[0] + c1.r * v[1] + c2.r * v[2],
    c0.g * v[0] + c1.g * v[1] + c2.g * v[2],
    c0.b * v[0] + c1.b * v[1] + c2.b * v[2],
  ];
}

const fit = (v: number): number => (v * (v + FIT.a) - FIT.b) / (v * (FIT.c * v + FIT.d) + FIT.e);
const saturate = (v: number): number => Math.min(Math.max(v, 0), 1);
const each = (v: Rgb, change: (value: number) => number): Rgb => [
  change(v[0]),
  change(v[1]),
  change(v[2]),
];

export function acesFilmic(linear: Rgb, exposure: number): Rgb {
  const scaled = each(linear, (v) => (v * exposure) / EXPOSURE_BIAS);
  return each(multiply(OUTPUT, each(multiply(INPUT, scaled), fit)), saturate);
}

/** The linear colour whose ACES tone mapping is the target, by damped fixed-point steps. */
export function inverseAcesFilmic(target: Rgb, exposure: number): Rgb {
  let guess: Rgb = target;
  for (let step = 0; step < INVERSE_STEPS; step += 1) {
    const mapped = acesFilmic(guess, exposure);
    guess = [
      Math.max(0, guess[0] + (target[0] - mapped[0]) * STEP_GAIN),
      Math.max(0, guess[1] + (target[1] - mapped[1]) * STEP_GAIN),
      Math.max(0, guess[2] + (target[2] - mapped[2]) * STEP_GAIN),
    ];
  }
  return guess;
}
