// tools/pattern.ts — tool:pattern, light patterns: the shadow of a window, blinds or leaves in a
// light (BUILD.md §5.12.5, T3b). The shapes use floor, abs, min, max, smoothstep and the PCG hash
// only, so the shader (gl/src/shaders/pattern.glsl.ts) computes the same; every shape is
// continuous where float32 and float64 may land in different cells (D-057).

import { DEG, dcos, dsin } from '../dmath.ts';
import { pcg } from '../finish.ts';

export const PATTERNS = ['none', 'window', 'blinds', 'leaves'] as const;
export type Pattern = (typeof PATTERNS)[number];
/** What a pattern's shadow lets through: e *= FLOOR + (1 - FLOOR) * M. */
export const PATTERN_FLOOR = 0.15;
/** A pattern's edge half-width per unit of patternSoft, in pattern units. */
export const PATTERN_EDGE = 0.1;

/** A light's pattern, ready for patternAt: p = t dot(D, U) with t = r0 / dot(D, s) for a lamp
 *  (D = P - L), p = U.x x + U.y y + U.z for a sun; q the same with V. kind 0 is none. */
export interface PatternBasis { kind: number; soft: number; U: [number, number, number]; V: [number, number, number] }

const turnOf = (turn: number) => { const t = (((turn % 360) + 360) % 360) * DEG; return [dcos(t), dsin(t)] as const; };

/** For a lamp whose beam is the unit vector s (picture widths, y down, z out of the wall). */
export function lampBasis(kind: Pattern, size: number, soft: number, turn: number, s: readonly [number, number, number]): PatternBasis {
  const [sx, sy, sz] = s;
  // v: the picture's up (0, -1, 0) in the plane at right angles to the beam; u = v x s, its right
  const n = 1 / Math.sqrt(1 - sy * sy);
  const vx = sy * sx * n, vy = (sy * sy - 1) * n, vz = sy * sz * n;
  const ux = vy * sz - vz * sy, uy = vz * sx - vx * sz, uz = vx * sy - vy * sx;
  const [c, si] = turnOf(turn), k = 1 / size;
  return {
    kind: PATTERNS.indexOf(kind), soft,
    U: [(ux * c + vx * si) * k, (uy * c + vy * si) * k, (uz * c + vz * si) * k],
    V: [(vx * c - ux * si) * k, (vy * c - uy * si) * k, (vz * c - uz * si) * k],
  };
}

/** For a sun, on a picture `a` high: (x - 0.5, a/2 - y), turned, over size. */
export function sunBasis(kind: Pattern, size: number, soft: number, turn: number, a: number): PatternBasis {
  const [c, si] = turnOf(turn), k = 1 / size, h = a / 2;
  // p0 = x - 0.5, q0 = h - y; p = (p0 c + q0 si) k, q = (q0 c - p0 si) k
  return {
    kind: PATTERNS.indexOf(kind), soft,
    U: [c * k, -si * k, (-0.5 * c + h * si) * k],
    V: [-si * k, -c * k, (h * c + 0.5 * si) * k],
  };
}

const ss = (a: number, b: number, x: number) => {
  if (!(b > a)) return x < a ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** 1 where x > 0, 0 where x < 0, an edge of half-width e. */
const edge = (x: number, e: number) => ss(-e, e, x);
const frac = (x: number) => x - Math.floor(x);

/** The hash at lattice point (i, j) in [0, 1); i, j whole numbers, negative ones wrap as uint. */
function lattice(i: number, j: number): number { return pcg((i + pcg(j >>> 0)) >>> 0) / 4294967296; }
/** Value noise: the lattice blended by smoothstep; continuous everywhere. */
function noise(x: number, y: number): number {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = lattice(i, j), b = lattice(i + 1, j), c = lattice(i, j + 1), d = lattice(i + 1, j + 1);
  const top = a + (b - a) * sx, bot = c + (d - c) * sx;
  return top + (bot - top) * sy;
}

/** M in [0, 1]: how much of the light gets through at pattern point (p, q). */
export function patternAt(kind: number, p: number, q: number, soft: number): number {
  const e = PATTERN_EDGE * soft;
  if (kind === 1) { // window: 2 x 3 panes of 0.5, bars 0.08 wide, dark outside the frame
    const dp = 0.5 * (0.5 - Math.abs(frac(2 * p) - 0.5)), dq = 0.5 * Math.abs(frac(2 * q) - 0.5);
    const frame = edge(0.5 - Math.abs(p), e) * edge(0.75 - Math.abs(q), e);
    return frame * edge(dp - 0.04, e) * edge(dq - 0.04, e);
  }
  if (kind === 2) return edge(0.25 * (0.25 - Math.abs(frac(4 * q) - 0.5)), e); // blinds: a period of 0.25, slats half of it
  if (kind === 3) { // leaves: three octaves of value noise, light through the gaps
    const n = (noise(3 * p + 17.3, 3 * q + 5.1) + 0.5 * noise(6.1 * p - 3.7, 6.1 * q + 11.9) + 0.25 * noise(12.3 * p + 7.7, 12.3 * q - 2.3)) / 1.75;
    return edge(n - 0.55, e);
  }
  return 1;
}

/** The pattern's factor at picture point (x, y): lamp at (Lx, Ly, Lz), beam s, r0 its distance to
 *  the aim point; 1 for none, and where the point is behind the pattern's plane. */
export function patternFactor(B: PatternBasis, sun: boolean, x: number, y: number,
  Lx: number, Ly: number, Lz: number, r0: number, sx: number, sy: number, sz: number): number {
  let p: number, q: number;
  if (sun) { p = B.U[0] * x + B.U[1] * y + B.U[2]; q = B.V[0] * x + B.V[1] * y + B.V[2]; }
  else {
    const dx = x - Lx, dy = y - Ly, dz = -Lz, ds = dx * sx + dy * sy + dz * sz;
    if (!(ds > 0)) return 1;
    const t = r0 / ds;
    p = t * (dx * B.U[0] + dy * B.U[1] + dz * B.U[2]); q = t * (dx * B.V[0] + dy * B.V[1] + dz * B.V[2]);
  }
  return PATTERN_FLOOR + (1 - PATTERN_FLOOR) * patternAt(B.kind, p, q, B.soft);
}
