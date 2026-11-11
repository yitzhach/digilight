// resample.ts — the photo at another size, the same pixels every time. Ported from v1
// src/resample.js (its arithmetic; v1 read pixels through a canvas, here they are given).
//
// An area average: each output pixel is the mean of the photo pixels its footprint covers
// (partly covered ones by the share covered), on the 8-bit values. Upscaling (a footprint under
// a pixel wide) falls back to a footprint one pixel wide, which is linear interpolation.
// Every output pixel depends only on where it sits in the whole W x H picture, never on the
// region asked for: a region has exactly the pixels a whole resample has there.

export interface Image { data: Uint8ClampedArray; width: number; height: number }

/** Pixels [ox, ox + ow) x [oy, oy + oh) of `src` resampled to W x H, opaque RGBA8. */
export function resampleRegion(src: Image, W: number, H: number, ox: number, oy: number, ow: number, oh: number): Image {
  const SW = src.width, SH = src.height, s = src.data;
  const cols = weights(SW / W, SW, ox, ow), rows = weights(SH / H, SH, oy, oh);
  const out = new Uint8ClampedArray(ow * oh * 4);
  // Across: each photo row the region reads, to ow columns.
  const sy0 = rows.lo, sh = rows.hi - rows.lo;
  const mid = new Float64Array(sh * ow * 3);
  for (let y = 0; y < sh; y++) {
    const r = (sy0 + y) * SW * 4, m = y * ow * 3;
    for (let x = 0; x < ow; x++) {
      const a = cols.at[x]!, n = cols.n[x]!, o = cols.start[x]!;
      let R = 0, G = 0, B = 0;
      for (let k = 0; k < n; k++) {
        const w = cols.w[a + k]!, p = r + (o + k) * 4;
        R += w * s[p]!; G += w * s[p + 1]!; B += w * s[p + 2]!;
      }
      mid[m + x * 3] = R; mid[m + x * 3 + 1] = G; mid[m + x * 3 + 2] = B;
    }
  }
  // Down.
  for (let y = 0; y < oh; y++) {
    const a = rows.at[y]!, n = rows.n[y]!, o = rows.start[y]! - sy0;
    for (let x = 0; x < ow; x++) {
      let R = 0, G = 0, B = 0;
      for (let k = 0; k < n; k++) {
        const w = rows.w[a + k]!, p = ((o + k) * ow + x) * 3;
        R += w * mid[p]!; G += w * mid[p + 1]!; B += w * mid[p + 2]!;
      }
      const q = (y * ow + x) * 4;
      out[q] = Math.round(R); out[q + 1] = Math.round(G); out[q + 2] = Math.round(B); out[q + 3] = 255;
    }
  }
  return { data: out, width: ow, height: oh };
}

/** The region [ox, ox + ow) x [oy, oy + oh) of `src` at its own size, copied. */
export function crop(src: Image, ox: number, oy: number, ow: number, oh: number): Image {
  if (ox === 0 && oy === 0 && ow === src.width && oh === src.height) return { data: src.data.slice(), width: ow, height: oh };
  const out = new Uint8ClampedArray(ow * oh * 4);
  for (let y = 0; y < oh; y++) {
    const a = ((oy + y) * src.width + ox) * 4;
    out.set(src.data.subarray(a, a + ow * 4), y * ow * 4);
  }
  return { data: out, width: ow, height: oh };
}

/** `src` with its long side `long` (area average), or itself if it is no larger. */
export function thumbnail(src: Image, long: number): Image {
  if (Math.max(src.width, src.height) <= long) return src;
  const W = src.width >= src.height ? long : Math.max(1, Math.round(long * src.width / src.height));
  const H = src.width >= src.height ? Math.max(1, Math.round(long * src.height / src.width)) : long;
  return resampleRegion(src, W, H, 0, 0, W, H);
}

// Per output pixel i of [o, o + n) along one axis (k photo pixels per output pixel, S photo
// pixels in all): its footprint, centred on (i + 0.5) k and k wide (at least 1), as weights
// over the photo pixels it covers, clamped to the photo and summing to 1. lo / hi: the photo
// pixels any of them reads.
function weights(k: number, S: number, o: number, n: number) {
  const half = Math.max(1, k) / 2, start = new Int32Array(n), cnt = new Int32Array(n), at = new Int32Array(n), w: number[] = [];
  let lo = S, hi = 0;
  for (let i = 0; i < n; i++) {
    const c = (o + i + 0.5) * k;
    const a = Math.max(0, c - half), b = Math.min(S, c + half);
    const p0 = Math.min(S - 1, Math.floor(a)), p1 = Math.max(p0 + 1, Math.ceil(b));
    let sum = 0;
    at[i] = w.length; start[i] = p0;
    for (let p = p0; p < p1; p++) { const v = Math.max(0, Math.min(b, p + 1) - Math.max(a, p)); w.push(v); sum += v; }
    if (!(sum > 0)) { w.length = at[i]!; w.push(1); cnt[i] = 1; }
    else { for (let j = at[i]!; j < w.length; j++) w[j]! /= sum; cnt[i] = p1 - p0; }
    lo = Math.min(lo, p0); hi = Math.max(hi, start[i]! + cnt[i]!);
  }
  return { start, n: cnt, at, w: Float64Array.from(w), lo, hi };
}
