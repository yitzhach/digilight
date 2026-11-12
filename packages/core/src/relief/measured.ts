// measured.ts — True Relief end to end (BUILD.md Phase 5): side-lit photos of the piece, lined
// up, measured, and kept as a 16-bit height the maps are made from. The same chain runs in
// Node, in the app's worker and (Phase 7) behind the MCP server.
//
// The height is kept as 16 bits a pixel between `lo` and `hi` (in hHat units), which is what a
// project file carries (two channels of a PNG, packHeight). The maps are always made from those
// 16 bits, so a reopened project gives the same picture as the session that measured it.

import { resampleRegion, type Image } from '../resample.ts';
import { lightAxis, type LightAxis } from './axis.ts';
import { reliefSize, slopes } from './estimate.ts';
import { buildHorizon, horizonInput } from './horizon.ts';
import { lineUp, warpPhoto, type LineUp } from './lineup.ts';
import { measureRelief, type Measured, type ShotReport } from './measure.ts';
import type { ReliefMaps } from './sample.ts';
import type { ShotLight } from './shading.ts';

/** Elevation of a side light when none is given (degrees above the picture's face). */
export const DEFAULT_ELEVATION = 20;

export interface MeasuredHeight {
  width: number; height: number;
  /** hHat = lo + (hi - lo) * data / 65535 (median 0, 2% to 98% spread 1). */
  lo: number; hi: number; data: Uint16Array;
}

/** A side-lit photo on the flat photo's pixels at relief size. */
export interface SideLit {
  /** RGBA at relief size; transparent where the photo does not cover the piece. */
  lined: Uint8ClampedArray;
  /** How it was lined up (null: a tripod shot of the photo's own size, aligned when measured). */
  lineUp: LineUp | null;
  axis: LightAxis;
}

/** The flat photo at relief size (rows the same as estimate.ts makes). */
export function reliefFlat(photo: Image): Image {
  const { width, height, same } = reliefSize(photo);
  return same ? photo : resampleRegion(photo, width, height, 0, 0, width, height);
}

/** Lines a side-lit photo up onto the flat photo (at relief size) and reads the light's axis.
 *  `tripod`: the photo comes from the flat photo's own tripod position and is its size, so it
 *  is only resized (measureRelief aligns it); otherwise it is handheld and gets a homography. */
export function prepareSideLit(flat: Image, side: Image, tripod = false): SideLit {
  const { width: w, height: h } = flat;
  let lined: Uint8ClampedArray, lu: LineUp | null = null;
  if (tripod) {
    if (Math.abs(side.width / side.height - w / h) > 0.01) throw new Error('a tripod photo must have the same shape as the photo of the piece');
    lined = side.width === w && side.height === h ? new Uint8ClampedArray(side.data) : resampleRegion(side, w, h, 0, 0, w, h).data;
  } else {
    lu = lineUp(flat.data, w, h, side.data, side.width, side.height);
    if (!lu.H) throw new Error('Could not line this photo up with the photo of the piece. Take it closer to straight on, with the whole piece in the frame.');
    if (lu.covered < 0.6) throw new Error('This photo shows too little of the piece. Take it with the whole piece in the frame.');
    lined = warpPhoto(side.data, side.width, side.height, lu.H, w, h, w, h);
  }
  return { lined, lineUp: lu, axis: lightAxis(flat.data, lined, w, h) };
}

/** A measured height (pixels) as 16-bit hHat, and the depth it stands for (picture widths). */
export function quantise(m: Measured): { height: MeasuredHeight; depth: number } {
  const n = m.w * m.h, spread = m.depth * m.w, s = Float32Array.from(m.height).sort(), med = s[n >> 1]!;
  if (!(spread > 1e-9)) return { height: { width: m.w, height: m.h, lo: 0, hi: 0, data: new Uint16Array(n) }, depth: 0 };
  const lo = (s[0]! - med) / spread, hi = (s[n - 1]! - med) / spread, k = 65535 / (hi - lo || 1), data = new Uint16Array(n);
  for (let i = 0; i < n; i++) data[i] = Math.round(((m.height[i]! - med) / spread - lo) * k);
  return { height: { width: m.w, height: m.h, lo, hi, data }, depth: m.depth };
}

const cache = new WeakMap<Uint16Array, ReliefMaps>();

/** hHat from the stored 16 bits. */
export function measuredHHat(m: MeasuredHeight): Float32Array {
  const hh = new Float32Array(m.data.length), k = (m.hi - m.lo) / 65535;
  for (let i = 0; i < hh.length; i++) hh[i] = m.lo + k * m.data[i]!;
  return hh;
}

