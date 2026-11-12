// box.ts — v1's box blur and percentiles (src/lampphotos.js), which the measured-relief port
// (measure.ts, align.ts, lineup.ts) is built on. Kept apart from blur.ts: these round the radius
// and run `passes` times, as v1 did, so the port gives v1's numbers.

/** Box blur of radius round(r), `passes` times (3 is close to a Gaussian of sigma about r),
 *  edges clamped. Always a new array. */
export function boxBlur(src: ArrayLike<number>, w: number, h: number, r: number, passes = 3): Float32Array {
  r = Math.max(0, Math.round(r));
  const a = Float32Array.from(src);
  if (r === 0) return a;
  const t = new Float32Array(w * h), n = 2 * r + 1, col = new Float64Array(w);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      const o = y * w;
      let s = 0;
      for (let k = -r; k <= r; k++) s += a[o + Math.min(w - 1, Math.max(0, k))]!;
      for (let x = 0; x < w; x++) {
        t[o + x] = s / n;
        s += a[o + Math.min(w - 1, x + r + 1)]! - a[o + Math.max(0, x - r)]!;
      }
    }
    // Down, a whole row at a time (the same sums as v1's column walk, in the same order).
    col.fill(0);
    for (let k = -r; k <= r; k++) { const o = Math.min(h - 1, Math.max(0, k)) * w; for (let x = 0; x < w; x++) col[x]! += t[o + x]!; }
    for (let y = 0; y < h; y++) {
      const o = y * w, oa = Math.min(h - 1, y + r + 1) * w, ob = Math.max(0, y - r) * w;
      for (let x = 0; x < w; x++) { a[o + x] = col[x]! / n; col[x]! += t[oa + x]! - t[ob + x]!; }
    }
  }
  return a;
}

/** Percentiles (0 to 1) of the values where `mask` (optional) is set, from a sample of at most
 *  about 200,000. */
export function percentiles(a: ArrayLike<number>, ps: number[], mask?: ArrayLike<number> | null): number[] {
  const step = Math.max(1, Math.floor(a.length / 200000)), v = new Float32Array(Math.ceil(a.length / step));
  let k = 0;
  for (let i = 0; i < a.length; i += step) if (!mask || mask[i]) v[k++] = a[i]!;
  if (!k) return ps.map(() => 0);
  const s = v.subarray(0, k).sort();
  return ps.map((p) => s[Math.min(k - 1, Math.max(0, Math.floor(p * (k - 1))))]!);
}

/** Subtracts the mean, in place. */
export function removeMean(a: Float32Array): void {
  let m = 0;
  for (let i = 0; i < a.length; i++) m += a[i]!;
  m /= a.length;
  for (let i = 0; i < a.length; i++) a[i]! -= m;
}
