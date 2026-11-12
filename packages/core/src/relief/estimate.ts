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

/** The relief size of a photo: what reliefPhoto gives (rows of it can be made apart with
 *  resampleRegion, the same pixels). */
export function reliefSize(photo: { width: number; height: number }): { width: number; height: number; same: boolean } {
  const { width: w, height: h } = photo, L = RELIEF_SIZE;
  if (Math.max(w, h) <= L) return { width: w, height: h, same: true };
  return w >= h ? { width: L, height: Math.max(1, Math.round((L * h) / w)), same: false } : { width: Math.max(1, Math.round((L * w) / h)), height: L, same: false };
}

/** The estimate's channels: log luma and chroma (rgb / luma), each a float per pixel. */
export interface Channels { L: Float32Array; cr: Float32Array; cg: Float32Array; cb: Float32Array }
/** The five blurs: fine and coarse log luma, and the coarse chroma. */
export interface Blurred { fine: Float32Array; coarse: Float32Array; mr: Float32Array; mg: Float32Array; mb: Float32Array }

/** Each blur's channel and sigma in pixels, for an image `w` wide (the app runs them in parallel). */
export const BLURS: readonly [keyof Blurred, keyof Channels, number][] = [
  ['fine', 'L', 0.0012], ['coarse', 'L', 0.012], ['mr', 'cr', 0.012], ['mg', 'cg', 0.012], ['mb', 'cb', 0.012],
];

/** Rows [y0, y1) of the channels from the photo at relief size. */
export function channelRows(img: Image, ch: Channels, y0 = 0, y1 = img.height): void {
  const d = img.data;
  for (let i = y0 * img.width, p = 4 * i, end = y1 * img.width; i < end; i++, p += 4) {
    const r = DEC[d[p]!]!, g = DEC[d[p + 1]!]!, b = DEC[d[p + 2]!]!;
    const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, c = 1 / Math.max(Y, 0.002); // D-034: no division by 0
    ch.L[i] = dln(Y + 0.002);
    ch.cr[i] = r * c; ch.cg[i] = g * c; ch.cb[i] = b * c;
  }
}

/** Rows [y0, y1) of the raw height: the fine band of log luma where the colour does not change. */
export function rawRows(ch: Channels, bl: Blurred, w: number, raw: Float32Array, y0: number, y1: number): void {
  const { cr, cg, cb } = ch, { fine, coarse, mr, mg, mb } = bl;
  for (let i = y0 * w, end = y1 * w; i < end; i++) {
    const er = cr[i]! - mr[i]!, eg = cg[i]! - mg[i]!, eb = cb[i]! - mb[i]!;
    const wgt = 1 - smoothstep(0.02, 0.25, Math.sqrt(er * er + eg * eg + eb * eb));
    raw[i] = (fine[i]! - coarse[i]!) * wgt;
  }
}

/** hHat and its slopes from a photo (any size; it is brought to relief size first). */
export function estimateHeight(photo: Image): Height {
  const img = reliefPhoto(photo), { width: w, height: h } = img, n = w * h;
  const ch: Channels = { L: new Float32Array(n), cr: new Float32Array(n), cg: new Float32Array(n), cb: new Float32Array(n) };
  channelRows(img, ch);
  const bl = Object.fromEntries(BLURS.map(([k, c, s]) => [k, gauss(ch[c], w, h, s * w)])) as unknown as Blurred;
  const raw = new Float32Array(n);
  rawRows(ch, bl, w, raw, 0, h);
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
