// srgb.ts — 8-bit codes to linear light and back (BUILD.md §5.10). sRGB and Display P3 share
// this curve. Tables only: no pow at run time, and encode(decode(code)) === code.

import { DECODE, THRESHOLDS } from './srgb-tables.ts';

export const decodeTable: Float64Array = Float64Array.from(DECODE);
const thr: Float64Array = Float64Array.from(THRESHOLDS);

// The search starts from the code of the bucket's lower end (count of thresholds <= b / N), so
// it is a step or two instead of eight; the answer is the binary search's, exactly.
const N = 4096;
const start = new Uint8Array(N);
for (let b = 0, c = 0; b < N; b++) {
  while (c < 255 && thr[c]! <= b / N) c++;
  start[b] = c;
}

/** Linear value of an 8-bit code. */
export function decode(code: number): number {
  return decodeTable[code]!;
}

/** Linear value (clamped to [0, 1]) to the nearest 8-bit code: the count of thresholds <= v. */
export function encode(v: number): number {
  if (!(v > 0)) return 0;
  if (v >= 1) return 255;
  let c = start[(v * N) | 0]!;
  while (c < 255 && thr[c]! <= v) c++;
  return c;
}
