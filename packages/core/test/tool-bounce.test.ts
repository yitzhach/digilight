import { expect, test } from 'vitest';
import { buildHorizon, horizonInput, neutralDoc, parseDoc, render, slopes, type Doc, type Image, type ReliefMaps } from '../src/index.ts';
import { decode } from '../src/srgb.ts';
import { openness, roomLight, wallLight, wallShare } from '../src/tools/bounce.ts';
import { expectGolden } from './tool-golden.ts';

// tool:bounce, tool:roomside (BUILD.md §5.12.1, §5.12.2): softer shadows.
const W = 240, H = 180;
const ss = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Unit heights: a groove down the picture at x = 0.4 (floor 0.07 wide, walls 0.035) and a mound at (0.8, 0.375). */
const height = (x: number, y: number) => -(1 - ss(0.035, 0.07, Math.abs(x - 0.4))) + 0.8 * Math.exp(-((x - 0.8) ** 2 + (y - 0.375) ** 2) / (2 * 0.05 ** 2));
const maps: ReliefMaps = (() => {
  const h = new Float32Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) h[j * W + i] = height((i + 0.5) / W, (j + 0.5) / W);
  return { width: W, height: H, h, ...slopes(h, W, H), ...buildHorizon(horizonInput(h, W, H, false)) };
})();
const flat = (r: number, g = r, b = r): Image => {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let p = 0; p < data.length; p += 4) { data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255; }
  return { data, width: W, height: H };
};
/** A low sun from the left over a dim room, on relief 0.02 picture widths deep. */
const lit = (relief: Partial<Doc['relief']> = {}, rest: object = {}): Doc => parseDoc({
  ...neutralDoc({ width: W, height: H, space: 'srgb', sha256: 'e'.repeat(64) }),
  ambient: { level: 0.3 },
  lights: [{ id: 'sun', kind: 'sun', azimuth: 180, elevation: 15, intensity: 1, kelvin: 6500, size: 0.01 }],
  relief: { mode: 'measured', depth: 0.02, shadows: 1, ao: 0.5, ...relief }, ...rest,
});
const draw = (photo: Image, d: Doc) => render(photo, d, { relief: maps, kappa: 1 });
/** Mean of channel c over picture x in [x0, x1), rows away from the top and bottom edges. */
function mean(img: Image, x0: number, x1: number, c = 1, y0 = 0.15, y1 = 0.6): number {
  let s = 0, n = 0;
  for (let j = Math.round(y0 * W); j < Math.round(y1 * W); j++) for (let i = Math.round(x0 * W); i < Math.round(x1 * W); i++) { s += img.data[(j * W + i) * 4 + c]!; n++; }
  return s / n;
}
const FLOOR = [0.385, 0.415] as const, OPEN = [0.05, 0.22] as const;

test('the helpers: a wall\'s share of the sky, the light it takes, a hollow\'s openness', () => {
  expect(wallShare(0)).toBe(0);
  expect(wallShare(1)).toBeCloseTo(0.5 * (1 - Math.SQRT1_2), 12);
  expect(wallShare(1e6)).toBeCloseTo(0.5, 5);
  expect(wallLight(0, 1, 0)).toBeCloseTo(Math.SQRT1_2, 12); // light from the front: a tilted wall takes less
  expect(wallLight(0.985, 0.17, 0.01)).toBe(4);              // raking: much more, capped as `rel` is
  expect(openness(1, 0.8, 1)).toBe(1);       // open ground: nothing to add
  expect(openness(0.6, 0, 1)).toBe(0.6);     // black paint bounces nothing
  expect(openness(0.6, 0.8, 0)).toBe(0.6);   // bounce off
  expect(openness(0.6, 0.8, 1)).toBeCloseTo(0.6 / (1 - 0.8 * 0.4), 12);
  expect(openness(0.6, 0.8, 1)).toBeLessThan(1);
  expect(roomLight(0, 0, 1, [0.5, 0, 0.6])).toBe(1); // flat ground: as before
});

