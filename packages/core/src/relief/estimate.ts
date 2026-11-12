// estimate.ts — APPROXIMATE relief guessed from one flat-lit photo (BUILD.md §10 Phase 4,
// step 1). Brightness is not height: this keeps only fine bands of brightness that do not
// change colour (grain, plaster texture), which is the best one photo can give. Real relief
// comes from a side-lit photo (Phase 5).

import { dln } from '../dmath.ts';
import { smoothstep } from '../light.ts';
import { thumbnail, type Image } from '../resample.ts';
import { decodeTable as DEC } from '../srgb.ts';
import { gauss } from './blur.ts';

/** Relief maps are made at this long side (or the photo's, if smaller). */
export const RELIEF_SIZE = 2048;

export interface Height {
  width: number; height: number;
  /** hHat: median 0, 2% to 98% spread 1 (or all 0 when the photo has no such detail). */
  h: Float32Array;
  /** d hHat / dx and d hHat / dy, per picture width (central differences). */
  p: Float32Array; q: Float32Array;
}

/** The photo at relief size (area average). */
export function reliefPhoto(photo: Image): Image {
  return thumbnail(photo, RELIEF_SIZE);
}

/** hHat and its slopes from a photo (any size; it is brought to relief size first). */
export function estimateHeight(photo: Image): Height {
  const img = reliefPhoto(photo), { width: w, height: h, data: d } = img, n = w * h;
  const L = new Float32Array(n), cr = new Float32Array(n), cg = new Float32Array(n), cb = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = DEC[d[p]!]!, g = DEC[d[p + 1]!]!, b = DEC[d[p + 2]!]!;
    const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, c = 1 / Math.max(Y, 0.002); // D-034: no division by 0
    L[i] = dln(Y + 0.002);
    cr[i] = r * c; cg[i] = g * c; cb[i] = b * c;
  }
  const fine = gauss(L, w, h, 0.0012 * w), coarse = gauss(L, w, h, 0.012 * w);
  const mr = gauss(cr, w, h, 0.012 * w), mg = gauss(cg, w, h, 0.012 * w), mb = gauss(cb, w, h, 0.012 * w);
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const er = cr[i]! - mr[i]!, eg = cg[i]! - mg[i]!, eb = cb[i]! - mb[i]!;
    const wgt = 1 - smoothstep(0.02, 0.25, Math.sqrt(er * er + eg * eg + eb * eb));
    raw[i] = (fine[i]! - coarse[i]!) * wgt;
  }
  return normalise(raw, w, h);
}

/** hHat from any height: minus its median, over its 2% to 98% spread; then slopes. */
export function normalise(raw: Float32Array, w: number, h: number): Height {
  const n = w * h, [p2, med, p98] = percentiles(raw, [0.02, 0.5, 0.98]);
  const spread = p98! - p2!, hh = new Float32Array(n);
  if (spread > 1e-6) for (let i = 0; i < n; i++) hh[i] = (raw[i]! - med!) / spread;
  const { p, q } = slopes(hh, w, h);
  return { width: w, height: h, h: hh, p, q };
}

/** Central differences per picture width (one-sided at the border). */
export function slopes(hh: Float32Array, w: number, h: number): { p: Float32Array; q: Float32Array } {
  const p = new Float32Array(w * h), q = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const xa = x > 0 ? x - 1 : x, xb = x < w - 1 ? x + 1 : x, ya = y > 0 ? y - 1 : y, yb = y < h - 1 ? y + 1 : y;
    p[i] = xb > xa ? ((hh[y * w + xb]! - hh[y * w + xa]!) * w) / (xb - xa) : 0;
    q[i] = yb > ya ? ((hh[yb * w + x]! - hh[ya * w + x]!) * w) / (yb - ya) : 0;
  }
  return { p, q };
}

/** Percentiles of a large array, from an evenly strided sample of at most 2^20 values. */
function percentiles(a: Float32Array, at: number[]): number[] {
  const step = Math.max(1, Math.ceil(a.length / (1 << 20))), s = new Float32Array(Math.ceil(a.length / step));
  for (let i = 0, k = 0; i < a.length; i += step) s[k++] = a[i]!;
  s.sort();
  return at.map((t) => s[Math.min(s.length - 1, Math.floor(t * (s.length - 1) + 0.5))]!);
}
