// tools/even.ts — tool:even, even out the photo (BUILD.md §5.12.6, T4): a photo lit unevenly (a
// side darker, a hot centre, a colour cast) multiplies that into every look. This is light: E is
// multiplied by a smooth correction g and a colour T, so the whites stay protected and the guard
// counts it. g's form makes the opposite settings undo each other exactly, with no exp per pixel.

import type { Doc } from '../fields.ts';
import { DEG, dcos, dsin } from '../dmath.ts';

export interface Even {
  cx: number; cy: number;   // the picture's centre (picture widths)
  kx: number; ky: number;   // t = (x - cx) kx + (y - cy) ky: -1 to 1 along tiltFrom
  h: number; k: number;     // tilt / 2, corners / 2
  inv: number;              // 1 / (half the diagonal)^2
  T: [number, number, number]; // the tint, luma 1
}

/** The correction for a picture `a` high, or null when every setting is 0 (then nothing runs). */
export function prepareEven(p: Doc['prepare'], a: number): Even | null {
  if (p.tilt === 0 && p.corners === 0 && p.tint === 0) return null;
  const dx = dcos(p.tiltFrom * DEG), dy = -dsin(p.tiltFrom * DEG), e = 0.5 * Math.abs(dx) + (a / 2) * Math.abs(dy);
  const m = 0.1 * p.tint, r = 1 + m, g = 1 - m, l = 0.2126 * r + 0.7152 * g + 0.0722 * r; // magenta lifts red and blue
  return { cx: 0.5, cy: a / 2, kx: dx / e, ky: dy / e, h: p.tilt / 2, k: p.corners / 2, inv: 4 / (1 + a * a), T: [r / l, g / l, r / l] };
}

/** g at picture point (x, y). */
export function evenAt(v: Even, x: number, y: number): number {
  const dx = x - v.cx, dy = y - v.cy, t = dx * v.kx + dy * v.ky, r2 = (dx * dx + dy * dy) * v.inv;
  return ((1 + v.h * t) / (1 - v.h * t)) * ((1 + v.k * r2) / (1 - v.k * r2));
}
