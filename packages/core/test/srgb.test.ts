import { expect, test } from 'vitest';
import { colour } from '../src/kelvin.ts';
import { decode, encode } from '../src/srgb.ts';

const continuous = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const encodeContinuous = (v: number) => Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));

test('srgb round trip of all 256 codes', () => {
  for (let c = 0; c < 256; c++) expect(encode(decode(c))).toBe(c);
});

test('srgb tables match the curve', () => {
  for (let c = 0; c < 256; c++) expect(decode(c)).toBeCloseTo(continuous(c / 255), 14);
  let seed = 7;
  for (let i = 0; i < 20000; i++) {
    seed = (seed * 16807) % 2147483647;
    const v = seed / 2147483647;
    expect(Math.abs(encode(v) - encodeContinuous(v))).toBe(0);
  }
  expect(encode(-1)).toBe(0);
  expect(encode(2)).toBe(255);
  expect(encode(NaN)).toBe(0);
});

test('light colour: 6500 K is exactly white, luma 1 everywhere, warm is red', () => {
  for (const s of ['srgb', 'display-p3'] as const) {
    expect(colour(6500, s)).toEqual([1, 1, 1]);
    for (let K = 1500; K <= 12000; K += 37) {
      const [r, g, b] = colour(K, s);
      expect(0.2126 * r + 0.7152 * g + 0.0722 * b).toBeCloseTo(1, 9);
    }
    const warm = colour(2700, s), cool = colour(9000, s);
    expect(warm[0]).toBeGreaterThan(warm[2]);
    expect(cool[2]).toBeGreaterThan(cool[0]);
  }
});
