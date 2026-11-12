// shading.ts — one side-lit shot turned into slopes. Ported from v1 src/lampphotos.js.
//
// Per pixel, a side-lit shot over the flat photo cancels the paint's colour:
//
//     R = shot / flat  ~  a + B(x) (N . L) / lz
//
// a is the room (or sky) light's share, B the lamp's beam on flat paint, N the surface normal,
// L the direction to the light. B is unknown but smooth, so it is taken as the local mean of
// R - a; what is left,
//
//     s = (R - a) / blur(R - a)  ~  1 - hx ux - hy uy,   (ux, uy) = L_xy / L_z
//
// is linear in the slopes (hx, hy). Each shot gives one such equation per pixel: two lights
// from different sides give both slopes; one gives the slope along its light.

import { dcos, DEG, dsin } from '../dmath.ts';
import { boxBlur, percentiles } from './box.ts';
import type { Warped } from './align.ts';

// Feature sizes in picture widths, so a photo of any resolution behaves alike.
export const BEAM_SIGMA = 0.022;  // the beam is taken as smooth beyond this
export const DRIFT_SIGMA = 0.06;  // heights broader than this are dropped (drift)
const SHADOW_S = 0.1;             // shading below this is shadow: no slope to read (lamps)
const BRIGHT_S = 3;               // above this, a glint more likely than a facet (lamps)
/** Glints (varnish, wet-looking impasto) read as steep slopes: shading over 1.6 times what a
 *  facet turned straight at the light could give, or over 1.2 times it while near-white and
 *  having lost the paint's colour. */
export const GLINT = { over: 1.6, near: 1.2, colour: 0.15 };

/** A light in pixels of the w-wide picture: x from the left edge, y down from the top, z out. */
export interface LightPx { x: number; y: number; z: number; sun?: boolean }
/** Where a shot's light stood: a lamp's place in cm from the picture's left and top edges and
 *  the wall, or the sun's direction (azimuth as §5.1: 0 right, 90 up; elevation above the face). */
export type ShotLight = { left: number; above: number; out: number } | { sun: { azimuthDeg: number; elevationDeg: number } };

export function lampPixels(lamp: { left: number; above: number; out: number }, widthCm: number, w: number): LightPx {
  const k = w / widthCm;
  return { x: lamp.left * k, y: -lamp.above * k, z: Math.max(0.2, lamp.out) * k };
}
/** The sun as a lamp a million widths away, so its light reaches every pixel at one angle. */
export function sunPixels(sun: { azimuthDeg: number; elevationDeg: number }, w: number, h: number): LightPx {
  const a = (+sun.azimuthDeg || 0) * DEG, e = Math.min(89, Math.max(1, +sun.elevationDeg || 0)) * DEG, D = 1e6 * w;
  return { x: w / 2 + D * dcos(e) * dcos(a), y: h / 2 - D * dcos(e) * dsin(a), z: D * dsin(e), sun: true };
}
export const shotPixels = (l: ShotLight, widthCm: number, w: number, h: number): LightPx =>
  ('sun' in l ? sunPixels(l.sun, w, h) : lampPixels(l, widthCm, w));

export interface Shading {
  /** shot / flat, less the room light. */ D: Float32Array;
  valid: Uint8Array; /** the room light's share */ a: number;
  s: Float32Array; ok: Uint8Array; beam: Float32Array; px: LightPx; beamSigma: number;
}