/** The relief maps of a measured height (kept per height): unblurred, as §5.6 says. */
export function measuredRelief(m: MeasuredHeight): ReliefMaps {
  let maps = cache.get(m.data);
  if (!maps) {
    const h = measuredHHat(m);
    maps = { width: m.width, height: m.height, h, ...slopes(h, m.width, m.height), ...buildHorizon(horizonInput(h, m.width, m.height, false)) };
    cache.set(m.data, maps);
  }
  return maps;
}

/** The height turned over: what the same photo gives when its light came from the other end. */
export function flipped(m: MeasuredHeight): MeasuredHeight {
  const data = new Uint16Array(m.data.length);
  for (let i = 0; i < data.length; i++) data[i] = 65535 - m.data[i]!;
  return { width: m.width, height: m.height, lo: -m.hi, hi: -m.lo, data };
}

/** The 16-bit height as RGBA for a PNG: high byte in red, low byte in green. */
export function packHeight(m: MeasuredHeight): Uint8ClampedArray {
  const out = new Uint8ClampedArray(m.data.length * 4);
  for (let i = 0, p = 0; i < m.data.length; i++, p += 4) { const v = m.data[i]!; out[p] = v >> 8; out[p + 1] = v & 255; out[p + 3] = 255; }
  return out;
}
export function unpackHeight(rgba: ArrayLike<number>, width: number, height: number, lo: number, hi: number): MeasuredHeight {
  const data = new Uint16Array(width * height);
  if (rgba.length !== data.length * 4) throw new Error('the height picture does not match its size');
  for (let i = 0, p = 0; i < data.length; i++, p += 4) data[i] = (rgba[p]! << 8) | rgba[p + 1]!;
  return { width, height, lo, hi, data };
}

/** One side-lit photo for measureFromPhotos. */
export interface SidePhoto {
  image: Image;
  /** Where its light came from, degrees as §5.1 (0 right, 90 top). Left out: the axis read from
   *  the pair, taking the end in the upper half (say so to the user; the other end is + 180). */
  from?: number;
  /** Degrees above the picture's face (default 20). */
  elevation?: number;
  /** A lamp's place in cm instead (left of the left edge, above the top edge, out from the
   *  wall): the photo must come from the flat photo's tripod position; needs `widthCm`. */
  lamp?: { left: number; above: number; out: number };
}
export interface TrueRelief {
  height: MeasuredHeight; depth: number;
  check: number[] | null;
  photos: (ShotReport & { from: number | null; elevation: number | null; axis: LightAxis; assumedEnd: boolean; lineUp: LineUp | null })[];
}

/** The whole chain for a photo and its side-lit photos (one to three). */
export function measureFromPhotos(photo: Image, photos: SidePhoto[], opts: { widthCm?: number; onProgress?: (text: string) => void } = {}): TrueRelief {
  if (photos.length < 1 || photos.length > 3) throw new Error('True Relief takes one to three side-lit photos');
  const flat = reliefFlat(photo), say = opts.onProgress ?? (() => {});
  const prepared = photos.map((p, k) => { say(`Lining up side-lit photo ${k + 1} of ${photos.length}…`); return prepareSideLit(flat, p.image, !!p.lamp); });
  const lights = photos.map((p, k): { light: ShotLight; from: number | null; elevation: number | null; assumedEnd: boolean } => {
    if (p.lamp) return { light: p.lamp, from: null, elevation: null, assumedEnd: false };
    const from = p.from ?? prepared[k]!.axis.axisDeg, elevation = p.elevation ?? DEFAULT_ELEVATION;
    return { light: { sun: { azimuthDeg: from, elevationDeg: elevation } }, from, elevation, assumedEnd: p.from === undefined };
  });
  const m = measureRelief({
    even: flat.data, w: flat.width, h: flat.height, shots: prepared.map((s, k) => ({ rgba: s.lined, light: lights[k]!.light })),
    ...(opts.widthCm ? { widthCm: opts.widthCm } : {}), onProgress: say,
  });
  const q = quantise(m);
  return {
    ...q, check: m.check,
    photos: m.shots.map((s, k) => ({ ...s, from: lights[k]!.from, elevation: lights[k]!.elevation, assumedEnd: lights[k]!.assumedEnd, axis: prepared[k]!.axis, lineUp: prepared[k]!.lineUp })),
  };
}
