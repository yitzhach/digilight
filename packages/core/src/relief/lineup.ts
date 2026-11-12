// lineup.ts — a handheld photo of the piece lined up onto the flat photo. Ported from v1
// src/lineup.js.
//
// A side-lit photo is taken by hand, from another spot: the piece sits elsewhere in the frame,
// larger or smaller, a little turned and in another perspective. Since the piece is flat, one
// homography takes it onto the flat photo: features (features.ts) matched with Lowe's ratio
// test, pooled over two channels, then a RANSAC homography refitted on its inliers. Features
// crowd where the piece has the most texture (and on anything standing off it, whose parallax
// pulls the fit), so the homography is then refined over the whole piece: patches on a grid
// matched on colour (as align.ts does for a tripod's creep), dropping the ones that disagree.

import { bestShift, colourBands, parabola } from './align.ts';
import { features, match, workChannels } from './features.ts';

const RANSAC_PX = 3, RANSAC_ITERS = 3000; // RANSAC_PX in working pixels
const REFINE_GRID = 9, REFINE_REACH = 6;

type Bytes = ArrayLike<number>;
type Pt = [number, number];
/** A homography, row-major 3 x 3: (x, y) goes to ((h0 x + h1 y + h2) / w, (h3 x + h4 y + h5) / w),
 *  w = h6 x + h7 y + h8. */
export type Homography = number[];
export interface LineUp {
  /** Flat-photo pixel to handheld-photo pixel; null when too few matches agree (under 12). */
  H: Homography | null;
  matches: number; inliers: number;
  /** Grid patches the refined fit kept, and their median distance from it in flat-photo pixels. */
  patches?: number; errorPx: number | null;
  /** Share of the flat photo the handheld one covers. */
  covered: number;
}

export function applyH(H: Homography, x: number, y: number): Pt {
  const w = H[6]! * x + H[7]! * y + H[8]!;
  return [(H[0]! * x + H[1]! * y + H[2]!) / w, (H[3]! * x + H[4]! * y + H[5]!) / w];
}

export function invertH(H: Homography): Homography {
  const [a, b, c, d, e, f, g, h, i] = H as [number, number, number, number, number, number, number, number, number];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((v) => v / det);
}

function mul3(a: number[], b: number[]): number[] {
  const o = new Array<number>(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) o[i * 3 + j]! += a[i * 3 + k]! * b[k * 3 + j]!;
  return o;
}

// Gaussian elimination with partial pivoting.
function solve(M: Float64Array, v: Float64Array, n: number): number[] | null {
  const a = Float64Array.from(M), b = Float64Array.from(v);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r * n + c]!) > Math.abs(a[p * n + c]!)) p = r;
    if (Math.abs(a[p * n + c]!) < 1e-12) return null;
    if (p !== c) {
      for (let k = 0; k < n; k++) { const t = a[c * n + k]!; a[c * n + k] = a[p * n + k]!; a[p * n + k] = t; }
      const t = b[c]!; b[c] = b[p]!; b[p] = t;
    }
    for (let r = c + 1; r < n; r++) {
      const f = a[r * n + c]! / a[c * n + c]!;
      if (!f) continue;
      for (let k = c; k < n; k++) a[r * n + k]! -= f * a[c * n + k]!;
      b[r]! -= f * b[c]!;
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) { let s = b[r]!; for (let k = r + 1; k < n; k++) s -= a[r * n + k]! * x[k]!; x[r] = s / a[r * n + r]!; }
  return Array.from(x);
}

// Least squares through point pairs (normalised first, Hartley), h8 = 1.
function fitH(src: Pt[], dst: Pt[]): Homography | null {
  const norm = (pts: Pt[]) => {
    let mx = 0, my = 0;
    for (const [x, y] of pts) { mx += x; my += y; }
    mx /= pts.length; my /= pts.length;
    let d = 0;
    for (const [x, y] of pts) d += Math.sqrt((x - mx) * (x - mx) + (y - my) * (y - my));
    d = d / pts.length || 1;
    const s = Math.SQRT2 / d;
    return { s, mx, my, p: pts.map(([x, y]): Pt => [(x - mx) * s, (y - my) * s]) };
  };
  const A = norm(src), B = norm(dst), M = new Float64Array(64), v = new Float64Array(8);
  for (let i = 0; i < src.length; i++) {
    const [x, y] = A.p[i]!, [u, w] = B.p[i]!;
    const rows: [number[], number][] = [[[x, y, 1, 0, 0, 0, -u * x, -u * y], u], [[0, 0, 0, x, y, 1, -w * x, -w * y], w]];
    for (const [r, t] of rows) for (let a = 0; a < 8; a++) { v[a]! += r[a]! * t; for (let b = 0; b < 8; b++) M[a * 8 + b]! += r[a]! * r[b]!; }
  }
  const h = solve(M, v, 8);
  if (!h) return null;
  // Undo the normalisation: H = TB^-1 Hn TA.
  const TA = [A.s, 0, -A.s * A.mx, 0, A.s, -A.s * A.my, 0, 0, 1], TBi = [1 / B.s, 0, B.mx, 0, 1 / B.s, B.my, 0, 0, 1];
  const H = mul3(TBi, mul3([...h, 1], TA));
  return H.map((e) => e / H[8]!);
}

