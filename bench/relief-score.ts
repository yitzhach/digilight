// relief-score.ts — renders of a flat photo scored against a real side-lit photo of the same
// piece (v1 tools/realref/score.py in TypeScript).
//
//     node bench/relief-score.ts FLAT.jpg REAL.jpg RENDER.jpg [RENDER.jpg ...]
//
// REAL must be lined up onto FLAT. Luma (of the 8-bit values) is split into four bands by box
// blurs of radius 1, 6, 24 and 80 px: fine, mid (stroke scale), broad, forms. Per picture:
//   p05 p50 p95   luma percentiles
//   amp           each band's mean size per unit brightness, over FLAT's
//   corr          each band's correlation with REAL's
//   shade corr    the same on log(picture / FLAT): the paint cancels and only light and shade
//                 are left, so +1 = the same light and shade in the same places, 0 = unrelated
//   shade amp     the size of that light and shade, over REAL's

import { resampleRegion, type Image } from '../packages/core/src/index.ts';
import { loadImage } from '../packages/core/scripts/jpeg.ts';

export const RADII = [1, 6, 24, 80], NAMES = ['fine', 'mid', 'broad', 'forms'];
type Plane = Float64Array;

export const luma = (img: Image): Plane => {
  const y = new Float64Array(img.width * img.height), d = img.data;
  for (let i = 0, p = 0; i < y.length; i++, p += 4) y[i] = 0.2126 * d[p]! + 0.7152 * d[p + 1]! + 0.0722 * d[p + 2]!;
  return y;
};

/** One box blur of radius r, edges repeated. */
export function box(src: Plane, w: number, h: number, r: number): Plane {
  const n = 2 * r + 1, mid = new Float64Array(w * h), out = new Float64Array(w * h);
  const cl = (v: number, hi: number) => (v < 0 ? 0 : v > hi ? hi : v);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let s = 0;
    for (let k = -r; k <= r; k++) s += src[o + cl(k, w - 1)]!;
    for (let x = 0; x < w; x++) { mid[o + x] = s / n; s += src[o + cl(x + r + 1, w - 1)]! - src[o + cl(x - r, w - 1)]!; }
  }
  const col = new Float64Array(w);
  for (let k = -r; k <= r; k++) { const o = cl(k, h - 1) * w; for (let x = 0; x < w; x++) col[x]! += mid[o + x]!; }
  for (let y = 0; y < h; y++) {
    const o = y * w, oa = cl(y + r + 1, h - 1) * w, ob = cl(y - r, h - 1) * w;
    for (let x = 0; x < w; x++) { out[o + x] = col[x]! / n; col[x]! += mid[oa + x]! - mid[ob + x]!; }
  }
  return out;
}

export function bands(y: Plane, w: number, h: number): Plane[] {
  const bl = [y, ...RADII.map((r) => box(y, w, h, r))];
  return RADII.map((_, i) => bl[i]!.map((v, j) => v - bl[i + 1]![j]!));
}

export function corr(a: Plane, b: Plane, ok: Uint8Array): number {
  let sa = 0, sb = 0, n = 0;
  for (let i = 0; i < a.length; i++) if (ok[i]) { sa += a[i]!; sb += b[i]!; n++; }
  sa /= n; sb /= n;
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) if (ok[i]) { const x = a[i]! - sa, y = b[i]! - sb; ab += x * y; aa += x * x; bb += y * y; }
  return ab / Math.sqrt(aa * bb);
}
const std = (a: Plane, ok: Uint8Array) => { let s = 0, q = 0, n = 0; for (let i = 0; i < a.length; i++) if (ok[i]) { s += a[i]!; q += a[i]! * a[i]!; n++; } return Math.sqrt(Math.max(0, q / n - (s / n) * (s / n))); };
const meanAbs = (a: Plane, ok: Uint8Array) => { let s = 0, n = 0; for (let i = 0; i < a.length; i++) if (ok[i]) { s += Math.abs(a[i]!); n++; } return s / n; };
const mean = (a: Plane, ok: Uint8Array) => { let s = 0, n = 0; for (let i = 0; i < a.length; i++) if (ok[i]) { s += a[i]!; n++; } return s / n; };

