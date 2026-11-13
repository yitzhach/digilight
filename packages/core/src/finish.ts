// finish.ts — Finish (BUILD.md §5.9): tone and colour changed one pixel at a time, after §5.5.
// Brightness (exposure) is not here: it is light, folded into E by prepareLighting (§5.4).
// prepareFinish() does the per-document work once (null when the finish is neutral, so the
// renderer skips the step); finishPixel() is the per-pixel part. The preview's shader mirrors
// it step for step and takes the same prepared numbers as uniforms.

import { dpow5_12 } from './dmath.ts';
import type { Doc } from './fields.ts';
import { colour, type RGB } from './kelvin.ts';
import { luma, smoothstep } from './light.ts';

/** Grain's grid: cells across the picture's width, whatever its size (§5.9). */
export const GRAIN_CELLS = 2048;
/** The grid is shifted a third of a cell, so no pixel centre at a power-of-two width sits on a
 *  cell's edge, where float32 and float64 could pick different cells (D-057). */
export const GRAIN_SHIFT = 1 / 3;

export interface Finish {
  /** Warmth's colour, luma 1 (null at warmth 0). */
  warm: RGB | null;
  contrast: number; saturation: number; vignette: number; grain: number;
  /** The tone curve, 256 values (null when not set). */
  curve: Float64Array | null;
  /** The picture's centre and 1 / half its diagonal, in picture widths (vignette). */
  cx: number; cy: number; inv: number;
}

/** Finish for a picture `a = H / W` high, or null when it changes nothing. */
export function prepareFinish(doc: Doc, a: number): Finish | null {
  const f = doc.finish;
  if (f.warmth === 0 && f.contrast === 0 && f.saturation === 0 && f.vignette === 0 && f.grain === 0 && f.curve === undefined) return null;
  let warm: RGB | null = null;
  if (f.warmth !== 0) {
    const c = colour(f.warmth > 0 ? 6500 - 2500 * f.warmth : 6500 - 4500 * f.warmth, doc.photo.space), l = luma(c[0], c[1], c[2]);
    warm = [c[0] / l, c[1] / l, c[2] / l];
  }
  return {
    warm, contrast: f.contrast, saturation: f.saturation, vignette: f.vignette, grain: f.grain,
    curve: f.curve ? Float64Array.from(f.curve) : null,
    cx: 0.5, cy: a / 2, inv: 2 / Math.sqrt(1 + a * a),
  };
}

/** The continuous sRGB curve (Display P3 shares it), linear to display-encoded; v >= 0. */
export function toDisplay(v: number): number {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * dpow5_12(v) - 0.055;
}

/** PCG hash (O'Neill; the 32-bit "RXS M XS" output), as the shader computes it. */
export function pcg(v: number): number {
  const s = (Math.imul(v, 747796405) + 2891336453) >>> 0;
  const w = Math.imul(((s >>> ((s >>> 28) + 4)) ^ s) >>> 0, 277803737) >>> 0;
  return ((w >>> 22) ^ w) >>> 0;
}

/** Grain's h in [0, 1) at picture point (x, y), in picture widths. */
export function grainAt(x: number, y: number): number {
  const i = Math.floor(GRAIN_CELLS * x + GRAIN_SHIFT), j = Math.floor(GRAIN_CELLS * y + GRAIN_SHIFT);
  return pcg((i + pcg(j >>> 0)) >>> 0) / 4294967296;
}

function curveAt(t: Float64Array, v: number): number {
  const x = Math.min(255, Math.max(0, 255 * v)), i = Math.min(254, Math.floor(x));
  return t[i]! + (t[i + 1]! - t[i]!) * (x - i);
}

/** The finished pixel at (x, y) from linear colour c (§5.5's out), as 8-bit codes into out[p..p+2]. */
export function finishPixel(F: Finish, cr: number, cg: number, cb: number, x: number, y: number, out: Uint8ClampedArray, p: number): void {
  if (F.warm) { cr *= F.warm[0]; cg *= F.warm[1]; cb *= F.warm[2]; }
  let r = toDisplay(cr), g = toDisplay(cg), b = toDisplay(cb);
  const k = F.contrast;
  if (k < 0) {
    r = 0.5 + (r - 0.5) * (1 + k); g = 0.5 + (g - 0.5) * (1 + k); b = 0.5 + (b - 0.5) * (1 + k);
  } else if (k > 0) {
    r += (smoothstep(0, 1, r) - r) * k; g += (smoothstep(0, 1, g) - g) * k; b += (smoothstep(0, 1, b) - b) * k;
  }
  if (F.saturation !== 0) {
    const grey = luma(r, g, b), s = 1 + F.saturation;
    r = grey + (r - grey) * s; g = grey + (g - grey) * s; b = grey + (b - grey) * s;
  }
  if (F.curve) { r = curveAt(F.curve, r); g = curveAt(F.curve, g); b = curveAt(F.curve, b); }
  if (F.vignette > 0) {
    const dx = x - F.cx, dy = y - F.cy;
    const v = 1 - F.vignette * smoothstep(0.55, 1.15, Math.sqrt(dx * dx + dy * dy) * F.inv);
    r *= v; g *= v; b *= v;
  }
  if (F.grain > 0) {
    const n = F.grain * 0.08 * (grainAt(x, y) - 0.5);
    r += n; g += n; b += n;
  }
  out[p] = toByte(r); out[p + 1] = toByte(g); out[p + 2] = toByte(b);
}

/** A display-encoded value to its 8-bit code: clamped, nearest code (§5.10's encode, halves up). */
const toByte = (v: number): number => (v > 0 ? (v < 1 ? Math.floor(255 * v + 0.5) : 255) : 0);
