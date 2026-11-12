// axis.ts — the light's axis read from a flat and side-lit pair alone (BUILD.md Phase 5, step
// 2; reference bench/bakeoff/azimuth.py). The shading log(side-lit / flat) is a derivative of
// the relief along the light, so its gradient energy peaks along that axis: the structure
// tensor of its stroke-scale band gives the axis. Which end the light stood at cannot be read
// reliably (a bump lit from the left looks like a hollow lit from the right), so the app asks.
//
// Two changes from azimuth.py (D-041): the band starts at 1 px, not 2, and a gradient counts
// for at most the 75th percentile's size, so a few hard edges (a recessed block's sides, which
// run along the picture's own axes) do not pull the answer toward 0 or 90 degrees. On the five
// fixture pairs the worst miss went from 18.5 to 12 degrees (24 to 13 with the app's own
// line-up of the handheld photos).

import { datan2, DEG, dln } from '../dmath.ts';
import { boxBlur } from './box.ts';

/** The band, in picture widths (1 and 8 px on a 1280 px photo). */
const BAND = [1 / 1280, 8 / 1280] as const;

export interface LightAxis {
  /** 0 to 180 degrees, as §5.1 (0 along the right-left line, 90 the top-bottom line). */
  axisDeg: number;
  /** 0 (no direction stands out) to 1 (all the shading runs one way). */
  coherence: number;
}

/** `flat` and `lit` are RGBA, w x h, lined up; pixels where `lit` is transparent are left out. */
export function lightAxis(flat: ArrayLike<number>, lit: ArrayLike<number>, w: number, h: number): LightAxis {
  const n = w * h, s = new Float32Array(n), ok = new Uint8Array(n), m = Math.floor(0.03 * w);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const f = 0.2126 * flat[p]! + 0.7152 * flat[p + 1]! + 0.0722 * flat[p + 2]!, r = 0.2126 * lit[p]! + 0.7152 * lit[p + 1]! + 0.0722 * lit[p + 2]!;
    s[i] = dln((r + 4) / (f + 4));
    const x = i % w, y = (i - x) / w;
    ok[i] = r > 2 && lit[p + 3]! === 255 && f > 12 && f < 250 && x >= m && x < w - m && y >= m && y < h - m ? 1 : 0;
  }
  const r0 = Math.max(1, Math.round(BAND[0] * w)), r1 = Math.max(r0 + 1, Math.round(BAND[1] * w));
  const a = boxBlur(s, w, h, r0, 1), b = boxBlur(s, w, h, r1, 1);
  for (let i = 0; i < n; i++) a[i]! -= b[i]!;
  // The 75th percentile of the gradient's size, from every third pixel.
  const sizes: number[] = [];
  for (let y = 1; y < h - 1; y += 3) for (let x = 1; x < w - 1; x += 3) {
    const i = y * w + x;
    if (ok[i]) { const gx = a[i + 1]! - a[i - 1]!, gy = a[i + w]! - a[i - w]!; sizes.push(0.25 * (gx * gx + gy * gy)); }
  }
  const cap = sizes.length ? Float64Array.from(sizes).sort()[Math.floor(sizes.length * 0.75)]! : 0;
  let jxx = 0, jyy = 0, jxy = 0, k = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (!ok[i]) continue;
    const gx = 0.5 * (a[i + 1]! - a[i - 1]!), gy = -0.5 * (a[i + w]! - a[i - w]!); // y up
    const g2 = gx * gx + gy * gy, wt = g2 > cap && g2 > 0 ? cap / g2 : 1;
    jxx += wt * gx * gx; jyy += wt * gy * gy; jxy += wt * gx * gy; k++;
  }
  if (!k || !(jxx + jyy > 0)) return { axisDeg: 0, coherence: 0 };
  let axis = (0.5 * datan2(2 * jxy, jxx - jyy)) / DEG;
  if (axis < 0) axis += 180;
  if (axis >= 180) axis -= 180;
  const dj = jxx - jyy;
  return { axisDeg: axis, coherence: Math.sqrt(dj * dj + 4 * jxy * jxy) / (jxx + jyy) };
}

/** The smaller angle between two axes (each 0 to 180), 0 to 90 degrees. */
export function axisDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 180;
  return Math.min(d, 180 - d);
}
