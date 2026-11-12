// align.ts — a tripod shot lined up onto the flat photo to a fraction of a pixel. Ported from
// v1 src/lampphotos.js (align, warpShot, colourBands, bestShift).
//
// Shots from one tripod still creep: on Isaac's lamp shots the camera moved up to 2 px and one
// was zoomed by 0.3%, enough to wipe out the finest relief. Each shot is matched to the flat
// photo on colour alone (r/sum and b/sum, band-passed), which lighting barely changes.

import { decodeTable as DEC } from '../srgb.ts';
import { boxBlur } from './box.ts';

export const ALIGN_SEARCH = 0.01; // how far a shot may have moved, in picture widths
/** Near-white for the glint test: brightest channel at least this (8-bit). */
export const GLINT_WHITE = 235;

type Bytes = ArrayLike<number>;
/** shot(x + ax x + bx y + cx, y + ay x + by y + cy) is flat(x, y): [ax, bx, cx, ay, by, cy]. */
export type AffineMap = [number, number, number, number, number, number];
export interface Alignment { map: AffineMap; rms: number; used: number; of: number }
export const NO_SHIFT: Alignment = { map: [0, 0, 0, 0, 0, 0], rms: 0, used: 0, of: 0 };

/** Linear luminance of RGBA bytes. */
export function luminance(rgba: Bytes, n: number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = 0.2126 * DEC[rgba[i * 4]!]! + 0.7152 * DEC[rgba[i * 4 + 1]!]! + 0.0722 * DEC[rgba[i * 4 + 2]!]!;
  return out;
}

/** Colour without brightness, band-passed: what a pigment boundary looks like under any light.
 *  Two channels, r/sum and b/sum. */
export function colourBands(rgba: Bytes, w: number, h: number): Float32Array[] {
  const n = w * h, big = Math.max(4, Math.round(0.006 * w)), out: Float32Array[] = [];
  for (const ch of [0, 2]) {
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) c[i] = (rgba[i * 4 + ch]! + 1) / (rgba[i * 4]! + rgba[i * 4 + 1]! + rgba[i * 4 + 2]! + 3);
    const lo = boxBlur(c, w, h, big), hi = boxBlur(c, w, h, 1, 1);
    for (let i = 0; i < n; i++) hi[i]! -= lo[i]!;
    out.push(hi);
  }
  return out;
}

function half(a: Float32Array, w: number, h: number): Float32Array {
  const w2 = w >> 1, h2 = h >> 1, o = new Float32Array(w2 * h2);
  for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
    const i = 2 * y * w + 2 * x;
    o[y * w2 + x] = 0.25 * (a[i]! + a[i + 1]! + a[i + w]! + a[i + w + 1]!);
  }
  return o;
}

// Normalised correlation of a patch of `ref` with `mov` shifted by (dx, dy), both channels.
function ncc(ref: Float32Array[], mov: Float32Array[], w: number, x0: number, y0: number, P: number, dx: number, dy: number): number {
  let ab = 0, aa = 0, bb = 0;
  for (let c = 0; c < ref.length; c++) {
    const A = ref[c]!, B = mov[c]!;
    for (let y = y0; y < y0 + P; y++) {
      let i = y * w + x0, j = (y + dy) * w + x0 + dx;
      for (let x = 0; x < P; x++, i++, j++) { const a = A[i]!, b = B[j]!; ab += a * b; aa += a * a; bb += b * b; }
    }
  }
  return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0;
}

export interface Shift { bx: number; by: number; best: number; at: (dx: number, dy: number) => number | undefined }
/** The shift within R of (cx, cy) at which the patch matches best, and every score tried. */
export function bestShift(ref: Float32Array[], mov: Float32Array[], w: number, x0: number, y0: number, P: number, cx: number, cy: number, R: number): Shift {
  const S = 2 * R + 1, score = new Float64Array(S * S);
  let best = -2, bx = cx, by = cy;
  for (let dy = cy - R; dy <= cy + R; dy++) for (let dx = cx - R; dx <= cx + R; dx++) {
    const v = ncc(ref, mov, w, x0, y0, P, dx, dy);
    score[(dy - cy + R) * S + dx - cx + R] = v;
    if (v > best) { best = v; bx = dx; by = dy; }
  }
  const at = (dx: number, dy: number) => (Math.abs(dx - cx) > R || Math.abs(dy - cy) > R ? undefined : score[(dy - cy + R) * S + dx - cx + R]);
  return { bx, by, best, at };
}

