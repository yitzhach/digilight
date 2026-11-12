// measure.ts — True Relief: the surface measured from one to three side-lit photos of the
// piece plus the flat photo the app already has. Ported from v1 src/lampphotos.js
// (measureRelief), which already works on Isaac's photos; the method is in shading.ts.
//
// A lamp shot comes from the same tripod and is aligned here (align.ts). A sun shot is
// handheld, from another place: it must be lined up first (lineup.ts) and is used as it is;
// aligning it on colour would read its sky-blue shadows as paint edges and blur the finest
// relief. With one light the depth scale is open (a relief twice as deep under a sun twice as
// steep looks alike): it comes from the elevation given, and the artist can change Depth.

import { align, luminance, NO_SHIFT, warpShot, type Alignment, type Warped } from './align.ts';
import { boxBlur, percentiles } from './box.ts';
import { integrate, sharpen } from './integrate.ts';
import { BEAM_SIGMA, DRIFT_SIGMA, findGlints, fitRoom, normalise, predicted, shading, shotPixels, slopes, type Shading, type ShotLight } from './shading.ts';

const REFINE = 2;                      // rounds of taking the relief out of the beam
const CHECK_BAND = [0.0022, 0.009];    // stroke-scale band the check scores (picture widths)

export interface Shot { rgba: ArrayLike<number>; light: ShotLight }
export interface MeasureInput {
  /** The flat photo, RGBA, w x h; each shot's rgba is the same size. */
  even: ArrayLike<number>; shots: Shot[]; w: number; h: number;
  /** The picture's width in cm: needed for a lamp given in cm, not for the sun. */
  widthCm?: number;
  onProgress?: (text: string) => void;
  glints?: boolean; driftSigma?: number; beamSigma?: number;
}
export interface ShotReport { align: Alignment; /** room (or sky) light's share */ room: number; usable: number; glint: number }
export interface Measured {
  /** Height in pixels of this image, mean about 0, drift removed. */
  height: Float32Array; w: number; h: number;
  /** Its 2% to 98% spread and lowest-to-highest range, away from the edges, in picture widths. */
  depth: number; range: number;
  /** With three or more shots: how well the others predict each (correlation, stroke scale). */
  check: number[] | null;
  shots: ShotReport[];
}

function bandCorr(a: Float32Array, b: Float32Array, mask: Uint8Array, w: number, h: number): number {
  const s1 = CHECK_BAND[0]! * w, s2 = CHECK_BAND[1]! * w;
  const a1 = boxBlur(a, w, h, s1), a2 = boxBlur(a, w, h, s2), b1 = boxBlur(b, w, h, s1), b2 = boxBlur(b, w, h, s2);
  let sa = 0, sb = 0, n = 0;
  for (let i = 0; i < a.length; i++) if (mask[i]) { sa += a1[i]! - a2[i]!; sb += b1[i]! - b2[i]!; n++; }
  if (n < 100) return 0;
  sa /= n; sb /= n;
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) if (mask[i]) { const x = a1[i]! - a2[i]! - sa, y = b1[i]! - b2[i]! - sb; ab += x * y; aa += x * x; bb += y * y; }
  return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0;
}

interface Work extends Shading { align: Alignment; warped: Warped; glint: number }

