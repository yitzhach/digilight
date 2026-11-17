// tools/pattern.ts — tool:pattern, light patterns: the shadow of a window, blinds or leaves in a
// light (BUILD.md §5.12.5, T3b). The shapes use floor, abs, min, max, smoothstep and the PCG hash
// only, so the shader (gl/src/shaders/pattern.glsl.ts) computes the same; every shape is
// continuous where float32 and float64 may land in different cells (D-057).

import { DEG, dcos, dsin } from '../dmath.ts';
import { pcg } from '../finish.ts';
import type { Light } from '../fields.ts';

export const PATTERNS = ['none', 'window', 'blinds', 'leaves'] as const;
export type Pattern = (typeof PATTERNS)[number];
/** What a pattern's shadow lets through: e *= FLOOR + (1 - FLOOR) * M. */
export const PATTERN_FLOOR = 0.15;
/** A pattern's edge half-width per unit of patternSoft, in pattern units. */
export const PATTERN_EDGE = 0.1;

/** A light's pattern settings (fields.ts LIGHT). */
export type PatternSettings = Pick<Light, 'pattern' | 'patternSize' | 'patternSoft' | 'patternTurn' | 'patternStretch' | 'patternSkew' | 'patternX' | 'patternY'>;

/** A light's pattern, ready for patternFactor: p = t dot(D, U) - C[0] with t = r0 / dot(D, s) for
 *  a lamp (D = P - L), p = U.x x + U.y y + U.z - C[0] for a sun; q the same with V and C[1]. */
export interface PatternBasis { kind: number; soft: number; U: [number, number, number]; V: [number, number, number]; C: [number, number] }

type V3 = [number, number, number];
const turnOf = (turn: number) => { const t = (((turn % 360) + 360) % 360) * DEG; return [dcos(t), dsin(t)] as const; };

/** The plane's unit right u and up v for a beam s: v is the picture's up (0, -1, 0) made square
 *  to the beam, u = v x s. |s.y| < 1 always (a lamp stands off the wall). */
export function planeAxes(s: Readonly<V3>): { u: V3; v: V3 } {
  const [sx, sy, sz] = s, n = 1 / Math.sqrt(1 - sy * sy);
  const vx = sy * sx * n, vy = (sy * sy - 1) * n, vz = sy * sz * n;
  return { u: [vy * sz - vz * sy, vz * sx - vx * sz, vx * sy - vy * sx], v: [vx, vy, vz] };
}

/** The basis from the plane's (affine) right and up: turned, slanted, stretched, scaled, shifted. */
function basis(l: PatternSettings, u: Readonly<V3>, v: Readonly<V3>): PatternBasis {
  const [c, si] = turnOf(l.patternTurn), k = 1 / l.patternSize, st = l.patternStretch, sk = l.patternSkew;
  const Ut = [0, 1, 2].map((i) => u[i]! * c + v[i]! * si), Vt = [0, 1, 2].map((i) => v[i]! * c - u[i]! * si);
  const cx = l.patternX * c + l.patternY * si, cy = l.patternY * c - l.patternX * si; // the shift, turned
  return {
    kind: PATTERNS.indexOf(l.pattern), soft: l.patternSoft,
    U: Ut.map((x, i) => ((x - sk * Vt[i]!) * k) / st) as V3, V: Vt.map((x) => x * k) as V3,
    C: [((cx - sk * cy) * k) / st, cy * k],
  };
}

/** For a lamp whose beam is the unit vector s (picture widths, y down, z out of the wall). */
export function lampBasis(l: PatternSettings, s: Readonly<V3>): PatternBasis {
  const { u, v } = planeAxes(s);
  return basis(l, u, v);
}

/** For a sun, on a picture `a` high: the plane is the picture, (x - 0.5, a/2 - y). */
export function sunBasis(l: PatternSettings, a: number): PatternBasis {
  return basis(l, [1, 0, -0.5], [0, -1, a / 2]);
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
  if (sun) { p = B.U[0] * x + B.U[1] * y + B.U[2] - B.C[0]; q = B.V[0] * x + B.V[1] * y + B.V[2] - B.C[1]; }
  else {
    const dx = x - Lx, dy = y - Ly, dz = -Lz, ds = dx * sx + dy * sy + dz * sz;
    if (!(ds > 0)) return 1;
    const t = r0 / ds;
    p = t * (dx * B.U[0] + dy * B.U[1] + dz * B.U[2]) - B.C[0]; q = t * (dx * B.V[0] + dy * B.V[1] + dz * B.V[2]) - B.C[1];
  }
  return PATTERN_FLOOR + (1 - PATTERN_FLOOR) * patternAt(B.kind, p, q, B.soft);
}

