// kelvin.ts — light colour (BUILD.md §5.8): a black body at K kelvin in the working space,
// relative to 6500 K, luma 1. Table every 100 K (kelvin-tables.ts), linear in between.

import { KELVIN_MIN, KELVIN_P3, KELVIN_SRGB, KELVIN_STEP } from './kelvin-tables.ts';

export type Space = 'srgb' | 'display-p3';
export type RGB = [number, number, number];

export function colour(kelvin: number, space: Space = 'srgb'): RGB {
  const t = space === 'display-p3' ? KELVIN_P3 : KELVIN_SRGB;
  const last = t.length / 3 - 1;
  const f = Math.min(last, Math.max(0, (kelvin - KELVIN_MIN) / KELVIN_STEP));
  const i = Math.min(last - 1, Math.floor(f)), w = f - i;
  const a = i * 3, b = a + 3;
  if (w === 0) return [t[a]!, t[a + 1]!, t[a + 2]!];
  return [t[a]! + (t[b]! - t[a]!) * w, t[a + 1]! + (t[b + 1]! - t[a + 1]!) * w, t[a + 2]! + (t[b + 2]! - t[a + 2]!) * w];
}