test('off: with bounce and room side at 0 the room light\'s side changes nothing', () => {
  const photo = flat(200), a = draw(photo, lit()), b = draw(photo, lit({ roomFrom: 200 }));
  expect(Buffer.compare(Buffer.from(a.data), Buffer.from(b.data))).toBe(0);
});

test('bounce light lifts the shadowed floor of a hollow and leaves open ground as it was', () => {
  const photo = flat(200), off = draw(photo, lit()), on = draw(photo, lit({ bounce: 1 })), half = draw(photo, lit({ bounce: 0.5 }));
  const sunlit = mean(off, ...OPEN), floor = mean(off, ...FLOOR);
  expect(floor).toBeLessThan(sunlit - 40); // the floor is in the left wall's shadow
  expect(mean(on, ...FLOOR)).toBeGreaterThan(floor + 5);
  expect(mean(half, ...FLOOR)).toBeGreaterThan(floor + 2);
  expect(mean(half, ...FLOOR)).toBeLessThan(mean(on, ...FLOOR));
  expect(mean(on, ...FLOOR)).toBeLessThan(sunlit); // a bounce never outshines the light it came from
  for (let j = 0; j < H; j++) for (let i = Math.round(OPEN[0] * W); i < Math.round(OPEN[1] * W); i++) {
    const p = (j * W + i) * 4;
    expect(on.data[p + 1], `open ground at ${i}, ${j}`).toBe(off.data[p + 1]);
  }
});

test('pale paint bounces more than dark paint, and the bounce takes the paint\'s colour', () => {
  const lift = (photo: Image, c = 1) => mean(draw(photo, lit({ bounce: 1 })), ...FLOOR, c) - mean(draw(photo, lit()), ...FLOOR, c);
  expect(lift(flat(200))).toBeGreaterThan(5);
  expect(lift(flat(50))).toBeLessThan(1);
  const red = flat(200, 120, 80), off = draw(red, lit()), on = draw(red, lit({ bounce: 1 }));
  const ratio = (img: Image) => decode(Math.round(mean(img, ...FLOOR, 0))) / decode(Math.round(mean(img, ...FLOOR, 2)));
  expect(ratio(on)).toBeGreaterThan(ratio(off) * 1.05); // redder in the hollow, as light off red paint is
});

test('room light from one side brightens slopes that face it, darkens those that turn away, leaves flat ground', () => {
  const photo = flat(150), room = (r: Partial<Doc['relief']>) => draw(photo, lit({ ao: 0, ...r }, { ambient: { level: 1 }, lights: [] }));
  const even = room({}), left = room({ roomSide: 1, roomFrom: 180 }), right = room({ roomSide: 1, roomFrom: 0 }), some = room({ roomSide: 0.5, roomFrom: 180 });
  const west = [0.73, 0.77] as const, east = [0.83, 0.87] as const, rows = [1, 0.33, 0.42] as const; // the mound's two flanks
  expect(mean(even, ...west, ...rows)).toBe(150);
  expect(mean(left, ...west, ...rows)).toBeGreaterThan(153);
  expect(mean(left, ...east, ...rows)).toBeLessThan(147);
  expect(mean(right, ...west, ...rows)).toBeLessThan(147);
  expect(mean(right, ...east, ...rows)).toBeGreaterThan(153);
  expect(mean(some, ...west, ...rows)).toBeGreaterThan(151);
  expect(mean(some, ...west, ...rows)).toBeLessThan(mean(left, ...west, ...rows));
  expect(mean(left, ...OPEN)).toBe(150);
});

test('golden: bounce and room side on', () => {
  const photo = flat(0);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const p = (j * W + i) * 4; photo.data[p] = 60 + (i * 190) / W; photo.data[p + 1] = 220 - (j * 150) / H; photo.data[p + 2] = (i + j) % 32 < 16 ? 200 : 90; }
  expectGolden('bounce-roomside', draw(photo, lit({ bounce: 0.8, roomSide: 0.6, roomFrom: 120 })));
});
