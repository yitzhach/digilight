// blur.ts — a Gaussian blur of one float channel, the same bits everywhere (D-034).
// Sigma up to 3 pixels: the exact kernel (truncated at 3 sigma, weights summing to 1). Larger:
// three box blurs whose widths match the Gaussian's variance (Wells), which is within 1% of it
// and costs the same at any sigma. Edges repeat the border pixel.

import { dexp } from '../dmath.ts';

/** `src` (w x h) blurred by a Gaussian of `sigma` pixels, as a new array. */
export function gauss(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  if (!(sigma > 0)) return src.slice();
  if (sigma <= 3) return separable(src, w, h, kernel(sigma));
  let a = src;
  for (const r of boxRadii(sigma)) a = box(a, w, h, r);
  return a;
}

function kernel(sigma: number): Float64Array {
  const r = Math.ceil(3 * sigma), k = new Float64Array(2 * r + 1);
  let s = 0;
  for (let i = -r; i <= r; i++) { const v = dexp(-(i * i) / (2 * sigma * sigma)); k[i + r] = v; s += v; }
  for (let i = 0; i < k.length; i++) k[i]! /= s;
  return k;
}

function separable(src: Float32Array, w: number, h: number, k: Float64Array): Float32Array {
  const r = (k.length - 1) / 2, mid = new Float32Array(w * h), out = new Float32Array(w * h);
  // Across: border pixels repeat (clamped reads); the interior reads straight through.
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let s = 0;
      if (x >= r && x < w - r) for (let i = 0, o = row + x - r; i < k.length; i++) s += k[i]! * src[o + i]!;
      else for (let i = -r; i <= r; i++) { const xx = x + i < 0 ? 0 : x + i >= w ? w - 1 : x + i; s += k[i + r]! * src[row + xx]!; }
      mid[row + x] = s;
    }
  }
  // Down: whole rows at a time, so the reads run along memory.
  const acc = new Float64Array(w);
  for (let y = 0; y < h; y++) {
    acc.fill(0);
    for (let i = -r; i <= r; i++) {
      const yy = y + i < 0 ? 0 : y + i >= h ? h - 1 : y + i, o = yy * w, kk = k[i + r]!;
      for (let x = 0; x < w; x++) acc[x]! += kk * mid[o + x]!;
    }
    out.set(acc, y * w);
  }
  return out;
}

/** Radii of three boxes whose combined variance is sigma^2 (odd widths 2r + 1). */
export function boxRadii(sigma: number): number[] {
  const n = 3, ideal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(ideal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  return [0, 1, 2].map((i) => ((i < m ? wl : wu) - 1) / 2);
}

/** One box blur of radius r, across then down; running sums in float64. */
function box(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const mid = new Float32Array(w * h), out = new Float32Array(w * h), n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let s = 0;
    for (let i = -r; i <= r; i++) s += src[o + (i < 0 ? 0 : i >= w ? w - 1 : i)]!;
    for (let x = 0; x < w; x++) {
      mid[o + x] = s / n;
      const a = x + r + 1, b = x - r;
      s += src[o + (a >= w ? w - 1 : a)]! - src[o + (b < 0 ? 0 : b)]!;
    }
  }
  const col = new Float64Array(w);
  for (let i = -r; i <= r; i++) { const o = (i < 0 ? 0 : i >= h ? h - 1 : i) * w; for (let x = 0; x < w; x++) col[x]! += mid[o + x]!; }
  for (let y = 0; y < h; y++) {
    const o = y * w, a = y + r + 1, b = y - r, oa = (a >= h ? h - 1 : a) * w, ob = (b < 0 ? 0 : b) * w;
    for (let x = 0; x < w; x++) { out[o + x] = col[x]! / n; col[x]! += mid[oa + x]! - mid[ob + x]!; }
  }
  return out;
}
