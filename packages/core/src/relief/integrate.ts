// integrate.ts — a height from its slopes. Ported from v1 src/lampphotos.js (integrate, sharpen).
//
// The least-squares surface whose steps between neighbours match the slopes, edges free
// (Neumann). Multigrid W-cycles on cell-centred grids (red-black Gauss-Seidel, bilinear
// prolongation), so the whole picture settles in a few passes rather than the thousands plain
// relaxation would need.

import { removeMean } from './box.ts';
import type { Seen } from './shading.ts';

/** Sharpen rounds along the light where it came from one side only. */
export const ONE_DIRECTION_ROUNDS = 12;

interface Grid { w: number; h: number; u: Float32Array; f: Float32Array; r: Float32Array }

/** The height (mean 0, in pixels) whose slopes are (hx, hy). */
export function integrate(hx: Float32Array, hy: Float32Array, w: number, h: number, cycles = 3): Float32Array {
  const f = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const px = x < w - 1 ? 0.5 * (hx[i]! + hx[i + 1]!) : 0, pxm = x > 0 ? 0.5 * (hx[i - 1]! + hx[i]!) : 0;
    const py = y < h - 1 ? 0.5 * (hy[i]! + hy[i + w]!) : 0, pym = y > 0 ? 0.5 * (hy[i - w]! + hy[i]!) : 0;
    f[i] = px - pxm + py - pym;
  }
  const levels: Grid[] = [{ w, h, u: new Float32Array(w * h), f, r: new Float32Array(w * h) }];
  for (let L = levels[0]!; L.w > 3 && L.h > 3; ) {
    const cw = (L.w + 1) >> 1, ch = (L.h + 1) >> 1;
    L = { w: cw, h: ch, u: new Float32Array(cw * ch), f: new Float32Array(cw * ch), r: new Float32Array(cw * ch) };
    levels.push(L);
  }
  for (let c = 0; c < cycles; c++) { wcycle(levels, 0); removeMean(levels[0]!.u); }
  return levels[0]!.u;
}

/**
 * The height's slopes as the renderer reads them (central differences) brought back to the
 * measured ones. integrate matches each step between neighbours to the mean of their two
 * slopes, and a central difference averages two such steps again, so a slope comes back as
 * about cos^2(k / 2) of itself at k radians per pixel: half at a 4 px period. Integrating what
 * is still missing and adding it (a Van Cittert round) restores it; more than one round
 * overshoots, the finest slopes being partly noise.
 *
 * Where the shots lit a pixel from one direction only (`seen`), only the slope along it was
 * measured; the one across is unknown, not 0, but integrate takes it as 0 and gives up part of
 * the slope along the light with it. So `oneRounds` more rounds add back only what is missing
 * along the measured direction, leaving the slope across free (v1 docs/real-light-test.md,
 * "10-28, rough surface": the lintel's slope along the sun went from 0.56 to 0.95 of the measured).
 */
export function sharpen(height: Float32Array, hx: Float32Array, hy: Float32Array, w: number, h: number, rounds = 1, seen: Seen | null = null, oneRounds = ONE_DIRECTION_ROUNDS): Float32Array {
  const n = w * h;
  const total = rounds + (seen && seen.one.some((v) => v > 0) ? oneRounds : 0);
  const rx = new Float32Array(n), ry = new Float32Array(n);
  for (let k = 0; k < total; k++) {
    const along = k >= rounds;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let ax = x > 0 && x < w - 1 ? hx[i]! - 0.5 * (height[i + 1]! - height[i - 1]!) : 0;
      let ay = y > 0 && y < h - 1 ? hy[i]! - 0.5 * (height[i + w]! - height[i - w]!) : 0;
      if (along) {
        // Through float32, as v1 held them, before the projection.
        ax = Math.fround(ax); ay = Math.fround(ay);
        const t = seen!.one[i]! * (ax * seen!.ex[i]! + ay * seen!.ey[i]!);
        ax = t * seen!.ex[i]!; ay = t * seen!.ey[i]!;
      }
      rx[i] = ax; ry[i] = ay;
    }
    const add = integrate(rx, ry, w, h);
    for (let i = 0; i < n; i++) height[i]! += add[i]!;
  }
  return height;
}