/** Normalised shading s, its usable mask and a first guess at the room light, for one shot. */
export function shading(lum: Float32Array, bad: Uint8Array, even: Float32Array, evenOk: Uint8Array, w: number, h: number, px: LightPx, beamSigma: number): Shading {
  const n = w * h, D = new Float32Array(n), valid = new Uint8Array(n);
  for (let i = 0; i < n; i++) { D[i] = lum[i]! / Math.max(1e-4, even[i]!); valid[i] = !bad[i] && evenOk[i] ? 1 : 0; }
  // First guess at the room light: what the deepest shadows inside the light's pool still get.
  const pool = boxBlur(D, w, h, 0.03 * w), cut = percentiles(pool, [0.7])[0]!;
  const inPool = new Uint8Array(n);
  for (let i = 0; i < n; i++) inPool[i] = pool[i]! > cut && valid[i] ? 1 : 0;
  const a = 0.9 * Math.max(0, percentiles(D, [0.01], inPool)[0]!);
  for (let i = 0; i < n; i++) D[i]! -= a;
  const sh: Shading = { D, valid, a, s: new Float32Array(n), ok: new Uint8Array(n), beam: D, px, beamSigma };
  normalise(sh, boxBlur(D, w, h, beamSigma * w));
  return sh;
}

/** s = D over the beam; usable where lit, not blown and (lamps) not in shadow. In sun a shadow
 *  is read too: where the sun does not reach, the surface falls away at least as steeply as its
 *  rays, so read as shading 0 a shadow's height drop comes out as the step casting it. Bright
 *  facets too: one facing a sun e above the face is up to 1 / sin(e) times as bright as flat
 *  paint, so the lamps' cap would leave the steepest lit slopes out. */
export function normalise(sh: Shading, beam: Float32Array): void {
  const { D, valid, s, ok, px } = sh, sun = px.sun === true;
  const ux = px.x / px.z, uy = px.y / px.z;
  const top = sun ? GLINT.near * Math.sqrt(1 + ux * ux + uy * uy) : BRIGHT_S;
  for (let i = 0; i < D.length; i++) {
    let v = D[i]! / Math.max(1e-4, beam[i]!);
    if (sun) v = Math.max(0, v);
    s[i] = v;
    ok[i] = valid[i] && beam[i]! > 1e-3 && (sun || s[i]! > SHADOW_S) && s[i]! < top ? 1 : 0;
  }
  sh.beam = beam;
}

/** The shading the slopes predict for this shot's light (1 on flat paint). */
export function predicted(sh: Shading, hx: Float32Array, hy: Float32Array, w: number, h: number): Float32Array {
  const p = new Float32Array(w * h), { x: lx, y: ly, z: lz } = sh.px;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, ux = (lx - x - 0.5) / lz, uy = (ly - y - 0.5) / lz, gx = hx[i]!, gy = hy[i]!;
    p[i] = Math.max(0, (1 - gx * ux - gy * uy) / Math.sqrt(1 + gx * gx + gy * gy));
  }
  return p;
}

/** Room light, refined: within a patch the beam is one number, so the shot over the flat photo
 *  is a straight line in the predicted shading whose intercept is the room light. The median
 *  intercept (weighted) over patches with enough relief to tell. */
export function fitRoom(sh: Shading, pred: Float32Array, w: number, h: number): void {
  const n = w * h, R = new Float32Array(n), RP = new Float32Array(n), PP = new Float32Array(n), P = new Float32Array(n), V = new Float32Array(n);
  for (let i = 0; i < n; i++) if (sh.valid[i]) { const r = sh.D[i]! + sh.a, p = pred[i]!; R[i] = r; P[i] = p; RP[i] = r * p; PP[i] = p * p; V[i] = 1; }
  const rad = BEAM_SIGMA * w;
  const bR = boxBlur(R, w, h, rad), bP = boxBlur(P, w, h, rad), bRP = boxBlur(RP, w, h, rad), bPP = boxBlur(PP, w, h, rad), bV = boxBlur(V, w, h, rad);
  const at: [number, number][] = [];
  for (let i = 0; i < n; i += 7) {
    if (bV[i]! < 0.5) continue;
    const mR = bR[i]! / bV[i]!, mP = bP[i]! / bV[i]!, vp = bPP[i]! / bV[i]! - mP * mP, B = (bRP[i]! / bV[i]! - mR * mP) / vp;
    if (vp >= 0.02 && B > 0) at.push([mR - B * mP, vp]);
  }
  if (at.length < 50) return;
  at.sort((p, q) => p[0] - q[0]);
  const half = at.reduce((t, v) => t + v[1], 0) / 2;
  let acc = 0, a = sh.a;
  for (const [v, wt] of at) { acc += wt; if (acc >= half) { a = v; break; } }
  a = Math.max(0, a);
  for (let i = 0; i < n; i++) sh.D[i]! += sh.a - a;
  sh.a = a;
}