/** A parabola through a peak z and its neighbours m, p: the peak's offset, within half a step. */
export function parabola(m: number | undefined, z: number, p: number | undefined): number {
  if (m === undefined || p === undefined) return 0;
  const d = m - 2 * z + p;
  return d < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (m - p)) / d)) : 0;
}

function solve3x3(A: number[], b: number[]): number[] | null {
  const [a, bb, c, d, e, f, g, hh, i] = A as [number, number, number, number, number, number, number, number, number];
  const [b0, b1, b2] = b as [number, number, number];
  const det = a * (e * i - f * hh) - bb * (d * i - f * g) + c * (d * hh - e * g);
  if (Math.abs(det) < 1e-12) return null;
  return [
    (b0 * (e * i - f * hh) - bb * (b1 * i - f * b2) + c * (b1 * hh - e * b2)) / det,
    (a * (b1 * i - f * b2) - b0 * (d * i - f * g) + c * (d * b2 - b1 * g)) / det,
    (a * (e * b2 - b1 * hh) - bb * (d * b2 - b1 * g) + b0 * (d * hh - e * g)) / det,
  ];
}

interface Match { x: number; y: number; dx: number; dy: number; q: number }

/** Where each pixel of the flat photo is in `shot`: a 5 x 5 tiling of patches matched on colour
 *  (coarse at half size, then to a fraction of a pixel), an affine map fitted through the
 *  matches, outliers dropped. */
