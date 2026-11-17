import { expect, test } from 'vitest';
import { neutralDoc, parseDoc, render, withLook, type Doc, type Image } from '../src/index.ts';
import { filtered, hue } from '../src/tools/gel.ts';
import { expectGolden } from './tool-golden.ts';

// tool:gel (BUILD.md §5.12.4): a colour filter over a light.
const W = 160, H = 120;
/** A grey ramp, left dark to right pale, with a little colour so every channel is tested. */
function ramp(): Image {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const p = (j * W + i) * 4, v = 40 + Math.round((i / (W - 1)) * 170);
    data[p] = v; data[p + 1] = Math.max(0, v - 10); data[p + 2] = Math.min(255, v + 10); data[p + 3] = 255;
  }
  return { data, width: W, height: H };
}
const photo = ramp();
const base = neutralDoc({ width: W, height: H, space: 'srgb', sha256: 'a'.repeat(64) });
/** Gallery with the lamp's filter set; the guard held at 1 so only the filter moves the light. */
const lit = (gel: object = {}): Doc => { const d = withLook(base, 'gallery'); return parseDoc({ ...d, lights: d.lights.map((l) => ({ ...l, ...gel })) }); };
const draw = (d: Doc) => render(photo, d, { kappa: 1 });
const same = (a: Image, b: Image) => Buffer.compare(Buffer.from(a.data), Buffer.from(b.data)) === 0;
const mean = (img: Image, c: number) => { let s = 0; for (let p = c; p < img.data.length; p += 4) s += img.data[p]!; return s / (img.width * img.height); };

test('hue: the six named colours', () => {
  expect(hue(0)).toEqual([1, 0, 0]);
  expect(hue(60)).toEqual([1, 1, 0]);
  expect(hue(120)).toEqual([0, 1, 0]);
  expect(hue(180)).toEqual([0, 1, 1]);
  expect(hue(240)).toEqual([0, 0, 1]);
  expect(hue(300)).toEqual([1, 0, 1]);
  expect(hue(360)).toEqual([1, 0, 0]);
  const c: [number, number, number] = [0.9, 0.8, 0.7];
  expect(filtered(c, 0, 200)).toBe(c);              // off: the very same colour
  expect(filtered(c, 1, 120)).toEqual([0, 0.8, 0]); // full: only what the filter lets through
});

test('off: at gel 0 the filter colour changes nothing', () => {
  expect(same(draw(lit({ gelHue: 250 })), draw(lit()))).toBe(true);
  expect(same(render(photo, parseDoc({ ...base, lights: [{ id: 'a', gelHue: 90 }] })), render(photo, parseDoc({ ...base, lights: [{ id: 'a' }] })))).toBe(true);
});

test('a red filter lowers green and blue, never raises red, and more filter lowers them more', () => {
  const off = draw(lit()), half = draw(lit({ gel: 0.5, gelHue: 0 })), full = draw(lit({ gel: 1, gelHue: 0 }));
  for (const c of [1, 2]) {
    expect(mean(half, c)).toBeLessThan(mean(off, c) - 2);
    expect(mean(full, c)).toBeLessThan(mean(half, c) - 2);
  }
  for (let p = 0; p < off.data.length; p += 4) { expect(half.data[p]!).toBeLessThanOrEqual(off.data[p]!); expect(full.data[p]!).toBeLessThanOrEqual(half.data[p]!); }
  // the light now reads red: red over green rises where the lamp falls
  expect(mean(full, 0) / mean(full, 1)).toBeGreaterThan(mean(off, 0) / mean(off, 1) + 0.05);
});

test('a blue filter turns the light blue; the filter only dims, so the picture never brightens', () => {
  const off = draw(lit()), blue = draw(lit({ gel: 0.8, gelHue: 240 }));
  expect(mean(blue, 2) / mean(blue, 0)).toBeGreaterThan(mean(off, 2) / mean(off, 0) + 0.05);
  expect(mean(blue, 0) + mean(blue, 1) + mean(blue, 2)).toBeLessThan(mean(off, 0) + mean(off, 1) + mean(off, 2));
});

test('golden: gallery with an amber filter beside a cyan sun', () => {
  const d = withLook(base, 'gallery');
  const doc = parseDoc({ ...d, lights: [{ ...d.lights[0]!, gel: 0.7, gelHue: 35 }, { id: 'b', kind: 'sun', intensity: 0.3, gel: 0.5, gelHue: 190 }] });
  expectGolden('gel', render(photo, doc));
});