// ---- The pattern's frame on the picture, for the handles that move, scale, stretch and slant it
// (web/src/canvas/PatternBox.tsx). Picture points (x, y) are in picture widths, y down; plane
// points (p0, q0) are in the pattern's plane before its own shift, turn and scale, up positive.

const len = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z);
type Lamped = PatternSettings & Pick<Light, 'kind' | 'pos' | 'aim'>;
export type Pt = [number, number];

/** From the picture to the pattern's plane and back (null where a ray misses). */
export function patternPlane(l: Lamped, a: number): { toPlane(x: number, y: number): Pt | null; toPicture(p: number, q: number): Pt | null } {
  if (l.kind === 'sun') return { toPlane: (x, y) => [x - 0.5, a / 2 - y], toPicture: (p, q) => [p + 0.5, a / 2 - q] };
  const L: V3 = [l.pos[0], l.pos[1] * a, l.pos[2]], A: V3 = [l.aim[0], l.aim[1] * a, 0];
  const r0 = len(A[0] - L[0], A[1] - L[1], L[2]), s: V3 = [(A[0] - L[0]) / r0, (A[1] - L[1]) / r0, -L[2] / r0];
  const { u, v } = planeAxes(s), dot = (d: V3, w: V3) => d[0] * w[0] + d[1] * w[1] + d[2] * w[2];
  return {
    toPlane(x, y) {
      const D: V3 = [x - L[0], y - L[1], -L[2]], ds = dot(D, s);
      return ds > 0 ? [(r0 / ds) * dot(D, u), (r0 / ds) * dot(D, v)] : null;
    },
    toPicture(p, q) {
      const d: V3 = [A[0] + p * u[0] + q * v[0] - L[0], A[1] + p * u[1] + q * v[1] - L[1], p * u[2] + q * v[2] - L[2]];
      if (!(d[2] < 0)) return null;
      const k = -L[2] / d[2];
      return [L[0] + k * d[0], L[1] + k * d[1]];
    },
  };
}

/** Half the width and height of the box the handles draw, in shape units. */
export const patternExtent = (pattern: Light['pattern']): Pt => (pattern === 'window' ? [0.5, 0.75] : [0.5, 0.5]);

/** Shape units (sp, sq) to the plane: C + R(turn) size (stretch sp + slant sq, sq). */
export function shapeToPlane(l: PatternSettings, sp: number, sq: number): Pt {
  const [c, si] = turnOf(l.patternTurn), a = l.patternSize * (l.patternStretch * sp + l.patternSkew * sq), b = l.patternSize * sq;
  return [l.patternX + a * c - b * si, l.patternY + a * si + b * c];
}
/** A plane point in the pattern's turned frame about its centre. */
function local(l: PatternSettings, p: number, q: number): Pt {
  const [c, si] = turnOf(l.patternTurn), dp = p - l.patternX, dq = q - l.patternY;
  return [dp * c + dq * si, dq * c - dp * si];
}

export type PatternHandle = 'move' | 'scale' | 'stretch' | 'top';
const clamp = (x: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, x)) * 1000) / 1000;

/** The settings after dragging `handle` from plane point `from` to `to`; `l` as the drag began. */
export function dragPattern(l: PatternSettings, handle: PatternHandle, from: Pt, to: Pt): Partial<PatternSettings> {
  const [ex, ey] = patternExtent(l.pattern);
  if (handle === 'move') return { patternX: clamp(l.patternX + to[0] - from[0], -2, 2), patternY: clamp(l.patternY + to[1] - from[1], -2, 2) };
  const [lp, lq] = local(l, to[0], to[1]);
  if (handle === 'scale') {
    const [fp, fq] = local(l, from[0], from[1]), r0 = len(fp, fq, 0);
    return r0 > 0 ? { patternSize: clamp((l.patternSize * len(lp, lq, 0)) / r0, 0.05, 2) } : {};
  }
  if (handle === 'stretch') return { patternStretch: clamp((lp - l.patternSkew * lq) / (l.patternSize * ex), 0.25, 4) };
  if (!(lq > 0)) return {}; // the top edge: its height sets the size (the width kept), its sideways place the slant
  const size = clamp(lq / ey, 0.05, 2);
  return { patternSize: size, patternStretch: clamp((l.patternStretch * l.patternSize) / size, 0.25, 4), patternSkew: clamp(lp / lq, -1, 1) };
}
