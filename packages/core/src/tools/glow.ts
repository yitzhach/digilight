// tools/glow.ts — Glow (BUILD.md §5.12.3; light tool T8, tool:glow): the strongly lit parts of
// the picture spill a soft light around them, as a lens does. It is added light, like sheen, so
// §5.5 protects the whites it reaches; the art's own pixels are never blurred (promise 1).
//
// The light spilled is read from two small maps made once per document on the guard's thumbnail
// (§5.7): the light of the parts that stand out from the lit picture, blurred near and far. The preview is given
// the same two maps as textures, so it and the reference add the same light.

import type { Doc } from '../fields.ts';
import { guardThumb } from '../guard.ts';
import type { RGB } from '../kelvin.ts';
import { lightingAt, luma, prepareLighting, smoothstep } from '../light.ts';
import { gauss } from '../relief/blur.ts';
import { thumbnail, type Image } from '../resample.ts';
import { decodeTable as DEC } from '../srgb.ts';

/** Long side of the maps, in pixels. */
export const GLOW_SIZE = 256;
/** Where a part starts to glow, and where all of its light counts: its lit luma as a multiple
 *  of the lit picture's mean. So it is the parts that stand out that glow, in a pale picture and
 *  a dark one alike, and Brightness does not change which. */
export const GLOW_FROM = 0.8, GLOW_FULL = 2.4;
/** The two blurs, as sigmas in picture widths. */
export const GLOW_NEAR = 0.012, GLOW_FAR = 0.06;
/** Film halation's red-orange, luma 1. */
const HAL: RGB = [1, 0.35, 0.1], HAL_LUMA = 0.2126 * HAL[0] + 0.7152 * HAL[1] + 0.0722 * HAL[2];
export const HALATION: RGB = [HAL[0] / HAL_LUMA, HAL[1] / HAL_LUMA, HAL[2] / HAL_LUMA];

export interface GlowMaps {
  width: number; height: number;
  /** Linear RGB, three floats a pixel, rows from the top. */
  near: Float32Array; far: Float32Array;
  /** What the maps were made for (glowKey). */
  key: string;
}

/** Everything the maps depend on: the light, not Glow's own three settings. */
export function glowKey(doc: Doc, kappa: number): string {
  return JSON.stringify([doc.ambient, doc.lights, doc.tone.whiteAdapt, doc.finish.exposure, kappa]);
}

const last = new WeakMap<Uint8ClampedArray, GlowMaps>();

/** The two maps for a photo and document (the last ones are kept per photo). */
export function glowMaps(photo: Image, doc: Doc, kappa: number): GlowMaps {
  const key = glowKey(doc, kappa), kept = last.get(photo.data);
  if (kept && kept.key === key) return kept;
  const T = thumbnail(guardThumb(photo).thumb, GLOW_SIZE), w = T.width, h = T.height, n = w * h;
  const L = prepareLighting(doc, h / w, kappa); // relief off, as the guard judges
  const E = new Float64Array(3), plane = [new Float32Array(n), new Float32Array(n), new Float32Array(n)] as const;
  let sum = 0;
  for (let j = 0, i = 0; j < h; j++) {
    for (let x = 0; x < w; x++, i++) { // the lit picture, before §5.5
      lightingAt(L, (x + 0.5) / w, (j + 0.5) / w, E);
      const r = DEC[T.data[i * 4]!]! * E[0]!, g = DEC[T.data[i * 4 + 1]!]! * E[1]!, b = DEC[T.data[i * 4 + 2]!]! * E[2]!;
      plane[0][i] = r; plane[1][i] = g; plane[2][i] = b;
      sum += luma(r, g, b);
    }
  }
  const mean = sum / n;
  for (let i = 0; i < n; i++) { // keep what stands out
    const k = mean > 0 ? smoothstep(GLOW_FROM * mean, GLOW_FULL * mean, luma(plane[0][i]!, plane[1][i]!, plane[2][i]!)) : 0;
    plane[0][i]! *= k; plane[1][i]! *= k; plane[2][i]! *= k;
  }
  const blurred = (sigma: number): Float32Array => {
    const out = new Float32Array(n * 3);
    plane.forEach((p, c) => { const q = gauss(p, w, h, sigma * w); for (let i = 0; i < n; i++) out[i * 3 + c] = q[i]!; });
    return out;
  };
  const maps: GlowMaps = { width: w, height: h, near: blurred(GLOW_NEAR), far: blurred(GLOW_FAR), key };
  last.set(photo.data, maps);
  return maps;
}

/** Glow's strength and colour as one factor: finish.glow * mix(white, halation, glowWarmth). */
export function glowTint(doc: Doc): RGB {
  const f = doc.finish, t = f.glowWarmth;
  return [f.glow * (1 + (HALATION[0] - 1) * t), f.glow * (1 + (HALATION[1] - 1) * t), f.glow * (1 + (HALATION[2] - 1) * t)];
}

/** Glow ready for the per-pixel loop. */
export interface Glow {
  width: number; height: number;
  /** mix(near, far, glowSpread), three floats a pixel. */
  map: Float32Array;
  tint: RGB;
  /** 1 / a: a picture point's y (picture widths) to the map's v. */
  invA: number;
}

/** Glow for a picture `a = H / W` high, or null when finish.glow is 0. `maps`: if already made. */
export function prepareGlow(photo: Image, doc: Doc, kappa: number, a: number, maps?: GlowMaps | null): Glow | null {
  if (!(doc.finish.glow > 0)) return null;
  const m = maps ?? glowMaps(photo, doc, kappa), s = doc.finish.glowSpread, map = new Float32Array(m.near.length);
  for (let i = 0; i < map.length; i++) map[i] = m.near[i]! + (m.far[i]! - m.near[i]!) * s;
  return { width: m.width, height: m.height, map, tint: glowTint(doc), invA: 1 / a };
}

/** Adds the glow at picture point (x, y) to the added light S (bilinear on the map, edges clamped). */
export function glowAt(G: Glow, x: number, y: number, S: Float64Array): void {
  const { width: w, height: h, map: m } = G;
  const u = Math.min(w - 1, Math.max(0, x * w - 0.5)), v = Math.min(h - 1, Math.max(0, y * G.invA * h - 0.5));
  const x0 = Math.max(0, Math.min(w - 2, Math.floor(u))), y0 = Math.max(0, Math.min(h - 2, Math.floor(v)));
  const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), fx = u - x0, fy = v - y0;
  const a = (y0 * w + x0) * 3, b = (y0 * w + x1) * 3, c = (y1 * w + x0) * 3, d = (y1 * w + x1) * 3;
  for (let k = 0; k < 3; k++) {
    const top = m[a + k]! + (m[b + k]! - m[a + k]!) * fx, bot = m[c + k]! + (m[d + k]! - m[c + k]!) * fx;
    S[k]! += G.tint[k]! * (top + (bot - top) * fy);
  }
}
