// horizon.ts — the horizon table (BUILD.md §5.6) on the CPU: the reference, also used in Node.
// For each of K directions and each relief pixel, the steepest rise of the surface seen from
// that pixel, so a shadow at render time is one lookup. Taps read a max pyramid (a thin ridge
// between two far taps is not stepped over) at whole-pixel offsets, so the GPU (gl/horizon-gpu)
// reads exactly the same texels (D-035).

import { dcos, dsin, PI } from '../dmath.ts';
import { gauss } from './blur.ts';

export const K = 32, REACH = 0.2, RATIO = 1.35;

export interface Level { width: number; height: number; data: Float32Array }
export interface Taps {
  /** Per tap j: its distance in relief pixels (1.35^j), the pyramid level, and the largest inv. */
  dist: Float64Array; level: Int32Array; invMax: Float64Array;
  /** Per direction k and tap j (index k * n + j): the whole-pixel offset, 1 / its length. */
  ox: Int32Array; oy: Int32Array; inv: Float64Array; n: number;
}
export interface HorizonInput {
  width: number; height: number; pyramid: Level[]; taps: Taps;
  /** Per tap j: no pixel rises more than this to any tap j (for skipping work in horizonTmax). */
  bound: Float64Array;
}
export interface Horizon {
  /** K layers of width * height bytes, layer k at k * width * height. */
  table: Uint8Array; tmax: number;
  /** Hollows: round(255 x / (1 + x)), x the mean over k of the decoded table. */
  ao: Uint8Array;
}

/** The taps for a relief image `w` pixels wide (reach 0.2 picture widths). */
export function makeTaps(w: number): Taps {
  const dist: number[] = [];
  for (let d = 1; d <= REACH * w; d *= RATIO) dist.push(d);
  const n = dist.length, ox = new Int32Array(K * n), oy = new Int32Array(K * n), level = new Int32Array(n);
  dist.forEach((d, j) => {
    let l = 0;
    while ((2 << l) <= 0.35 * d) l++; // floor(log2(max(1, 0.35 d)))
    level[j] = l;
    for (let k = 0; k < K; k++) {
      const a = (2 * PI * k) / K; // d_k = (cos, -sin): azimuth as in §5.1, y down
      ox[k * n + j] = Math.floor(0.5 + d * dcos(a));
      oy[k * n + j] = Math.floor(0.5 - d * dsin(a));
    }
  });
  const inv = Float64Array.from(ox, (x, o) => 1 / Math.sqrt(x * x + oy[o]! * oy[o]!));
  const invMax = Float64Array.from(dist, (_, j) => { let m = 0; for (let k = 0; k < K; k++) m = Math.max(m, inv[k * n + j]!); return m; });
  return { dist: Float64Array.from(dist), level, invMax, ox, oy, inv, n };
}

/** Level l texel (i, j) is the max (or min) of level l - 1 texels 2i, 2i + 1 (the last takes the rest). */
export function maxPyramid(hs: Float32Array, w: number, h: number, levels: number, min = false): Level[] {
  const out: Level[] = [{ width: w, height: h, data: hs }];
  for (let l = 1; l < levels; l++) {
    const a = out[l - 1]!, lw = Math.max(1, a.width >> 1), lh = Math.max(1, a.height >> 1), d = new Float32Array(lw * lh);
    for (let y = 0; y < lh; y++) {
      const y1 = y === lh - 1 ? a.height : 2 * y + 2;
      for (let x = 0; x < lw; x++) {
        const x1 = x === lw - 1 ? a.width : 2 * x + 2;
        let m = min ? Infinity : -Infinity;
        for (let yy = 2 * y; yy < y1; yy++) for (let xx = 2 * x; xx < x1; xx++) { const v = a.data[yy * a.width + xx]!; m = min ? Math.min(m, v) : Math.max(m, v); }
        d[y * lw + x] = m;
      }
    }
    out.push({ width: lw, height: lh, data: d });
  }
  return out;
}

/** Everything the table needs: hs (hHat, blurred by 0.002 widths when estimated), pyramid, taps. */
export function horizonInput(hHat: Float32Array, w: number, h: number, estimated: boolean): HorizonInput {
  const hs = estimated ? gauss(hHat, w, h, 0.002 * w) : hHat, taps = makeTaps(w);
  const levels = (taps.n ? taps.level[taps.n - 1]! : 0) + 1;
  // Bounds: a tap reads within d + 0.5 + 2^(l+1) pixels of its pixel, which the 3 x 3 blocks
  // round the pixel's block at level b cover once 2^b is at least that.
  const lb = Array.from(taps.dist, (d, j) => { let b = 0; while ((1 << b) < d + 0.5 + (2 << taps.level[j]!)) b++; return b; });
  const top = Math.max(levels, ...lb.map((b) => b + 1));
  const hi = maxPyramid(hs, w, h, top), lo = maxPyramid(hs, w, h, top, true);
  const D = hi.map((L, b) => spread(L, lo[b]!));
  return { width: w, height: h, pyramid: hi.slice(0, levels), taps, bound: Float64Array.from(lb, (b) => D[b]!) };
}

