// tools/wall.ts — tool:wall, the wall (BUILD.md §5.12.7, T2): the piece hangs on a wall, the light
// spills past its edge and the piece throws a soft shadow on it. The piece is drawn exactly as with
// the wall off (render()); the wall is a margin round it, lit by the same lights with no relief.
// wallPixels() needs no photo; renderWithWall() makes the whole picture.

import type { Doc } from '../fields.ts';
import { finishPixel, prepareFinish } from '../finish.ts';
import { guardKappa } from '../guard.ts';
import { colour, type RGB } from '../kelvin.ts';
import { luma, prepareLighting, smoothstep, type Lamp, type Lighting } from '../light.ts';
import { outputSize, render, type Image, type Region, type RenderOptions } from '../render.ts';
import { dpow } from '../dmath.ts';
import { encode } from '../srgb.ts';
import { toneMap } from '../tone.ts';
import { glowAt, prepareGlow, type Glow } from './glow.ts';
import { patternFactor } from './pattern.ts'; // tool:pattern: a light's pattern runs on onto the wall

/** The narrowest half-width of the shadow's edge, in picture widths. */
export const WALL_EDGE = 0.002;

/** The picture's size and the margin, for a piece W x H pixels (§5.12.7). */
export function wallSize(doc: Doc, W: number, H: number): { width: number; height: number; margin: number } {
  if (!doc.wall.on) return { width: W, height: H, margin: 0 };
  const mp = Math.round(doc.wall.margin * W);
  return { width: W + 2 * mp, height: H + 2 * mp, margin: mp };
}

/** The wall's paint, linear: decode(tone) times warmth's colour (luma 1, as Finish's, §5.9). */
export function wallPaint(doc: Doc): RGB {
  const t = doc.wall.tone, w = doc.wall.warmth;
  const v = t <= 0.04045 ? t / 12.92 : dpow((t + 0.055) / 1.055, 2.4);
  if (w === 0) return [v, v, v];
  const c = colour(w > 0 ? 6500 - 2500 * w : 6500 - 4500 * w, doc.photo.space), l = luma(c[0], c[1], c[2]);
  return [(v * c[0]) / l, (v * c[1]) / l, (v * c[2]) / l];
}

/** Signed distance from (x, y) to the rectangle [0, 1] x [0, a]: negative inside. */
export function toPiece(x: number, y: number, a: number): number {
  const qx = Math.abs(x - 0.5) - 0.5, qy = Math.abs(y - a / 2) - a / 2;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0);
}

/** E on the wall at (x, y), z = -standoff, into out[0..2] (L from prepareLighting with relief off). */
export function wallLightAt(L: Lighting, doc: Doc, a: number, x: number, y: number, out: Float64Array): void {
  const s = doc.wall.standoff, k = doc.wall.shadow;
  let r = L.room[0], g = L.room[1], b = L.room[2];
  const each = (p: Lamp) => {
    let e: number, Xx: number, Xy: number, pw: number;
    if (p.sun) {
      e = p.intensity; Xx = x + (p.Lx * s) / p.Lz; Xy = y + (p.Ly * s) / p.Lz; pw = Math.max((p.size * s) / p.Lz, WALL_EDGE);
    } else { // §5.3 with P = Q: D = L - Q, D.z = L.z + standoff
      const dx = p.Lx - x, dy = p.Ly - y, dz = p.Lz + s;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const q = p.r0 / d;
      e = p.intensity * (1 + (q * q - 1) * p.falloff) * Math.min(dz / d / p.l0z, 8);
      if (p.spot) e *= smoothstep(p.cosOuter, p.cosInner, -(dx * p.sx + dy * p.sy + dz * p.sz) / d);
      const t = s / dz;
      Xx = x + dx * t; Xy = y + dy * t; pw = Math.max((p.size * s) / p.Lz, WALL_EDGE);
    }
    if (p.pat) e *= patternFactor(p.pat, p.sun, x, y, p.Lx, p.Ly, p.Lz + s, p.r0, p.sx, p.sy, p.sz); // tool:pattern
    if (k > 0) e *= 1 - k * (1 - smoothstep(-pw, pw, toPiece(Xx, Xy, a)));
    r += e * p.r; g += e * p.g; b += e * p.b;
  };
  for (const p of L.lamps) each(p);
  for (const p of L.suns) each(p);
  out[0] = r; out[1] = g; out[2] = b;
}

