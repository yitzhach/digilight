// features.ts — SIFT-like features for lining up a handheld photo (lineup.ts). Ported from v1
// src/lineup.js: difference-of-Gaussian blobs, a dominant gradient direction, a 4 x 4 x 8
// gradient histogram, found on two copies of each photo: brightness, and the colour ratio
// r / (r + g + b), each with its contrast evened out locally. The light changes brightness far
// more than the paint's colour, so the colour ratio keeps matches where raking sun has changed
// the brightness pattern (on Isaac's lintel panel brightness alone kept 6 of 18).

import { datan2, dcos, dexp, dpow, dsin, PI } from '../dmath.ts';
import { boxBlur } from './box.ts';

const WORK = 1000;              // features are found on copies this wide
const OCTAVE_LAYERS = 3, SIGMA0 = 1.6, CONTRAST = 0.02, EDGE = 10, MAX_FEATURES = 4000;
const RATIO = 0.8;

export interface Feature { x: number; y: number; s: number; r: number; d: Float32Array }
export interface WorkCopy { W: number; H: number; /** working pixels per source pixel */ k: [number, number]; chans: Float32Array[] }

/** Separable Gaussian blur (kernel cut at 3 sigma, edges clamped). */
function gauss(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  if (sigma < 0.2) return Float32Array.from(src);
  const r = Math.max(1, Math.ceil(3 * sigma)), k = new Float32Array(2 * r + 1);
  let s = 0;
  for (let i = -r; i <= r; i++) { const v = dexp((-i * i) / (2 * sigma * sigma)); k[i + r] = v; s += v; }
  for (let i = 0; i < k.length; i++) k[i]! /= s;
  const t = new Float32Array(w * h), out = new Float32Array(w * h), acc = new Float64Array(w);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) {
      let v = 0;
      if (x >= r && x < w - r) for (let i = 0, p = o + x - r; i < k.length; i++) v += k[i]! * src[p + i]!;
      else for (let i = -r; i <= r; i++) v += k[i + r]! * src[o + Math.min(w - 1, Math.max(0, x + i))]!;
      t[o + x] = v;
    }
  }
  for (let y = 0; y < h; y++) {
    acc.fill(0);
    for (let i = -r; i <= r; i++) { const o = Math.min(h - 1, Math.max(0, y + i)) * w, kk = k[i + r]!; for (let x = 0; x < w; x++) acc[x]! += kk * t[o + x]!; }
    out.set(acc, y * w);
  }
  return out;
}

const tanh = (x: number) => { const e = dexp(-2 * Math.abs(x)), t = (1 - e) / (1 + e); return x < 0 ? -t : t; };

// Local contrast evened out: the local mean taken off and the local spread divided out, over a
// window an eighth of the picture across, then squashed to 0..1.
function evenOut(a: Float32Array, w: number, h: number): Float32Array {
  const r = Math.max(w, h) / 16, m = boxBlur(a, w, h, r), d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) { const e = a[i]! - m[i]!; d[i] = e * e; }
  const v = boxBlur(d, w, h, r), out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = 0.5 + 0.5 * tanh((a[i]! - m[i]!) / (Math.sqrt(v[i]!) + 1e-3) / 2.5);
  return out;
}

/** RGBA bytes at w x h as the two channels at about WORK px wide (area average). */
export function workChannels(rgba: ArrayLike<number>, w: number, h: number): WorkCopy {
  const k = Math.min(1, WORK / Math.max(w, h)), W = Math.max(8, Math.round(w * k)), H = Math.max(8, Math.round(h * k));
  const lum = new Float32Array(W * H), rat = new Float32Array(W * H), cnt = new Float32Array(W * H);
  const sx = W / w, sy = H / h;
  for (let y = 0; y < h; y++) {
    const Y = Math.min(H - 1, Math.floor(y * sy));
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, j = Y * W + Math.min(W - 1, Math.floor(x * sx));
      const r = rgba[i]!, g = rgba[i + 1]!, b = rgba[i + 2]!;
      lum[j]! += (0.299 * r + 0.587 * g + 0.114 * b) / 255; rat[j]! += (r + 1) / (r + g + b + 3); cnt[j]!++;
    }
  }
  for (let j = 0; j < W * H; j++) { lum[j]! /= cnt[j] || 1; rat[j]! /= cnt[j] || 1; }
  return { W, H, k: [W / w, H / h], chans: [evenOut(lum, W, H), evenOut(rat, W, H)] };
}

function half(a: Float32Array, w: number, h: number) {
  const W = w >> 1, H = h >> 1, o = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) o[y * W + x] = a[2 * y * w + 2 * x]!;
  return { a: o, w: W, h: H };
}

interface Grad { mag: Float32Array; ang: Float32Array }