export function align(evenRgba: Bytes, shotRgba: Bytes, w: number, h: number): Alignment {
  const ref = colourBands(evenRgba, w, h), mov = colourBands(shotRgba, w, h);
  const R = Math.max(3, Math.min(24, Math.ceil(ALIGN_SEARCH * w)));
  const P = Math.max(32, Math.min(160, Math.floor(Math.min(w, h) / 6)));
  const w2 = w >> 1, h2 = h >> 1;
  const ref2 = ref.map((a) => half(a, w, h)), mov2 = mov.map((a) => half(a, w, h));
  const pts: Match[] = [], G = 5, inset = P / 2 + R + 3;
  if (w < 2 * inset + 8 || h < 2 * inset + 8) return NO_SHIFT;
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
    const cx = Math.round(inset + ((w - 2 * inset) * gx) / (G - 1)), cy = Math.round(inset + ((h - 2 * inset) * gy) / (G - 1));
    // Coarse: half size, half the reach (+1).
    const P2 = P >> 1, R2 = (R >> 1) + 1;
    const x02 = Math.max(R2, Math.min(w2 - P2 - R2 - 1, (cx >> 1) - (P2 >> 1))), y02 = Math.max(R2, Math.min(h2 - P2 - R2 - 1, (cy >> 1) - (P2 >> 1)));
    const c = bestShift(ref2, mov2, w2, x02, y02, P2, 0, 0, R2);
    // Fine: full size, within 2 of the coarse match.
    const x0 = cx - (P >> 1), y0 = cy - (P >> 1);
    const sx = Math.max(-R + 2, Math.min(R - 2, 2 * c.bx)), sy = Math.max(-R + 2, Math.min(R - 2, 2 * c.by));
    const f = bestShift(ref, mov, w, x0, y0, P, sx, sy, 2);
    const dx = f.bx + parabola(f.at(f.bx - 1, f.by), f.best, f.at(f.bx + 1, f.by));
    const dy = f.by + parabola(f.at(f.bx, f.by - 1), f.best, f.at(f.bx, f.by + 1));
    pts.push({ x: cx, y: cy, dx, dy, q: f.best });
  }
  // Affine fit, weighted by match quality, rejecting outliers.
  let keep = pts.map((p) => p.q > 0.15);
  let map: AffineMap = [0, 0, 0, 0, 0, 0], rms = 0;
  for (let it = 0; it < 4; it++) {
    const use = pts.filter((_, i) => keep[i]);
    if (use.length >= 6) {
      const fit = (key: 'dx' | 'dy'): number[] | null => {
        const A = [0, 0, 0, 0, 0, 0, 0, 0, 0], b = [0, 0, 0];
        for (const p of use) {
          const r = [p.x / w, p.y / h, 1], wt = p.q;
          for (let i = 0; i < 3; i++) { b[i]! += wt * r[i]! * p[key]; for (let j = 0; j < 3; j++) A[i * 3 + j]! += wt * r[i]! * r[j]!; }
        }
        const s = solve3x3(A, b);
        return s ? [s[0]! / w, s[1]! / h, s[2]!] : null;
      };
      const mx = fit('dx'), my = fit('dy');
      if (mx && my) map = [mx[0]!, mx[1]!, mx[2]!, my[0]!, my[1]!, my[2]!];
    } else if (use.length) {
      const med = (k: 'dx' | 'dy') => use.map((p) => p[k]).sort((a, b) => a - b)[use.length >> 1]!;
      map = [0, 0, med('dx'), 0, 0, med('dy')];
    }
    const err = pts.map((p) => { const ex = map[0] * p.x + map[1] * p.y + map[2] - p.dx, ey = map[3] * p.x + map[4] * p.y + map[5] - p.dy; return Math.sqrt(ex * ex + ey * ey); });
    const used = err.filter((_, i) => keep[i]).sort((a, b) => a - b);
    const lim = Math.max(0.35, 2.5 * (used[used.length >> 1] || 0));
    keep = pts.map((p, i) => p.q > 0.15 && err[i]! < lim);
    const k = err.filter((_, i) => keep[i]);
    rms = k.length ? Math.sqrt(k.reduce((s, e) => s + e * e, 0) / k.length) : 0;
  }
  return { map, rms, used: keep.filter(Boolean).length, of: pts.length };
}

export interface Warped { lum: Float32Array; bad: Uint8Array; sat: Float32Array; white: Uint8Array }

/** The shot's luminance on the flat photo's pixels (bilinear), a mask of pixels that are blown
 *  (any channel at 250+), transparent or outside the shot, and each pixel's saturation and
 *  whether it is near-white (for the glint test). */
export function warpShot(rgba: Bytes, w: number, h: number, map: AffineMap): Warped {
  const n = w * h, lum = luminance(rgba, n), out = new Float32Array(n), bad = new Uint8Array(n), sat = new Float32Array(n), white = new Uint8Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = x + map[0] * x + map[1] * y + map[2], sy = y + map[3] * x + map[4] * y + map[5];
    const i = y * w + x;
    if (sx < 0 || sy < 0 || sx > w - 1 || sy > h - 1) { bad[i] = 1; continue; }
    const x0 = Math.min(w - 2, Math.floor(sx)), y0 = Math.min(h - 2, Math.floor(sy)), fx = sx - x0, fy = sy - y0, j = y0 * w + x0;
    out[i] = (lum[j]! * (1 - fx) + lum[j + 1]! * fx) * (1 - fy) + (lum[j + w]! * (1 - fx) + lum[j + w + 1]! * fx) * fy;
    const k = (Math.round(sy) * w + Math.round(sx)) * 4, r = rgba[k]!, g = rgba[k + 1]!, b = rgba[k + 2]!;
    // Blown, or (a handheld photo lined up, lineup.ts) outside what it covers.
    if (r >= 250 || g >= 250 || b >= 250 || rgba[k + 3]! < 255) bad[i] = 1;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    sat[i] = mx > 0 ? (mx - mn) / mx : 0;
    white[i] = mx >= GLINT_WHITE ? 1 : 0;
  }
  return { lum: out, bad, sat, white };
}
