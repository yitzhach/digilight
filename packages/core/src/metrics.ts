// metrics.ts — numbers an AI agent (or a test) judges a render by (BUILD.md §7). Ported and
// trimmed from v1 src/measure.js imageMetrics: blown and crushed by display luma, any channel
// at 255, luma percentiles, kappa, and warnings in words.

import { BLOWN, MAX_NEW_BLOWN } from './guard.ts';
import type { Image } from './resample.ts';

export const CRUSHED = 5, MAX_NEW_CRUSHED = 0.0015;

export interface PictureStats {
  /** Shares of pixels: display luma >= 250, <= 5, any channel at 255. */
  blown: number; crushed: number; at255: number;
  /** Display luma (0 to 255) percentiles. */
  p05: number; p50: number; p95: number;
}
export interface Metrics {
  render: PictureStats; photo: PictureStats;
  newBlown: number; newCrushed: number; kappa: number; warnings: string[];
}

const r4 = (v: number) => Math.round(v * 1e4) / 1e4, r2 = (v: number) => Math.round(v * 100) / 100;

export function pictureStats(img: Image): PictureStats {
  const d = img.data, n = img.width * img.height, y = new Float64Array(n);
  let hi = 0, lo = 0, top = 0;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = d[p]!, g = d[p + 1]!, b = d[p + 2]!, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    y[i] = Y;
    if (Y >= BLOWN) hi++; else if (Y <= CRUSHED) lo++;
    if (r === 255 || g === 255 || b === 255) top++;
  }
  return { blown: r4(hi / n), crushed: r4(lo / n), at255: r4(top / n), p05: r2(pct(y, 5)), p50: r2(pct(y, 50)), p95: r2(pct(y, 95)) };
}

/** A render's numbers against the photo at the same size and region. */
export function metrics(render: Image, photo: Image, kappa: number): Metrics {
  const R = pictureStats(render), P = pictureStats(photo);
  const newBlown = r4(R.blown - P.blown), newCrushed = r4(R.crushed - P.crushed);
  const pc = (v: number) => `${(v * 100).toFixed(2)}%`;
  const warnings: string[] = [];
  if (newBlown > MAX_NEW_BLOWN) warnings.push(`whites: ${pc(newBlown)} more of the picture is blown than in the photo (limit ${pc(MAX_NEW_BLOWN)}); lower a light's brightness`);
  if (newCrushed > MAX_NEW_CRUSHED) warnings.push(`darks: ${pc(newCrushed)} more of the picture is crushed to black than in the photo (limit ${pc(MAX_NEW_CRUSHED)}); raise the room light`);
  if (kappa < 1) warnings.push(`protect whites dimmed all the light to ${Math.round(kappa * 100)}%; lower the brightest light for full control`);
  return { render: R, photo: P, newBlown, newCrushed, kappa, warnings };
}

/** The k-th smallest of `a` (0-based), reordering `a` in place: quickselect. */
function kth(a: Float64Array, k: number): number {
  let lo = 0, hi = a.length - 1;
  while (hi > lo) {
    const mid = (lo + hi) >> 1;
    const x = a[lo]!, y = a[mid]!, z = a[hi]!; // median of three
    const piv = x < y ? (y < z ? y : x < z ? z : x) : (x < z ? x : y < z ? z : y);
    let i = lo, j = hi;
    while (i <= j) {
      while (a[i]! < piv) i++;
      while (a[j]! > piv) j--;
      if (i <= j) { const t = a[i]!; a[i] = a[j]!; a[j] = t; i++; j--; }
    }
    if (k <= j) hi = j; else if (k >= i) lo = i; else break;
  }
  return a[k]!;
}
/** numpy.percentile (linear) of `a` (reordered in place), p in 0..100. */
function pct(a: Float64Array, p: number): number {
  const k = ((a.length - 1) * p) / 100, f = Math.floor(k);
  const lo = kth(a, f);
  if (f + 1 >= a.length || k === f) return lo;
  let next = Infinity; // the (f+1)-th smallest: the least of what quickselect left above f
  for (let i = f + 1; i < a.length; i++) if (a[i]! < next) next = a[i]!;
  return lo + (next - lo) * (k - f);
}
