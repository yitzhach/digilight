// dmath.ts — deterministic maths (BUILD.md §5.10).
//
// Built from + - * / and Math.sqrt only, which IEEE 754 rounds the same way on every machine,
// so a document gives the same bits everywhere. Range reduction plus short polynomials;
// relative error under 1e-9 (tested against Math.*).

export const PI = 3.141592653589793;
export const DEG = PI / 180;
const PIO2_HI = 1.5707963267341256; // pi/2 split in two (Cody-Waite)
const PIO2_LO = 6.077100506506192e-11;
const LN2 = 0.6931471805599453;
const LN2_HI = 0.6931471803691238;
const LN2_LO = 1.9082149292705877e-10;
const SQRT2 = 1.4142135623730951;

// sin and cos on [-pi/4, pi/4] (Taylor; the last term left out is under 1e-19).
function sinPoly(r: number): number {
  const z = r * r;
  return r * (1 + z * (-1 / 6 + z * (1 / 120 + z * (-1 / 5040 + z * (1 / 362880 + z * (-1 / 39916800
    + z * (1 / 6227020800 + z * (-1 / 1307674368000 + z * (1 / 355687428096000)))))))));
}
function cosPoly(r: number): number {
  const z = r * r;
  return 1 + z * (-1 / 2 + z * (1 / 24 + z * (-1 / 720 + z * (1 / 40320 + z * (-1 / 3628800
    + z * (1 / 479001600 + z * (-1 / 87178291200 + z * (1 / 20922789888000))))))));
}

/** x = k * pi/2 + r, |r| <= pi/4; returns [k mod 4, r]. */
function reduce(x: number): [number, number] {
  const k = Math.round(x / PIO2_HI);
  const r = x - k * PIO2_HI - k * PIO2_LO;
  return [((k % 4) + 4) % 4, r];
}

export function dsin(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  const [q, r] = reduce(x);
  return q === 0 ? sinPoly(r) : q === 1 ? cosPoly(r) : q === 2 ? -sinPoly(r) : -cosPoly(r);
}

export function dcos(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  const [q, r] = reduce(x);
  return q === 0 ? cosPoly(r) : q === 1 ? -sinPoly(r) : q === 2 ? -cosPoly(r) : sinPoly(r);
}

/** atan on [0, 1]. */
function atanUnit(t: number): number {
  let base = 0;
  if (t > 0.41421356237309503) { t = (t - 1) / (t + 1); base = PI / 4; } // tan(pi/8)
  // atan(t) = 2 atan(t / (1 + sqrt(1 + t^2))): |u| <= 0.199
  const u = t / (1 + Math.sqrt(1 + t * t));
  const z = u * u;
  let s = 0;
  for (let n = 12; n >= 0; n--) s = (n % 2 === 0 ? 1 : -1) / (2 * n + 1) + z * s;
  return base + 2 * u * s;
}

export function datan2(y: number, x: number): number {
  if (Number.isNaN(x) || Number.isNaN(y)) return NaN;
  const ax = Math.abs(x), ay = Math.abs(y);
  if (ax === 0 && ay === 0) return x < 0 || Object.is(x, -0) ? (Object.is(y, -0) || y < 0 ? -PI : PI) : y;
  let a: number;
  if (ay <= ax) a = atanUnit(ay / ax);
  else a = PI / 2 - atanUnit(ax / ay);
  if (x < 0) a = PI - a;
  return y < 0 ? -a : a;
}

/** 2^k exactly, for integer k. */
function pow2i(k: number): number {
  let r = 1, b = k < 0 ? 0.5 : 2, n = Math.abs(k);
  while (n > 0) { if (n & 1) r *= b; b *= b; n >>>= 1; }
  return r;
}
function scale2(y: number, k: number): number {
  const h = Math.floor(k / 2);
  return y * pow2i(h) * pow2i(k - h);
}

/** e^r for |r| <= 0.35 (Taylor; the last term left out is under 1e-18). */
function expSmall(r: number): number {
  let s = 1;
  for (let n = 14; n >= 1; n--) s = 1 + (r / n) * s;
  return s;
}

export function dexp(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x > 709.782712893384) return Infinity;
  if (x < -745.2) return 0;
  const k = Math.round(x / LN2);
  const r = x - k * LN2_HI - k * LN2_LO;
  return scale2(expSmall(r), k);
}

export function dexp2(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x >= 1024) return Infinity;
  if (x < -1075) return 0;
  const k = Math.round(x);
  return scale2(expSmall((x - k) * LN2), k);
}

const view = new DataView(new ArrayBuffer(8));

export function dln(x: number): number {
  if (Number.isNaN(x) || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  let e = 0;
  if (x < 2.2250738585072014e-308) { x *= 18014398509481984; e = -54; } // subnormal: times 2^54
  view.setFloat64(0, x);
  const hi = view.getUint32(0);
  e += ((hi >>> 20) & 0x7ff) - 1023;
  view.setUint32(0, (hi & 0x800fffff) | 0x3ff00000);
  let m = view.getFloat64(0); // [1, 2)
  if (m > SQRT2) { m /= 2; e += 1; }
  const s = (m - 1) / (m + 1), z = s * s; // |s| <= 0.1716
  let t = 0;
  for (let n = 12; n >= 0; n--) t = 1 / (2 * n + 1) + z * t;
  return e * LN2_HI + (e * LN2_LO + 2 * s * t);
}

export function dpow(x: number, y: number): number {
  if (y === 0) return 1;
  if (Number.isNaN(x) || Number.isNaN(y)) return NaN;
  if (x === 1) return 1;
  if (x === 0) return y > 0 ? 0 : Infinity;
  if (x < 0) {
    if (!Number.isInteger(y)) return NaN;
    const v = dexp(y * dln(-x));
    return Math.abs(y) % 2 === 1 ? -v : v;
  }
  return dexp(y * dln(x));
}