/** What the flat and real photo give once, for scoring any number of pictures against them. */
export function reference(flat: Image, real: Image) {
  const { width: w, height: h } = flat, f = luma(flat), r = luma(real), m = Math.floor(0.03 * w);
  // Where REAL covers the frame, off the edges, and the photo is neither black nor blown.
  const ok = new Uint8Array(w * h), okRatio = new Uint8Array(w * h);
  for (let y = m; y < h - m; y++) for (let x = m; x < w - m; x++) {
    const i = y * w + x;
    ok[i] = r[i]! > 2 && real.data[i * 4 + 3] === 255 ? 1 : 0;
    okRatio[i] = ok[i] && f[i]! > 12 && f[i]! < 250 ? 1 : 0;
  }
  const shade = (y: Plane) => bands(y.map((v, i) => Math.log((v + 4) / (f[i]! + 4))), w, h);
  return { w, h, f, r, ok, okRatio, shade, fb: bands(f, w, h), rb: bands(r, w, h), rs: shade(r) };
}
export type Reference = ReturnType<typeof reference>;

export interface Score { p: number[]; amp: number[]; corr: number[]; shadeCorr: number[]; shadeAmp: number[] }
/** One picture's scores (shade corr and amp are NaN for the flat photo itself). */
export function score(ref: Reference, pic: Image): Score {
  const { w, h, ok, okRatio } = ref, y = luma(pic), b = bands(y, w, h), s = ref.shade(y);
  const mu = Math.max(1, mean(y, ok)), fmu = Math.max(1, mean(ref.f, ok));
  const v = Float64Array.from(y.filter((_, i) => ok[i])).sort();
  const q = (t: number) => { const x = t * (v.length - 1), i = Math.floor(x); return v[i]! + (v[Math.min(v.length - 1, i + 1)]! - v[i]!) * (x - i); };
  return {
    p: [q(0.05), q(0.5), q(0.95)],
    amp: b.map((bj, j) => meanAbs(bj, ok) / mu / (meanAbs(ref.fb[j]!, ok) / fmu)),
    corr: b.map((bj, j) => corr(bj, ref.rb[j]!, ok)),
    shadeCorr: s.map((sj, j) => corr(sj, ref.rs[j]!, okRatio)),
    shadeAmp: s.map((sj, j) => std(sj, okRatio) / std(ref.rs[j]!, okRatio)),
  };
}

const sized = (img: Image, w: number, h: number): Image => (img.width === w && img.height === h ? img : resampleRegion(img, w, h, 0, 0, w, h));
const row = (v: number[]) => v.map((x) => x.toFixed(2).padStart(5)).join(' ');

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*\//, ''))) {
  const [flatPath, realPath, ...renders] = process.argv.slice(2);
  if (!flatPath || !realPath) { console.error('usage: node bench/relief-score.ts FLAT.jpg REAL.jpg RENDER.jpg [RENDER.jpg ...]'); process.exit(2); }
  const flat = loadImage(flatPath), real = sized(loadImage(realPath), flat.width, flat.height), ref = reference(flat, real);
  console.log(`${'picture'.padEnd(24)}  p05  p50  p95 | ${'amp x flat'.padEnd(23)} | ${'corr with real'.padEnd(23)} | ${'shade corr with real'.padEnd(23)} | shade amp / real`);
  console.log(`${''.padEnd(39)} | ${[0, 1, 2, 3].map(() => NAMES.map((n) => n.padStart(5)).join(' ')).join(' | ')}`);
  for (const [name, img] of [['REAL', real], ['FLAT', flat], ...renders.map((p): [string, Image] => [p.split('/').slice(-2).join('/'), sized(loadImage(p), flat.width, flat.height)])] as [string, Image][]) {
    const s = score(ref, img);
    console.log(`${name.slice(0, 24).padEnd(24)} ${s.p.map((x) => x.toFixed(0).padStart(4)).join(' ')} | ${row(s.amp)} | ${row(s.corr)} | ${row(s.shadeCorr)} | ${row(s.shadeAmp)}`);
  }
}
