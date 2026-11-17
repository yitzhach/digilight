// tools/bounce.ts — softer shadows (BUILD.md §5.12.1, §5.12.2; light tool T6).
// tool:bounce — light that the lit side of a hollow throws back into its shadow, and room light
// that reaches further into hollows in pale paint. tool:roomside — room light that comes more
// from one side, so the surface still shows where no lamp reaches.
// Pure arithmetic on numbers light.ts already has; the shader mirrors each line.

import type { RGB } from '../kelvin.ts';

/** Elevation of the room light's side, degrees above the picture's face. */
export const ROOM_ELEVATION = 35;
/** How far round a big soft source wraps (as a lamp of size 0.5 or more, §5.3). */
export const ROOM_WRAP = 0.5;

/** Share of the sky a lit wall fills, seen from open ground, when its top stands at a tangent
 *  T above the horizon on the far side from the light: 0.5 (1 - 1 / sqrt(1 + T^2)). */
export function wallShare(T: number): number {
  return 0.5 * (1 - 1 / Math.sqrt(1 + T * T));
}

/** How much more light a wall facing the light takes than flat ground does: a 45 degree wall
 *  turned toward a light at (lh, lz) (lh its length along the picture), as §5.3's `rel`. */
export function wallLight(lh: number, lz: number, w: number): number {
  return Math.min(4, (Math.SQRT1_2 * (lh + lz) + w) / (lz + w));
}

/** Room light reaching a hollow that keeps the share V of it, with paint of colour c bouncing
 *  it on (a series of bounces between like walls): V / (1 - bounce c (1 - V)). */
export function openness(V: number, c: number, bounce: number): number {
  return V / (1 - bounce * c * (1 - V));
}

/** Room light on a surface of normal n against flat ground, from the side d (toward it, at
 *  ROOM_ELEVATION): 1 when flat. */
export function roomLight(nx: number, ny: number, nz: number, d: RGB): number {
  return Math.min(4, Math.max(0, nx * d[0] + ny * d[1] + nz * d[2] + ROOM_WRAP) / (d[2] + ROOM_WRAP));
}
