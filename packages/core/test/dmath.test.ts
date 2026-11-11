import { expect, test } from 'vitest';
import { datan2, dcos, dexp, dexp2, dln, dpow, dsin } from '../src/dmath.ts';

let seed = 12345;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
/** Largest relative error of d against m over n samples from gen. */
function worst(n: number, gen: () => number[], d: (...a: number[]) => number, m: (...a: number[]) => number): number {
  let w = 0;
  for (let i = 0; i < n; i++) {
    const a = gen(), want = m(...a), got = d(...a);
    w = Math.max(w, Math.abs(got - want) / Math.max(Math.abs(want), 1e-300));
  }
  return w;
}
const N = 20000;
const R = (s: number) => () => [(rnd() - 0.5) * s];

test('dsin, dcos against Math (relative error under 1e-9)', () => {
  expect(worst(N, R(50), dsin, Math.sin)).toBeLessThan(1e-9);
  expect(worst(N, R(50), dcos, Math.cos)).toBeLessThan(1e-9);
  expect(dsin(0)).toBe(0);
  expect(dcos(0)).toBe(1);
});

test('datan2 against Math, every quadrant and axis', () => {
  expect(worst(N, () => [(rnd() - 0.5) * 20, (rnd() - 0.5) * 20], datan2, Math.atan2)).toBeLessThan(1e-9);
  for (const [y, x] of [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, -1], [1e-9, 1], [1, 1e-9], [0, 0]] as [number, number][])
    expect(Math.abs(datan2(y, x) - Math.atan2(y, x))).toBeLessThan(1e-15);
});

test('dexp, dexp2 against Math', () => {
  expect(worst(N, R(1400), dexp, Math.exp)).toBeLessThan(1e-9);
  expect(worst(N, R(2000), dexp2, (x) => 2 ** x)).toBeLessThan(1e-9);
  expect(dexp(0)).toBe(1);
  for (let k = -20; k <= 20; k++) expect(dexp2(k)).toBe(2 ** k);
});

test('dln against Math, from subnormal to huge', () => {
  expect(worst(N, () => [rnd() * 10], dln, Math.log)).toBeLessThan(1e-9);
  expect(worst(N, () => [10 ** ((rnd() - 0.5) * 600)], dln, Math.log)).toBeLessThan(1e-9);
  expect(Math.abs(dln(5e-324) - Math.log(5e-324)) / 744).toBeLessThan(1e-9);
  expect(dln(1)).toBe(0);
});

test('dpow against Math', () => {
  expect(worst(N, () => [rnd() * 4, (rnd() - 0.5) * 20], dpow, Math.pow)).toBeLessThan(1e-9);
  expect(dpow(2, 5)).toBeCloseTo(32, 12);
  expect(dpow(-2, 3)).toBeCloseTo(-8, 12);
  expect(dpow(0, 2)).toBe(0);
  expect(dpow(7, 0)).toBe(1);
});
