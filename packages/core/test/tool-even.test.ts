import { expect, test } from 'vitest';
import { isNeutral, neutralDoc, parseDoc, render, withLook, type Doc, type Image } from '../src/index.ts';
import { evenAt, prepareEven } from '../src/tools/even.ts';
import { expectGolden } from './tool-golden.ts';

// tool:even (BUILD.md §5.12.6): even out a photo that was lit unevenly.
const W = 160, H = 120, a = H / W;
const flat = (v = 120): Image => {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let p = 0; p < data.length; p += 4) { data[p] = v; data[p + 1] = v; data[p + 2] = v; data[p + 3] = 255; }
  return { data, width: W, height: H };
};
const base = neutralDoc({ width: W, height: H, space: 'srgb', sha256: 'c'.repeat(64) });
const doc = (prepare: object, rest: object = {}): Doc => parseDoc({ ...base, ...rest, prepare });
const at = (img: Image, i: number, j: number, c = 1) => img.data[(j * W + i) * 4 + c]!;
const same = (x: Image, y: Image) => Buffer.compare(Buffer.from(x.data), Buffer.from(y.data)) === 0;

test('off: at 0 the side it would come from changes nothing, and the document stays neutral', () => {
  const photo = flat();
  expect(isNeutral(doc({ tiltFrom: 200 }))).toBe(true);
  expect(same(render(photo, doc({ tiltFrom: 200 })), photo)).toBe(true);
  const lit = withLook(base, 'gallery');
  expect(same(render(photo, parseDoc({ ...lit, prepare: { tiltFrom: 10 } })), render(photo, lit))).toBe(true);
  expect(prepareEven(base.prepare, a)).toBeNull();
  expect(isNeutral(doc({ tilt: 0.1 }))).toBe(false);
});

test('t runs from -1 to 1 across the picture along the side; g is 1 at the centre', () => {
  for (const from of [0, 30, 90, 135, 270]) {
    const v = prepareEven(parseDoc({ ...base, prepare: { tilt: 0.2, tiltFrom: from } }).prepare, a)!;
    const ts = [[0, 0], [1, 0], [0, a], [1, a]].map(([x, y]) => (x! - v.cx) * v.kx + (y! - v.cy) * v.ky);
    expect(Math.max(...ts)).toBeCloseTo(1, 12); expect(Math.min(...ts)).toBeCloseTo(-1, 12);
    expect(evenAt(v, 0.5, a / 2)).toBe(1);
  }
});

test('a photo lit unevenly comes back even, within a level, with the opposite settings', () => {
  const photo = flat(), opts = { kappa: 1 }, tone = { highlightProtect: 0 };
  const uneven = render(photo, doc({ tilt: 0.3, tiltFrom: 30, corners: -0.25 }, { tone }), opts);
  expect(Math.abs(at(uneven, 150, 10) - at(uneven, 10, 110))).toBeGreaterThan(20); // the photo as taken
  const back = render(uneven, doc({ tilt: -0.3, tiltFrom: 30, corners: 0.25 }, { tone }), opts);
  for (let p = 0; p < back.data.length; p += 4) for (let c = 0; c < 3; c++) expect(Math.abs(back.data[p + c]! - 120)).toBeLessThanOrEqual(1);
});

test('each setting goes the way its label says', () => {
  const photo = flat(), r = (p: object) => render(photo, doc(p), { kappa: 1 });
  const right = r({ tilt: 0.3, tiltFrom: 0 });
  expect(at(right, 150, 60)).toBeGreaterThan(130); expect(at(right, 10, 60)).toBeLessThan(110);
  const top = r({ tilt: 0.3, tiltFrom: 90 });
  expect(at(top, 80, 5)).toBeGreaterThan(at(top, 80, 115) + 15);
  const corners = r({ corners: 0.3 });
  expect(at(corners, 2, 2)).toBeGreaterThan(at(corners, 80, 60) + 15);
  expect(at(r({ corners: -0.3 }), 2, 2)).toBeLessThan(110);
  const magenta = r({ tint: 0.5 }), green = r({ tint: -0.5 });
  expect(at(magenta, 80, 60, 0)).toBeGreaterThan(at(magenta, 80, 60, 1) + 5);
  expect(at(magenta, 80, 60, 2)).toBeGreaterThan(at(magenta, 80, 60, 1) + 5);
  expect(at(green, 80, 60, 1)).toBeGreaterThan(at(green, 80, 60, 0) + 5);
});

test('golden: gallery on an unevenly lit photo, evened', () => {
  const photo = flat(140);
  expectGolden('even', render(photo, parseDoc({ ...withLook(base, 'gallery'), prepare: { tilt: -0.2, tiltFrom: 200, corners: 0.15, tint: -0.3 } })));
});
