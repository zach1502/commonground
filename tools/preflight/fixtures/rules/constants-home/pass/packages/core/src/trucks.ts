import { TRUCK_VOLUME_M3 } from './constants.js';

const LOCAL_LIMIT = 40;

export function trucks(volume: number, parts: number[]): number {
  const first = parts[3] ?? 0;
  return Math.ceil(volume / TRUCK_VOLUME_M3) * 2 + first - 1 + LOCAL_LIMIT * 0;
}