// v1's seeded generator, so the same photos always give the same lining up.
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

/** RANSAC over the pairs (src to dst), then refitted on the inliers twice. */
function ransac(src: Pt[], dst: Pt[]): { H: Homography | null; inliers: number[] } {
  const n = src.length, rand = rng(12345), lim2 = RANSAC_PX * RANSAC_PX;
  let best: Homography | null = null, bestIn: number[] = [];
  const inliers = (H: Homography) => {
    const k: number[] = [];
    for (let i = 0; i < n; i++) { const [x, y] = applyH(H, src[i]![0], src[i]![1]), ex = x - dst[i]![0], ey = y - dst[i]![1]; if (ex * ex + ey * ey < lim2) k.push(i); }
    return k;
  };
  for (let it = 0; it < RANSAC_ITERS; it++) {
    const pick = new Set<number>();
    while (pick.size < 4) pick.add(Math.floor(rand() * n));
    const p = [...pick], H = fitH(p.map((i) => src[i]!), p.map((i) => dst[i]!));
    if (!H || !(Math.abs(H[6]!) < 0.01 && Math.abs(H[7]!) < 0.01)) continue; // no wild perspective
    const k = inliers(H);
    if (k.length > bestIn.length) { best = H; bestIn = k; }
  }
  for (let r = 0; r < 2 && bestIn.length >= 8; r++) {
    const H = fitH(bestIn.map((i) => src[i]!), bestIn.map((i) => dst[i]!));
    if (!H) break;
    const k = inliers(H);
    if (k.length < bestIn.length) break;
    best = H; bestIn = k;
  }
  return { H: best, inliers: bestIn };
}

// Patches on a grid over the flat photo, matched in the other photo drawn in its frame by H, to
// a fraction of a pixel; then H refitted through them, the worst dropped until the rest agree.
function refine(ref: Bytes, w: number, h: number, mov: Bytes, mw: number, mh: number, H: Homography) {
  const warped = warpPhoto(mov, mw, mh, H, w, h, w, h);
  const A = colourBands(ref, w, h), B = colourBands(warped, w, h);
  const P = Math.max(24, Math.min(96, Math.floor(Math.min(w, h) / 12))), R = REFINE_REACH, inset = P / 2 + R + 3;
  const src: Pt[] = [], dst: Pt[] = [];
  for (let gy = 0; gy < REFINE_GRID; gy++) for (let gx = 0; gx < REFINE_GRID; gx++) {
    const cx = Math.round(inset + ((w - 2 * inset) * gx) / (REFINE_GRID - 1)), cy = Math.round(inset + ((h - 2 * inset) * gy) / (REFINE_GRID - 1));
    const x0 = cx - (P >> 1), y0 = cy - (P >> 1);
    // Patches the other photo does not fully cover are no use.
    let full = true;
    for (let y = y0 - R; y < y0 + P + R && full; y += 4) for (let x = x0 - R; x < x0 + P + R; x += 4) if (warped[(y * w + x) * 4 + 3]! < 255) { full = false; break; }
    if (!full) continue;
    const f = bestShift(A, B, w, x0, y0, P, 0, 0, R);
    if (f.best < 0.3 || Math.abs(f.bx) === R || Math.abs(f.by) === R) continue;
    const dx = f.bx + parabola(f.at(f.bx - 1, f.by), f.best, f.at(f.bx + 1, f.by)), dy = f.by + parabola(f.at(f.bx, f.by - 1), f.best, f.at(f.bx, f.by + 1));
    src.push([cx, cy]); dst.push(applyH(H, cx + dx, cy + dy));
  }
  let keep = src.map(() => true), out = H, med: number | null = null;
  for (let it = 0; it < 5; it++) {
    const use = src.map((_, i) => i).filter((i) => keep[i]);
    if (use.length < 12) return { H: out, used: use.length, of: src.length, errorPx: med };
    const Hn = fitH(use.map((i) => src[i]!), use.map((i) => dst[i]!));
    if (!Hn) break;
    out = Hn;
    const Hi = invertH(out), err = src.map((p, i) => { const [x, y] = applyH(Hi, dst[i]![0], dst[i]![1]), ex = x - p[0], ey = y - p[1]; return Math.sqrt(ex * ex + ey * ey); });
    med = use.map((i) => err[i]!).sort((a, b) => a - b)[use.length >> 1]!;
    const lim = Math.max(0.5, 2.5 * med), next = err.map((e) => e < lim);
    if (next.every((v, i) => v === keep[i])) break;
    keep = next;
  }
  return { H: out, used: keep.filter(Boolean).length, of: src.length, errorPx: med };
}