/**
 * The wall's pixels in `region` of the picture round a piece W x H pixels (wallSize), RGBA8; the
 * piece's own pixels are left at 0 (renderWithWall puts the piece there). `kappa`: the guard's
 * factor for the piece; `glow`: Glow prepared for the piece (prepareGlow), null for none.
 */
export function wallPixels(doc: Doc, W: number, H: number, region: Region, kappa: number, glow: Glow | null = null): Image {
  const { margin: mp } = wallSize(doc, W, H), a = H / W;
  const L = prepareLighting(doc, a, kappa, null), F = prepareFinish(doc, a), paint = wallPaint(doc);
  const protect = doc.tone.highlightProtect, { x: ox, y: oy, width: w, height: h } = region;
  const out = new Uint8ClampedArray(w * h * 4);
  const E = new Float64Array(3), c = new Float64Array(3), S = glow ? new Float64Array(3) : undefined;
  for (let j = 0; j < h; j++) {
    const pj = oy + j - mp, y = (pj + 0.5) / W, row = pj >= 0 && pj < H;
    for (let i = 0; i < w; i++) {
      const pi = ox + i - mp;
      if (row && pi >= 0 && pi < W) continue; // the piece
      const x = (pi + 0.5) / W, p = (j * w + i) * 4;
      wallLightAt(L, doc, a, x, y, E);
      if (S) { S[0] = 0; S[1] = 0; S[2] = 0; glowAt(glow!, x, y, S); } // tool:glow: its maps read with edges clamped
      toneMap(paint[0], paint[1], paint[2], E, protect, c, S);
      if (F) finishPixel(F, c[0]!, c[1]!, c[2]!, x, y, out, p);
      else { out[p] = encode(c[0]!); out[p + 1] = encode(c[1]!); out[p + 2] = encode(c[2]!); }
      out[p + 3] = 255;
    }
  }
  return { data: out, width: w, height: h };
}

/** The picture with the wall (render() alone when wall.on is false). `opts.width` is the piece's
 *  width; `opts.region` is in the whole picture's pixels. */
export function renderWithWall(photo: Image, doc: Doc, opts: RenderOptions = {}): Image {
  if (!doc.wall.on) return render(photo, doc, opts);
  const { width: W, height: H } = outputSize(photo, opts.width), size = wallSize(doc, W, H), mp = size.margin;
  const r = opts.region ?? { x: 0, y: 0, width: size.width, height: size.height };
  if (![r.x, r.y, r.width, r.height].every(Number.isInteger) || r.x < 0 || r.y < 0 || r.width < 1 || r.height < 1
    || r.x + r.width > size.width || r.y + r.height > size.height)
    throw new Error(`region must be whole pixels inside the ${size.width} x ${size.height} picture`);
  const kappa = opts.kappa ?? guardKappa(photo, doc);
  const glow = prepareGlow(photo, doc, kappa, H / W, opts.glow); // tool:glow
  const out = wallPixels(doc, W, H, r, kappa, glow);
  const x0 = Math.max(r.x, mp), y0 = Math.max(r.y, mp), x1 = Math.min(r.x + r.width, mp + W), y1 = Math.min(r.y + r.height, mp + H);
  if (x1 > x0 && y1 > y0) {
    const piece = render(photo, doc, { ...opts, kappa, region: { x: x0 - mp, y: y0 - mp, width: x1 - x0, height: y1 - y0 } });
    for (let j = 0; j < piece.height; j++)
      out.data.set(piece.data.subarray(j * piece.width * 4, (j + 1) * piece.width * 4), ((y0 - r.y + j) * r.width + (x0 - r.x)) * 4);
  }
  return out;
}