/** The features of one channel, strongest first; x, y in its pixels. */
export function features(img: Float32Array, w: number, h: number): Feature[] {
  const out: Feature[] = [];
  let base = gauss(img, w, h, Math.sqrt(SIGMA0 * SIGMA0 - 0.25)), bw = w, bh = h, step = 1;
  const kf = dpow(2, 1 / OCTAVE_LAYERS), sig = Array.from({ length: OCTAVE_LAYERS + 3 }, (_, i) => SIGMA0 * dpow(kf, i));
  while (Math.min(bw, bh) >= 32) {
    // Gaussians at SIGMA0 kf^i, i = 0 .. OCTAVE_LAYERS + 2, each blurred from the one before.
    const G = [base];
    for (let i = 1; i < OCTAVE_LAYERS + 3; i++) G.push(gauss(G[i - 1]!, bw, bh, Math.sqrt(sig[i]! * sig[i]! - sig[i - 1]! * sig[i - 1]!)));
    const D: Float32Array[] = [];
    for (let i = 0; i + 1 < G.length; i++) { const d = new Float32Array(bw * bh), a = G[i]!, b = G[i + 1]!; for (let j = 0; j < d.length; j++) d[j] = b[j]! - a[j]!; D.push(d); }
    // Gradient size and direction of the Gaussians the features are described on.
    const grads: (Grad | null)[] = G.map((g, l) => {
      if (l < 1 || l > OCTAVE_LAYERS) return null;
      const mag = new Float32Array(bw * bh), ang = new Float32Array(bw * bh);
      for (let y = 1; y < bh - 1; y++) for (let x = 1; x < bw - 1; x++) {
        const i = y * bw + x, dx = g[i + 1]! - g[i - 1]!, dy = g[i + bw]! - g[i - bw]!;
        mag[i] = Math.sqrt(dx * dx + dy * dy); ang[i] = datan2(dy, dx);
      }
      return { mag, ang };
    });
    for (let l = 1; l <= OCTAVE_LAYERS; l++) {
      const a = D[l - 1]!, b = D[l]!, c = D[l + 1]!;
      for (let y = 8; y < bh - 8; y++) for (let x = 8; x < bw - 8; x++) {
        const i = y * bw + x, v = b[i]!;
        if (Math.abs(v) < CONTRAST / OCTAVE_LAYERS) continue;
        let ext = true;
        const isMax = v > 0;
        for (let dy = -1; dy <= 1 && ext; dy++) for (let dx = -1; dx <= 1 && ext; dx++) {
          const j = i + dy * bw + dx;
          if (isMax ? (a[j]! >= v || c[j]! >= v || (j !== i && b[j]! >= v)) : (a[j]! <= v || c[j]! <= v || (j !== i && b[j]! <= v))) ext = false;
        }
        if (!ext) continue;
        // Edges: the ratio of principal curvatures (Lowe's test).
        const dxx = b[i + 1]! + b[i - 1]! - 2 * v, dyy = b[i + bw]! + b[i - bw]! - 2 * v;
        const dxy = 0.25 * (b[i + bw + 1]! - b[i + bw - 1]! - b[i - bw + 1]! + b[i - bw - 1]!);
        const tr = dxx + dyy, det = dxx * dyy - dxy * dxy;
        if (det <= 0 || tr * tr * EDGE >= (EDGE + 1) * (EDGE + 1) * det) continue;
        // Sub-pixel place: a parabola through the neighbours on each axis.
        const ox = dxx !== 0 ? Math.max(-0.5, Math.min(0.5, (-0.5 * (b[i + 1]! - b[i - 1]!)) / dxx)) : 0;
        const oy = dyy !== 0 ? Math.max(-0.5, Math.min(0.5, (-0.5 * (b[i + bw]! - b[i - bw]!)) / dyy)) : 0;
        for (const d of describe(grads[l]!, bw, bh, x + ox, y + oy, sig[l]!)) out.push({ x: (x + ox) * step, y: (y + oy) * step, s: sig[l]! * step, r: Math.abs(v), d });
      }
    }
    const n = half(G[OCTAVE_LAYERS]!, bw, bh);
    base = n.a; bw = n.w; bh = n.h; step *= 2;
  }
  out.sort((p, q) => q.r - p.r);
  return out.slice(0, MAX_FEATURES);
}

/** exp(-d^2 / s2) for d = -R..R from a centre offset `frac` off the grid. */
function bell(R: number, frac: number, s2: number): Float64Array {
  const t = new Float64Array(2 * R + 1);
  for (let d = -R; d <= R; d++) t[d + R] = dexp(-((d - frac) * (d - frac)) / s2);
  return t;
}