/** Where the shots measured one direction only: that direction (ex, ey) and its share `one`
 *  (1 when every shot lit the pixel from one side, 0 when two lit it from 30 degrees or more apart). */
export interface Seen { ex: Float32Array; ey: Float32Array; one: Float32Array }

/** Slopes from the shots listed in `use`: per pixel, least squares over the usable samples,
 *  damped a little so one shot still gives the slope along its light and nothing across it. */
export function slopes(shots: Shading[], use: number[], w: number, h: number): { hx: Float32Array; hy: Float32Array; seen: Seen } {
  const n = w * h, hx = new Float32Array(n), hy = new Float32Array(n);
  const ex = new Float32Array(n), ey = new Float32Array(n), one = new Float32Array(n);
  const S = use.map((k) => shots[k]!);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    let m11 = 0, m12 = 0, m22 = 0, b1 = 0, b2 = 0;
    for (const sh of S) {
      if (!sh.ok[i]) continue;
      const ux = (sh.px.x - x - 0.5) / sh.px.z, uy = (sh.px.y - y - 0.5) / sh.px.z, r = 1 - sh.s[i]!;
      m11 += ux * ux; m12 += ux * uy; m22 += uy * uy; b1 += ux * r; b2 += uy * r;
    }
    const lam = 0.01 * (m11 + m22) + 1e-9, a = m11 + lam, d = m22 + lam, det = a * d - m12 * m12;
    if (det > 1e-12) { hx[i] = (d * b1 - m12 * b2) / det; hy[i] = (a * b2 - m12 * b1) / det; }
    // The information matrix's eigenvalues: the smaller over the larger is tan^2 of half the
    // angle between two lights of equal weight (0.072 at 30 degrees).
    const tr = m11 + m22, gap = Math.sqrt((m11 - m22) * (m11 - m22) + 4 * m12 * m12), l1 = 0.5 * (tr + gap), l2 = 0.5 * (tr - gap);
    if (l1 > 1e-9) {
      one[i] = Math.max(0, 1 - l2 / l1 / 0.072);
      const diag = Math.abs(m12) <= 1e-12;
      const vx = diag ? (m11 >= m22 ? 1 : 0) : l1 - m22, vy = diag ? (m11 >= m22 ? 0 : 1) : m12, vn = Math.sqrt(vx * vx + vy * vy);
      ex[i] = vx / vn; ey[i] = vy / vn;
    }
  }
  return { hx, hy, seen: { ex, ey, one } };
}

/** Glint mask for one shot (dilated a pixel): see GLINT. The colour test needs paint with colour
 *  to lose; on grey or white paint only the brightness test applies. */
export function findGlints(sh: Shading, warped: Warped, evenSat: Float32Array, w: number, h: number): Uint8Array {
  const n = w * h, g = new Uint8Array(n), px = sh.px;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!sh.valid[i]) continue;
    const dx = px.x - x - 0.5, dy = px.y - y - 0.5, sMax = Math.sqrt(dx * dx + dy * dy + px.z * px.z) / px.z, s = sh.s[i]!;
    if (s > GLINT.over * sMax || (s > GLINT.near * sMax && warped.white[i] && evenSat[i]! > GLINT.colour && warped.sat[i]! < 0.5 * evenSat[i]!)) g[i] = 1;
  }
  const out = new Uint8Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!g[y * w + x]) continue;
    for (let v = Math.max(0, y - 1); v <= Math.min(h - 1, y + 1); v++) for (let u = Math.max(0, x - 1); u <= Math.min(w - 1, x + 1); u++) out[v * w + u] = 1;
  }
  return out;
}
