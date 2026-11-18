// warp.ts — Crop and straighten (Phase 6b item 1). Four corners on the photo file (top left,
// top right, bottom right, bottom left, in the file's pixels) become an upright rectangle: a
// perspective map from the rectangle to the corners, and bicubic (Catmull-Rom) sampling of the
// 8-bit values, edges clamped (as resample.ts, on the stored values). Plain arithmetic and
// Math.sqrt only (IEEE-exact), so Node and every browser give the same bytes (promise 5).

import type { Image } from './resample.ts';

export type Corners = [[number, number], [number, number], [number, number], [number, number]];
export interface Crop { corners: Corners; source: [number, number] }

const len = (a: [number, number], b: [number, number]) => Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]));

/** The picture's size for these corners: each side the mean of its two opposite edges. */
export function cropSize(c: Corners): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round((len(c[0], c[1]) + len(c[3], c[2])) / 2)),
    height: Math.max(1, Math.round((len(c[0], c[3]) + len(c[1], c[2])) / 2)),
  };
}

/** The smallest side a crop may have, in the file's pixels. */
export const MIN_CROP = 16;

/** Why these corners are not a crop of a `w` x `h` photo, or null when they are. */
export function cropProblem(c: Corners, w: number, h: number): string | null {
  if (!c.every((p) => p.every(Number.isFinite))) return 'the corners must be numbers';
  if (!c.every(([x, y]) => x >= 0 && x <= w && y >= 0 && y <= h)) return `the corners must be on the ${w} x ${h} photo`;
  // Clockwise on screen (y down), top left first, and convex: every turn the same way.
  for (let i = 0; i < 4; i++) {
    const a = c[i]!, b = c[(i + 1) % 4]!, d = c[(i + 2) % 4]!;
    if ((b[0] - a[0]) * (d[1] - b[1]) - (b[1] - a[1]) * (d[0] - b[0]) <= 0)
      return 'the corners must go top left, top right, bottom right, bottom left, without crossing';
  }
  const s = cropSize(c);
  if (s.width < MIN_CROP || s.height < MIN_CROP) return `the crop must be at least ${MIN_CROP} pixels each way`;
  return null;
}

/** True when the corners are the whole photo (no crop). */
export const isWholeFrame = (c: Corners, w: number, h: number): boolean =>
  c[0][0] === 0 && c[0][1] === 0 && c[1][0] === w && c[1][1] === 0 && c[2][0] === w && c[2][1] === h && c[3][0] === 0 && c[3][1] === h;

/** The map from the unit square to the corners (Heckbert): x = (a u + b v + c) / (g u + h v + 1). */
function squareToQuad(q: Corners) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  let g = 0, h = 0;
  if (sx !== 0 || sy !== 0) {
    const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2, den = dx1 * dy2 - dx2 * dy1;
    g = (sx * dy2 - dx2 * sy) / den; h = (dx1 * sy - sx * dy1) / den;
  }
  return { a: x1 - x0 + g * x1, b: x3 - x0 + h * x3, c: x0, d: y1 - y0 + g * y1, e: y3 - y0 + h * y3, f: y0, g, h };
}

/** Catmull-Rom weights for a sample `t` (0..1) past the second of four taps. */
function cubic(t: number, w: Float64Array, o: number): void {
  const t2 = t * t, t3 = t2 * t;
  w[o] = (-t3 + 2 * t2 - t) / 2;
  w[o + 1] = (3 * t3 - 5 * t2 + 2) / 2;
  w[o + 2] = (-3 * t3 + 4 * t2 + t) / 2;
  w[o + 3] = (t3 - t2) / 2;
}

/** Rows [y0, y0 + rows) of the cropped picture (all rows by default), opaque RGBA8. */
export function warpCrop(src: Image, corners: Corners, y0 = 0, rows?: number): Image {
  const { width: W, height: H } = cropSize(corners), n = rows ?? H - y0;
  const m = squareToQuad(corners), SW = src.width, SH = src.height, s = src.data;
  const out = new Uint8ClampedArray(W * n * 4), wx = new Float64Array(4), wy = new Float64Array(4);
  const xi = new Int32Array(4), yi = new Int32Array(4);
  for (let j = 0; j < n; j++) {
    const v = (y0 + j + 0.5) / H;
    for (let i = 0; i < W; i++) {
      const u = (i + 0.5) / W, z = m.g * u + m.h * v + 1;
      // Pixel centres sit at whole numbers + 0.5 in the photo; taps are pixel indices.
      const fx = (m.a * u + m.b * v + m.c) / z - 0.5, fy = (m.d * u + m.e * v + m.f) / z - 0.5;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      cubic(fx - ix, wx, 0); cubic(fy - iy, wy, 0);
      for (let k = 0; k < 4; k++) {
        xi[k] = Math.min(SW - 1, Math.max(0, ix - 1 + k)) * 4;
        yi[k] = Math.min(SH - 1, Math.max(0, iy - 1 + k)) * SW * 4;
      }
      let R = 0, G = 0, B = 0;
      for (let b = 0; b < 4; b++) {
        let r = 0, g = 0, bl = 0;
        const row = yi[b]!;
        for (let a = 0; a < 4; a++) {
          const p = row + xi[a]!, w = wx[a]!;
          r += w * s[p]!; g += w * s[p + 1]!; bl += w * s[p + 2]!;
        }
        const w = wy[b]!;
        R += w * r; G += w * g; B += w * bl;
      }
      const q = (j * W + i) * 4;
      out[q] = Math.round(R); out[q + 1] = Math.round(G); out[q + 2] = Math.round(B); out[q + 3] = 255;
    }
  }
  return { data: out, width: W, height: n };
}
