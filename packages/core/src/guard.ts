// guard.ts — protect whites (BUILD.md §5.7): the largest kappa in [0.25, 1] for which the
// rendered picture has at most 0.5% more blown pixels than the photo. Judged on a thumbnail
// (long side 512, area-averaged, relief off) by 12 steps of bisection.

import { prepareLighting } from './light.ts';
import { thumbnail, type Image } from './resample.ts';
import type { Doc } from './schema.ts';
import { shade } from './tone.ts';

export const GUARD_SIZE = 512, BLOWN = 250, MAX_NEW_BLOWN = 0.005;

/** Share of pixels whose display luma (luma of the 8-bit values) is >= 250. */
export function blownShare(img: Image): number {
  const d = img.data, n = img.width * img.height;
  let k = 0;
  for (let p = 0; p < d.length; p += 4) if (0.2126 * d[p]! + 0.7152 * d[p + 1]! + 0.0722 * d[p + 2]! >= BLOWN) k++;
  return k / n;
}

const thumbs = new WeakMap<Uint8ClampedArray, { thumb: Image; blown: number }>();
/** The photo's guard thumbnail and its blown share (kept per photo). */
export function guardThumb(photo: Image): { thumb: Image; blown: number } {
  let t = thumbs.get(photo.data);
  if (!t) {
    const thumb = thumbnail(photo, GUARD_SIZE);
    t = { thumb, blown: blownShare(thumb) };
    thumbs.set(photo.data, t);
  }
  return t;
}

/** kappa for this photo and document (1 when protectWhites is off). */
export function guardKappa(photo: Image, doc: Doc): number {
  if (!doc.tone.protectWhites) return 1;
  const { thumb, blown } = guardThumb(photo);
  const a = thumb.height / thumb.width;
  const pass = (k: number) =>
    blownShare(shade(thumb, thumb.width, 0, 0, prepareLighting(doc, a, k), doc.tone.highlightProtect)) - blown <= MAX_NEW_BLOWN;
  if (pass(1)) return 1;
  let lo = 0.25, hi = 1;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (pass(mid)) lo = mid; else hi = mid;
  }
  return lo;
}
