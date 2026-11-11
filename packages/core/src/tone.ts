// tone.ts — photo times light, whites protected (BUILD.md §5.5), and the per-pixel loop that
// applies it to a picture. Where E is exactly (1, 1, 1) the photo's bytes are copied.

import { lightingAt, luma, type Lighting } from './light.ts';
import type { Image } from './resample.ts';
import { decodeTable as DEC, encode } from './srgb.ts';

/** §5.5 on one linear colour c lit by E (no sheen), into out[0..2] (linear, in [0, 1]). */
export function toneMap(cr: number, cg: number, cb: number, E: Float64Array, protect: number, out: Float64Array): void {
  let r = cr * E[0]!, g = cg * E[1]!, b = cb * E[2]!;
  const Y = luma(cr, cg, cb), Ylit = luma(r, g, b); // Ylit = Y * g
  if (Y < 1e-6 || !(Ylit > 0)) {
    out[0] = Math.min(1, Math.max(0, r)); out[1] = Math.min(1, Math.max(0, g)); out[2] = Math.min(1, Math.max(0, b));
    return;
  }
  const gain = Ylit / Y;
  const Yl = Math.min(Ylit, 1);
  const Yp = gain <= 1 ? Ylit : Y >= 1 ? 1 : Y + (Y * (1 - Y) * (gain - 1)) / (1 - 2 * Y + Y * gain);
  const Yo = Yl + (Yp - Yl) * protect;
  const s = Yo / Ylit;
  r *= s; g *= s; b *= s;
  const m = Math.max(r, g, b);
  if (m > 1) { // pull a too-bright colour toward its grey
    const k = (1 - Yo) / (m - Yo);
    r = Yo + (r - Yo) * k; g = Yo + (g - Yo) * k; b = Yo + (b - Yo) * k;
  }
  out[0] = Math.max(0, r); out[1] = Math.max(0, g); out[2] = Math.max(0, b);
}

/**
 * Lights `src`, which is the region at (ox, oy) of a picture W pixels wide (§5.1: pixel (i, j)
 * is at x = (i + 0.5) / W, y = (j + 0.5) / W). Returns new RGBA8; alpha is the source's.
 */
export function shade(src: Image, W: number, ox: number, oy: number, L: Lighting, protect: number): Image {
  const { width: w, height: h, data: s } = src;
  const out = new Uint8ClampedArray(s.length);
  if (L.unit) { out.set(s); return { data: out, width: w, height: h }; }
  const E = new Float64Array(3), c = new Float64Array(3);
  for (let j = 0; j < h; j++) {
    const y = (oy + j + 0.5) / W;
    for (let i = 0; i < w; i++) {
      const p = (j * w + i) * 4;
      lightingAt(L, (ox + i + 0.5) / W, y, E);
      out[p + 3] = s[p + 3]!;
      if (E[0] === 1 && E[1] === 1 && E[2] === 1) {
        out[p] = s[p]!; out[p + 1] = s[p + 1]!; out[p + 2] = s[p + 2]!;
        continue;
      }
      toneMap(DEC[s[p]!]!, DEC[s[p + 1]!]!, DEC[s[p + 2]!]!, E, protect, c);
      out[p] = encode(c[0]!); out[p + 1] = encode(c[1]!); out[p + 2] = encode(c[2]!);
    }
  }
  return { data: out, width: w, height: h };
}