/** max over blocks of (max of the 3 x 3 blocks round it) - (its min). */
function spread(hi: Level, lo: Level): number {
  const { width: lw, height: lh } = hi;
  let m = 0;
  for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
    let a = -Infinity;
    for (let yy = Math.max(0, y - 1); yy <= Math.min(lh - 1, y + 1); yy++)
      for (let xx = Math.max(0, x - 1); xx <= Math.min(lw - 1, x + 1); xx++) a = Math.max(a, hi.data[yy * lw + xx]!);
    m = Math.max(m, a - lo.data[y * lw + x]!);
  }
  return m;
}

/**
 * For direction k, every tap j over the whole image: `fn(i, rise)` per pixel i whose tap lands
 * inside the picture (a tap outside is skipped; so is every later one, as they lie further out).
 * Loop order direction, band of rows, tap, row, column: the inner loop is a plain walk along a
 * row, and a band's rows stay in the cache while every tap passes over them.
 */
const BAND = 8;
function sweep(inp: HorizonInput, k: number, j: number, best: Float64Array, ya: number, yb: number): void {
  const { width: w, height: h, pyramid: pyr, taps: t } = inp, o = k * t.n + j;
  const hs = pyr[0]!.data, dx = t.ox[o]!, dy = t.oy[o]!, inv = t.inv[o]!, l = t.level[j]!, L = pyr[l]!, d = L.data, lw = L.width, lh = L.height;
  const x0 = Math.max(0, -dx), x1 = Math.min(w, w - dx);
  for (let y = Math.max(ya, -dy), y1 = Math.min(yb, h - dy); y < y1; y++) {
    const row = y * w, ty = Math.min((y + dy) >> l, lh - 1) * lw;
    if (l === 0) {
      const src = row + dy * w + dx;
      for (let x = x0; x < x1; x++) { const s = (d[src + x]! - hs[row + x]!) * inv; if (s > best[row + x]!) best[row + x] = s; }
    } else {
      for (let x = x0; x < x1; x++) {
        const tx = (x + dx) >> l, s = (d[ty + (tx < lw ? tx : lw - 1)]! - hs[row + x]!) * inv;
        if (s > best[row + x]!) best[row + x] = s;
      }
    }
  }
}

/** That_k for every pixel, per relief pixel of unit height (multiply by the width for per width). */
export function horizonRise(inp: HorizonInput, k: number, best: Float64Array = new Float64Array(inp.width * inp.height)): Float64Array {
  best.fill(0);
  for (let ya = 0; ya < inp.height; ya += BAND) for (let j = 0; j < inp.taps.n; j++) sweep(inp, k, j, best, ya, Math.min(inp.height, ya + BAND));
  return best;
}

/** The largest value (per picture width) of directions [k0, k1): split directions across workers.
 *  Taps in order; a tap is skipped once its bound cannot beat the largest rise found so far. */
export function horizonTmax(inp: HorizonInput, k0 = 0, k1 = K): number {
  const { width: w, height: h, pyramid: pyr, taps: t } = inp, hs = pyr[0]!.data;
  let m = 0;
  for (let j = 0; j < t.n; j++) {
    const l = t.level[j]!, L = pyr[l]!, d = L.data, lw = L.width, lh = L.height;
    if (inp.bound[j]! * t.invMax[j]! <= m) continue;
    for (let k = k0; k < k1; k++) {
      const o = k * t.n + j, dx = t.ox[o]!, dy = t.oy[o]!, inv = t.inv[o]!, x0 = Math.max(0, -dx), x1 = Math.min(w, w - dx);
      let r = 0;
      for (let y = Math.max(0, -dy), y1 = Math.min(h, h - dy); y < y1; y++) {
        const row = y * w, ty = Math.min((y + dy) >> l, lh - 1) * lw;
        for (let x = x0; x < x1; x++) {
          const tx = (x + dx) >> l, v = d[ty + (tx < lw ? tx : lw - 1)]! - hs[row + x]!;
          if (v > r) r = v;
        }
      }
      if (r * inv > m) m = r * inv;
    }
  }
  return m * w;
}

/** Layer k of the table, as bytes, for the whole table's `tmax`. */
export function horizonLayer(inp: HorizonInput, k: number, tmax: number, out: Uint8Array = new Uint8Array(inp.width * inp.height), best?: Float64Array): Uint8Array {
  if (!(tmax > 0)) return out.fill(0);
  const r = horizonRise(inp, k, best ?? new Float64Array(inp.width * inp.height)), sc = inp.width / tmax;
  for (let i = 0; i < r.length; i++) out[i] = Math.round(255 * Math.sqrt(r[i]! * sc));
  return out;
}

/** Hollows from the finished table (§5.6 `ao`). */
export function aoFromTable(table: Uint8Array, n: number, tmax: number): Uint8Array {
  const ao = new Uint8Array(n), dec = new Float64Array(256);
  for (let b = 0; b < 256; b++) dec[b] = ((b / 255) * (b / 255) * tmax) / K;
  for (let i = 0; i < n; i++) {
    let x = 0;
    for (let k = 0; k < K; k++) x += dec[table[k * n + i]!]!;
    ao[i] = Math.round((255 * x) / (1 + x));
  }
  return ao;
}

/** The whole table in one go (Node, tests; the app splits it across workers). */
export function buildHorizon(inp: HorizonInput): Horizon {
  const n = inp.width * inp.height, tmax = horizonTmax(inp), table = new Uint8Array(K * n), best = new Float64Array(n);
  for (let k = 0; k < K; k++) horizonLayer(inp, k, tmax, table.subarray(k * n, (k + 1) * n), best);
  return { table, tmax, ao: aoFromTable(table, n, tmax) };
}