export function measureRelief(inp: MeasureInput): Measured {
  const { even, shots, w, h, glints = true, onProgress = () => {} } = inp, n = w * h;
  if (!shots.length) throw new Error('measureRelief needs at least one side-lit photo');
  const widthCm = inp.widthCm ?? 0;
  if (!(widthCm > 0) && shots.some((s) => !('sun' in s.light))) throw new Error('a lamp placed in cm needs the picture\'s width in cm');
  const evenLum = luminance(even, n), evenSat = new Float32Array(n);
  for (let i = 0; i < n; i++) { const r = even[i * 4]!, g = even[i * 4 + 1]!, b = even[i * 4 + 2]!, mx = Math.max(r, g, b); evenSat[i] = mx > 0 ? (mx - Math.min(r, g, b)) / mx : 0; }
  // Very dark paint has too little light to divide by.
  const dark = percentiles(evenLum, [0.5])[0]! * 0.04, evenOk = new Uint8Array(n);
  for (let i = 0; i < n; i++) evenOk[i] = evenLum[i]! > dark && even[i * 4]! < 250 && even[i * 4 + 1]! < 250 && even[i * 4 + 2]! < 250 ? 1 : 0;

  const S: Work[] = shots.map((shot, k) => {
    onProgress(`Lining up side-lit photo ${k + 1} of ${shots.length}…`);
    const sun = 'sun' in shot.light;
    const al = sun ? NO_SHIFT : align(even, shot.rgba, w, h);
    const warped = warpShot(shot.rgba, w, h, al.map), px = shotPixels(shot.light, widthCm, w, h);
    return { ...shading(warped.lum, warped.bad, evenLum, evenOk, w, h, px, inp.beamSigma ?? BEAM_SIGMA), align: al, warped, glint: 0 };
  });
  onProgress('Reading the slopes…');
  const all = S.map((_, k) => k);
  let { hx, hy, seen } = slopes(S, all, w, h);
  // The beam was taken as each shot's local mean, which also holds whatever relief is broader
  // than BEAM_SIGMA, so that relief came out too flat. With slopes in hand, the beam is the
  // shot's local mean over the shading they predict; then the slopes are read again.
  for (let round = 0; round < REFINE; round++) {
    onProgress(`Taking the relief out of the light (${round + 1} of ${REFINE})…`);
    for (const sh of S) {
      const pred = predicted(sh, hx, hy, w, h);
      if (round === 0) fitRoom(sh, pred, w, h);
      const num = new Float32Array(n);
      for (let i = 0; i < n; i++) if (sh.valid[i]) num[i] = sh.D[i]!; else pred[i] = 0;
      const bn = boxBlur(num, w, h, sh.beamSigma * w), bd = boxBlur(pred, w, h, sh.beamSigma * w);
      for (let i = 0; i < n; i++) bn[i]! /= Math.max(1e-4, bd[i]!);
      normalise(sh, bn);
      // Glints, once the beam no longer holds the relief: left out of the solve from here on;
      // where no shot is left, the integration fills in.
      if (round === 0 && glints) {
        const g = findGlints(sh, sh.warped, evenSat, w, h);
        let k = 0;
        for (let i = 0; i < n; i++) if (g[i]) { if (sh.valid[i]) k++; sh.valid[i] = 0; sh.ok[i] = 0; }
        sh.glint = k / n;
      }
    }
    ({ hx, hy, seen } = slopes(S, all, w, h));
  }
  onProgress('Building the height…');
  const raw = sharpen(integrate(hx, hy, w, h), hx, hy, w, h, 1, seen);
  const drift = boxBlur(raw, w, h, (inp.driftSigma ?? DRIFT_SIGMA) * w);
  const height = new Float32Array(n);
  for (let i = 0; i < n; i++) height[i] = raw[i]! - drift[i]!;
  // Depth over the picture, away from its edges.
  const m = Math.round(0.02 * w), inner = new Uint8Array(n);
  for (let y = m; y < h - m; y++) for (let x = m; x < w - m; x++) inner[y * w + x] = 1;
  const [p2, p98] = percentiles(height, [0.02, 0.98], inner) as [number, number];
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) if (inner[i]) { if (height[i]! < lo) lo = height[i]!; if (height[i]! > hi) hi = height[i]!; }
  let check: number[] | null = null;
  if (S.length >= 3) {
    onProgress('Checking each photo against the others…');
    check = S.map((sh, k) => {
      const { hx: gx, hy: gy } = slopes(S, all.filter((j) => j !== k), w, h);
      const pred = new Float32Array(n), mask = new Uint8Array(n);
      const cut = percentiles(sh.beam, [0.5])[0]!;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        pred[i] = 1 - (gx[i]! * (sh.px.x - x - 0.5)) / sh.px.z - (gy[i]! * (sh.px.y - y - 0.5)) / sh.px.z;
        mask[i] = inner[i] && sh.ok[i] && sh.beam[i]! > cut ? 1 : 0;
      }
      return bandCorr(sh.s, pred, mask, w, h);
    });
  }
  return {
    height, w, h, depth: (p98 - p2) / w, range: hi > lo ? (hi - lo) / w : 0, check,
    shots: S.map((sh) => ({ align: sh.align, room: sh.a, usable: sh.ok.reduce((t, v) => t + v, 0) / n, glint: sh.glint })),
  };
}
