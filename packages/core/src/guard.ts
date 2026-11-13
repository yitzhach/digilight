// guard.ts — protect whites (BUILD.md §5.7): the largest kappa in [0.25, 1] for which the
// rendered picture has at most 0.5% more blown pixels than the photo. Judged on a thumbnail
// (long side 512, area-averaged, relief off, finish neutral) by 12 steps of bisection.

import { prepareLighting } from './light.ts';
import { thumbnail, type Image } from './resample.ts';
import type { Doc } from './schema.ts';
import { shade } from './tone.ts';

export const GUARD_SIZE = 512, BLOWN = 250, MAX_NEW_BLOWN = 0.005;

/** Share of pixels whose display luma (luma of the 8-bit values) is >= 250. */
export function blownShare(img: Image, blown = BLOWN): number {
  const d = img.data, n = img.width * img.height;
  let k = 0;
  for (let p = 0; p < d.length; p += 4) if (0.2126 * d[p]! + 0.7152 * d[p + 1]! + 0.0722 * d[p + 2]! >= blown) k++;
  return k / n;
}

const thumbs = new WeakMap<Uint8ClampedArray, Image>();
/** The photo's guard thumbnail (kept per photo) and its blown share. */
export function guardThumb(photo: Image, at = BLOWN): { thumb: Image; blown: number } {
  let thumb = thumbs.get(photo.data);
  if (!thumb) { thumb = thumbnail(photo, GUARD_SIZE); thumbs.set(photo.data, thumb); }
  return { thumb, blown: blownShare(thumb, at) };
}

/** kappa for this photo and document (1 when protectWhites is off). `at`: the blown level
 *  (§5.7 says 250; other values only to compare, e.g. in a review round). */
export function guardKappa(photo: Image, doc: Doc, at = BLOWN): number {
  if (!doc.tone.protectWhites) return 1;
  const { thumb, blown } = guardThumb(photo, at);
  const a = thumb.height / thumb.width;
  // Finish is not counted (§5.7), Brightness included: judged as if it were neutral.
  const d = doc.finish.exposure === 0 ? doc : { ...doc, finish: { ...doc.finish, exposure: 0 } };
  const pass = (k: number) =>
    blownShare(shade(thumb, thumb.width, 0, 0, prepareLighting(d, a, k), doc.tone.highlightProtect), at) - blown <= MAX_NEW_BLOWN;
  if (pass(1)) return 1;
  let lo = 0.25, hi = 1;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (pass(mid)) lo = mid; else hi = mid;
  }
  return lo;
}
