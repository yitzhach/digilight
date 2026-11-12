// sample.ts — the relief maps and reading them at a picture point (BUILD.md §5.2: bilinear on
// the stored values; for the horizon table and ao, the bytes are interpolated, then decoded).

import { datan2, PI } from '../dmath.ts';
import type { Height } from './estimate.ts';
import { K, type Horizon } from './horizon.ts';

export type ReliefMaps = Height & Horizon;

/** Reads the maps at one point at a time: set(x, y), then slopes, occlusion and horizon. */
export class ReliefSampler {
  readonly m: ReliefMaps;
  private n: number;
  private i00 = 0; private i10 = 0; private i01 = 0; private i11 = 0; private fx = 0; private fy = 0;
  /** hHat slopes at the point (per picture width). */
  p = 0; q = 0;

  constructor(m: ReliefMaps) { this.m = m; this.n = m.width * m.height; }

  /** Moves to picture point (x, y) (picture widths, y down) and reads the slopes. */
  set(x: number, y: number): void {
    const { width: w, height: h } = this.m;
    const u = Math.min(w - 1, Math.max(0, x * w - 0.5)), v = Math.min(h - 1, Math.max(0, y * w - 0.5));
    const x0 = Math.min(w - 2, Math.floor(u)), y0 = Math.min(h - 2, Math.floor(v));
    const X0 = Math.max(0, x0), Y0 = Math.max(0, y0), X1 = Math.min(w - 1, X0 + 1), Y1 = Math.min(h - 1, Y0 + 1);
    this.fx = u - X0; this.fy = v - Y0;
    this.i00 = Y0 * w + X0; this.i10 = Y0 * w + X1; this.i01 = Y1 * w + X0; this.i11 = Y1 * w + X1;
    this.p = this.lerp(this.m.p, 0); this.q = this.lerp(this.m.q, 0);
  }

  private lerp(a: ArrayLike<number>, o: number): number {
    const { fx, fy } = this;
    const top = a[o + this.i00]! + (a[o + this.i10]! - a[o + this.i00]!) * fx;
    const bot = a[o + this.i01]! + (a[o + this.i11]! - a[o + this.i01]!) * fx;
    return top + (bot - top) * fy;
  }

  /** occl(P) for a depth (§5.6): xd / (1 + xd), xd = 2 depth x. */
  occl(depth: number): number {
    const b = this.lerp(this.m.ao, 0) / 255, x = b / (1 - b || 1e-12), xd = 2 * depth * x;
    return xd / (1 + xd);
  }

  /** That toward (lx, ly) (§5.6 horizonAt), per picture width of unit height. */
  horizon(lx: number, ly: number): number {
    const [k0, t] = layerOf(lx, ly);
    return this.horizonAt(k0, t);
  }

  /** Same, for a direction already split into its layer k0 and the share t of the next. */
  horizonAt(k0: number, t: number): number {
    const tm = this.m.tmax, a = this.lerp(this.m.table, k0 * this.n) / 255, b = this.lerp(this.m.table, ((k0 + 1) % K) * this.n) / 255;
    const ta = a * a * tm, tb = b * b * tm;
    return ta + (tb - ta) * t;
  }
}

/** A direction's layer and share (for a sun, worked out once). */
export function layerOf(lx: number, ly: number): [number, number] {
  let f = (K * datan2(-ly, lx)) / (2 * PI);
  if (f < 0) f += K;
  if (f >= K) f -= K;
  const k0 = Math.floor(f);
  return [k0, f - k0];
}
