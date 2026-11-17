import { expect, test } from 'vitest';
import { fitWidth } from '../src/io/fit.ts';

test('the export takes the largest width whose picture the browser can hold', () => {
  const size = (w: number) => ({ width: Math.round(w * 1.5), height: Math.round(w * 2) }); // a picture with its wall
  const limit = (w: number, h: number) => w * h <= 16_777_216;
  expect(fitWidth(2000, size, limit)).toBe(2000);
  const w = fitWidth(4032, size, limit), s = size(w);
  expect(w).toBeLessThan(4032);
  expect(s.width * s.height).toBeLessThanOrEqual(16_777_216);
  expect(limit(...Object.values(size(Math.ceil(w / 0.9))) as [number, number])).toBe(false);
});