/** Where each pixel of the flat photo (`ref`, rw x rh RGBA) is in the handheld photo (`mov`). */
export function lineUp(ref: Bytes, rw: number, rh: number, mov: Bytes, mw: number, mh: number): LineUp {
  const A = workChannels(ref, rw, rh), B = workChannels(mov, mw, mh);
  const src: Pt[] = [], dst: Pt[] = [];
  for (let c = 0; c < 2; c++) {
    const fa = features(A.chans[c]!, A.W, A.H), fb = features(B.chans[c]!, B.W, B.H);
    for (const [i, j] of match(fa, fb)) {
      // In each photo's own pixels.
      src.push([(fa[i]!.x + 0.5) / A.k[0] - 0.5, (fa[i]!.y + 0.5) / A.k[1] - 0.5]);
      dst.push([(fb[j]!.x + 0.5) / B.k[0] - 0.5, (fb[j]!.y + 0.5) / B.k[1] - 0.5]);
    }
  }
  if (src.length < 12) return { H: null, matches: src.length, inliers: 0, errorPx: null, covered: 0 };
  // RANSAC in working pixels of the flat photo (its threshold is in those).
  const s = A.k[0], sm = B.k[0];
  const { H: Hw, inliers } = ransac(src.map(([x, y]): Pt => [x * s, y * s]), dst.map(([x, y]): Pt => [x * sm, y * sm]));
  if (!Hw || inliers.length < 12) return { H: null, matches: src.length, inliers: inliers.length, errorPx: null, covered: 0 };
  const H = mul3([1 / sm, 0, 0, 0, 1 / sm, 0, 0, 0, 1], mul3(Hw, [s, 0, 0, 0, s, 0, 0, 0, 1]));
  let Hn = H.map((v) => v / H[8]!);
  // Twice: the first pass can start a few pixels out, beyond a patch's reach at the edges.
  let fine = refine(ref, rw, rh, mov, mw, mh, Hn);
  Hn = fine.H.map((v) => v / fine.H[8]!);
  fine = refine(ref, rw, rh, mov, mw, mh, Hn);
  Hn = fine.H.map((v) => v / fine.H[8]!);
  let cov = 0, tot = 0;
  for (let y = 0; y < rh; y += 8) for (let x = 0; x < rw; x += 8) { const [u, v] = applyH(Hn, x, y); tot++; if (u >= 0 && v >= 0 && u <= mw - 1 && v <= mh - 1) cov++; }
  return { H: Hn, matches: src.length, inliers: inliers.length, errorPx: fine.errorPx, covered: cov / tot, patches: fine.used };
}

/**
 * The handheld photo drawn in the flat photo's frame: an outW x outH RGBA picture whose pixel
 * (x, y) shows `mov` at H applied to the flat photo's pixel (x, y) * (rw / outW). Bilinear,
 * averaged over 2 x 2 samples where the photo is shrunk; transparent outside it.
 */
export function warpPhoto(mov: Bytes, mw: number, mh: number, H: Homography, rw: number, rh: number, outW: number, outH: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(outW * outH * 4), kx = rw / outW, ky = rh / outH;
  // How many photo pixels one output pixel spans (at the centre), for the supersampling.
  const [a0, b0] = applyH(H, rw / 2, rh / 2), [a1, b1] = applyH(H, rw / 2 + kx, rh / 2);
  const ss = Math.sqrt((a1 - a0) * (a1 - a0) + (b1 - b0) * (b1 - b0)) > 1.2 ? 2 : 1;
  const [h0, h1, h2, h3, h4, h5, h6, h7, h8] = H as [number, number, number, number, number, number, number, number, number];
  for (let y = 0; y < outH; y++) for (let x = 0; x < outW; x++) {
    let n = 0, r = 0, g = 0, b = 0;
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const X = (x + (sx + 0.5) / ss) * kx - 0.5, Y = (y + (sy + 0.5) / ss) * ky - 0.5, q = h6 * X + h7 * Y + h8;
      const u = (h0 * X + h1 * Y + h2) / q, v = (h3 * X + h4 * Y + h5) / q;
      if (!(u >= 0 && v >= 0 && u <= mw - 1 && v <= mh - 1)) continue;
      const x0 = Math.min(mw - 2, Math.floor(u)), y0 = Math.min(mh - 2, Math.floor(v)), fx = u - x0, fy = v - y0, j = (y0 * mw + x0) * 4, j2 = j + mw * 4;
      r += (mov[j]! * (1 - fx) + mov[j + 4]! * fx) * (1 - fy) + (mov[j2]! * (1 - fx) + mov[j2 + 4]! * fx) * fy;
      g += (mov[j + 1]! * (1 - fx) + mov[j + 5]! * fx) * (1 - fy) + (mov[j2 + 1]! * (1 - fx) + mov[j2 + 5]! * fx) * fy;
      b += (mov[j + 2]! * (1 - fx) + mov[j + 6]! * fx) * (1 - fy) + (mov[j2 + 2]! * (1 - fx) + mov[j2 + 6]! * fx) * fy;
      n++;
    }
    const o = (y * outW + x) * 4;
    if (n === ss * ss) { out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255; }
  }
  return out;
}