// The dominant directions at a point (peaks of a 36-bin histogram within 80% of the highest)
// and the 128-number descriptor turned to each (at most two).
function describe(g: Grad, w: number, h: number, x: number, y: number, sigma: number): Float32Array[] {
  const { mag, ang } = g;
  const hist = new Float32Array(36), R = Math.round(4.5 * sigma), cx = Math.round(x), cy = Math.round(y), s15 = 1.5 * sigma, wt = bell(R, 0, 2 * s15 * s15);
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const X = cx + dx, Y = cy + dy;
    if (X < 1 || Y < 1 || X >= w - 1 || Y >= h - 1) continue;
    const i = Y * w + X, bin = Math.floor(((ang[i]! + PI) / (2 * PI)) * 36) % 36;
    hist[bin]! += mag[i]! * wt[dx + R]! * wt[dy + R]!;
  }
  const sm = hist.map((_, i) => (hist[(i + 35) % 36]! + 2 * hist[i]! + hist[(i + 1) % 36]!) / 4);
  let top = 0;
  for (const v of sm) top = Math.max(top, v);
  const out: Float32Array[] = [];
  for (let i = 0; i < 36 && out.length < 2; i++) {
    const l = sm[(i + 35) % 36]!, c = sm[i]!, r = sm[(i + 1) % 36]!;
    if (c < 0.8 * top || c <= l || c <= r) continue;
    const off = (0.5 * (l - r)) / (l - 2 * c + r), theta = ((i + 0.5 + off) / 36) * 2 * PI - PI;
    out.push(descriptor(mag, ang, w, h, x, y, sigma, theta));
  }
  return out;
}

function descriptor(mag: Float32Array, ang: Float32Array, w: number, h: number, x: number, y: number, sigma: number, theta: number): Float32Array {
  const d = new Float32Array(128), cell = 3 * sigma, R = Math.round(cell * 2.5 * Math.SQRT2), co = dcos(theta), si = dsin(theta);
  const cx = Math.round(x), cy = Math.round(y);
  // The weight exp(-(u^2 + v^2) / 8) is round, so it splits into one factor per axis.
  const wx = bell(R, x - cx, 8 * cell * cell), wy = bell(R, y - cy, 8 * cell * cell);
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const X = cx + dx, Y = cy + dy;
    if (X < 1 || Y < 1 || X >= w - 1 || Y >= h - 1) continue;
    // Into the point's own frame, in cells; cells span -2..2.
    const u = (co * (X - x) + si * (Y - y)) / cell, v = (-si * (X - x) + co * (Y - y)) / cell;
    const fu = u + 1.5, fv = v + 1.5;
    if (fu <= -1 || fu >= 4 || fv <= -1 || fv >= 4) continue;
    const i = Y * w + X, m = mag[i]! * wx[dx + R]! * wy[dy + R]!;
    let o = ((ang[i]! - theta) / (2 * PI)) * 8;
    o = ((o % 8) + 8) % 8;
    const u0 = Math.floor(fu), v0 = Math.floor(fv), o0 = Math.floor(o), tu = fu - u0, tv = fv - v0, to = o - o0;
    for (let a = 0; a < 2; a++) {
      const U = u0 + a;
      if (U < 0 || U > 3) continue;
      for (let b = 0; b < 2; b++) {
        const V = v0 + b;
        if (V < 0 || V > 3) continue;
        const wuv = (a ? tu : 1 - tu) * (b ? tv : 1 - tv);
        d[(V * 4 + U) * 8 + (o0 % 8)]! += m * wuv * (1 - to);
        d[(V * 4 + U) * 8 + ((o0 + 1) % 8)]! += m * wuv * to;
      }
    }
  }
  // Normalised, large bins clipped (lighting), normalised again.
  let n = 0;
  for (let i = 0; i < 128; i++) n += d[i]! * d[i]!;
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < 128; i++) d[i] = Math.min(0.2, d[i]! / n);
  n = 0;
  for (let i = 0; i < 128; i++) n += d[i]! * d[i]!;
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < 128; i++) d[i]! /= n;
  return d;
}

/** Matches of features `a` in features `b` passing Lowe's ratio test: [[ia, ib], ...]. */
export function match(a: Feature[], b: Feature[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < a.length; i++) {
    const p = a[i]!.d;
    let best = Infinity, second = Infinity, bj = -1;
    for (let j = 0; j < b.length; j++) {
      const q = b[j]!.d;
      let s = 0;
      for (let k = 0; k < 128; k++) { const t = p[k]! - q[k]!; s += t * t; if (s >= second) break; }
      if (s < best) { second = best; best = s; bj = j; } else if (s < second) second = s;
    }
    if (bj >= 0 && best < RATIO * RATIO * second) out.push([i, bj]);
  }
  return out;
}