function smooth(L: Grid, iters: number): void {
  const { w, h, u, f } = L;
  for (let it = 0; it < iters; it++) for (let colour = 0; colour < 2; colour++) {
    for (let y = 0; y < h; y++) {
      const row = y * w, inner = y > 0 && y < h - 1;
      for (let x = (y + colour) & 1; x < w; x += 2) {
        const i = row + x;
        if (inner && x > 0 && x < w - 1) { u[i] = (u[i - 1]! + u[i + 1]! + u[i - w]! + u[i + w]! - f[i]!) / 4; continue; }
        let s = 0, d = 0;
        if (x > 0) { s += u[i - 1]!; d++; }
        if (x < w - 1) { s += u[i + 1]!; d++; }
        if (y > 0) { s += u[i - w]!; d++; }
        if (y < h - 1) { s += u[i + w]!; d++; }
        if (d) u[i] = (s - f[i]!) / d;
      }
    }
  }
}

function residual(L: Grid): void {
  const { w, h, u, f, r } = L;
  for (let y = 0; y < h; y++) {
    const inner = y > 0 && y < h - 1;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (inner && x > 0 && x < w - 1) { r[i] = f[i]! - (u[i - 1]! + u[i + 1]! + u[i - w]! + u[i + w]! - 4 * u[i]!); continue; }
      let s = 0, d = 0;
      if (x > 0) { s += u[i - 1]!; d++; }
      if (x < w - 1) { s += u[i + 1]!; d++; }
      if (y > 0) { s += u[i - w]!; d++; }
      if (y < h - 1) { s += u[i + w]!; d++; }
      r[i] = f[i]! - (s - d * u[i]!);
    }
  }
}

function wcycle(levels: Grid[], k: number): void {
  const L = levels[k]!;
  if (k === levels.length - 1) { smooth(L, 80); return; }
  smooth(L, 2);
  residual(L);
  const C = levels[k + 1]!;
  // Coarse right-hand side: four times the mean of the children (spacing 2).
  const cf = C.f, cu = C.u, lr = L.r, lu = L.u, lw = L.w, lh = L.h, cw = C.w, ch = C.h, oddW = lw & 1;
  cf.fill(0);
  for (let y = 0; y < lh; y++) {
    const o = y * lw, c = (y >> 1) * cw, full = lw >> 1;
    for (let X = 0; X < full; X++) { cf[c + X]! += lr[o + 2 * X]!; cf[c + X]! += lr[o + 2 * X + 1]!; }
    if (oddW) cf[c + full]! += lr[o + lw - 1]!;
  }
  for (let Y = 0; Y < ch; Y++) {
    const ny = 2 * Y + 1 < lh ? 2 : 1, c = Y * cw;
    for (let X = 0; X < cw; X++) cf[c + X]! *= 4 / (ny * (2 * X + 1 < lw ? 2 : 1));
  }
  removeMean(cf);
  cu.fill(0);
  wcycle(levels, k + 1);
  wcycle(levels, k + 1);
  // Bilinear prolongation: a fine cell sits a quarter of a coarse cell from its parent.
  for (let y = 0; y < lh; y++) {
    const Y = y >> 1, Yn = Math.min(ch - 1, Math.max(0, y & 1 ? Y + 1 : Y - 1)), o = y * lw, a = Y * cw, b = Yn * cw;
    for (let X = 0; X < cw; X++) {
      const m = X > 0 ? X - 1 : 0, x = o + 2 * X;
      lu[x]! += 0.5625 * cu[a + X]! + 0.1875 * (cu[a + m]! + cu[b + X]!) + 0.0625 * cu[b + m]!;
      if (2 * X + 1 < lw) {
        const p = X < cw - 1 ? X + 1 : X;
        lu[x + 1]! += 0.5625 * cu[a + X]! + 0.1875 * (cu[a + p]! + cu[b + X]!) + 0.0625 * cu[b + p]!;
      }
    }
  }
  smooth(L, 2);
}
