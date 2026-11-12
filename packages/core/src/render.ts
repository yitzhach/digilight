// render.ts — the reference renderer (BUILD.md §5): a document and a photo to RGBA8 pixels.
// Float64 throughout, deterministic maths, tables for the transfer curve. Rows are
// independent: any region gives exactly the pixels a whole render has there, so callers can
// split the work across workers (pass the same `kappa` to each).

import { guardKappa } from './guard.ts';
import { prepareLighting } from './light.ts';
import { estimatedRelief, type ReliefMaps } from './relief/index.ts';
import { crop, resampleRegion, type Image } from './resample.ts';
import type { Doc } from './schema.ts';
import { shade } from './tone.ts';

export type { Image } from './resample.ts';
export interface Region { x: number; y: number; width: number; height: number }
export interface RenderOptions {
  /** Output width in pixels (default: the photo's). The height keeps the photo's shape. */
  width?: number;
  /** Part of the output picture, in output pixels (default: all of it). */
  region?: Region;
  /** The guard's factor, if already known (guardKappa); computed otherwise. */
  kappa?: number;
  /** Relief maps for this photo (relief on). Estimated ones are made here if not given. */
  relief?: ReliefMaps;
}

/** Output size for a width (default the photo's own). */
export function outputSize(photo: { width: number; height: number }, width?: number): { width: number; height: number } {
  if (width === undefined || width === photo.width) return { width: photo.width, height: photo.height };
  if (!Number.isInteger(width) || width < 1 || width > 16384) throw new Error(`width must be a whole number from 1 to 16384, not ${width}`);
  return { width, height: Math.max(1, Math.round((width * photo.height) / photo.width)) };
}

const FINISH_NEUTRAL = { exposure: 0, contrast: 0, warmth: 0, saturation: 0, vignette: 0, grain: 0 } as const;

/** True when the document leaves every pixel as photographed (§5.5 identity). */
export function isNeutral(doc: Doc): boolean {
  const f = doc.finish;
  return doc.ambient.level === 1 && doc.ambient.kelvin === 6500 && doc.relief.mode === 'off'
    && !doc.lights.some((l) => l.on && l.intensity > 0)
    && f.curve === undefined && (Object.keys(FINISH_NEUTRAL) as (keyof typeof FINISH_NEUTRAL)[]).every((k) => f[k] === 0);
}

/** The picture: RGBA8 in the photo's colour space, region-sized. */
export function render(photo: Image, doc: Doc, opts: RenderOptions = {}): Image {
  if (photo.width !== doc.photo.width || photo.height !== doc.photo.height)
    throw new Error(`the document is for a ${doc.photo.width} x ${doc.photo.height} photo, this one is ${photo.width} x ${photo.height}`);
  const { width: W, height: H } = outputSize(photo, opts.width);
  const r = opts.region ?? { x: 0, y: 0, width: W, height: H };
  if (![r.x, r.y, r.width, r.height].every(Number.isInteger) || r.x < 0 || r.y < 0 || r.width < 1 || r.height < 1
    || r.x + r.width > W || r.y + r.height > H)
    throw new Error(`region must be whole pixels inside the ${W} x ${H} picture`);
  const src = W === photo.width ? crop(photo, r.x, r.y, r.width, r.height) : resampleRegion(photo, W, H, r.x, r.y, r.width, r.height);
  if (isNeutral(doc)) return src;
  const kappa = opts.kappa ?? guardKappa(photo, doc);
  return shade(src, W, r.x, r.y, prepareLighting(doc, H / W, kappa, reliefFor(photo, doc, opts.relief)), doc.tone.highlightProtect);
}

/** The relief maps a render of this document uses (null with relief off). */
export function reliefFor(photo: Image, doc: Doc, given?: ReliefMaps): ReliefMaps | null {
  if (doc.relief.mode === 'off') return null;
  if (given) return given;
  if (doc.relief.mode === 'estimated') return estimatedRelief(photo);
  throw new Error('measured texture needs its maps: measure it from a side-lit photo first');
}
