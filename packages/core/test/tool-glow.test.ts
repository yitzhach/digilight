import { expect, test } from 'vitest';
import { glowKey, glowMaps, guardKappa, neutralDoc, parseDoc, render, withLook, type Doc, type Image } from '../src/index.ts';
import { GLOW_SIZE, HALATION } from '../src/tools/glow.ts';
import { loadFixture } from '../scripts/jpeg.ts';
import { expectGolden } from './tool-golden.ts';

// tool:glow (BUILD.md §5.12.3): strongly lit parts spill a soft light around them.
const W = 320, H = 240;
/** A dark grey picture with a white square in the middle (x 0.4 to 0.6, the same height). */
function patch(): Image {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const p = (j * W + i) * 4, inside = i >= 128 && i < 192 && j >= 88 && j < 152;
    data[p] = data[p + 1] = data[p + 2] = inside ? 255 : 60; data[p + 3] = 255;
  }
  return { data, width: W, height: H };
}
const docOf = (img: Image, finish: object = {}, rest: object = {}): Doc =>
  parseDoc({ ...neutralDoc({ width: img.width, height: img.height, space: 'srgb', sha256: 'f'.repeat(64) }), ...rest, finish });
const at = (img: Image, i: number, j: number, c = 1) => img.data[(j * img.width + i) * 4 + c]!;
const same = (a: Image, b: Image) => Buffer.compare(Buffer.from(a.data), Buffer.from(b.data)) === 0;
const MID = 120; // the square's middle row

test('off: at glow 0 its spread and warmth change nothing, and a neutral document is still the photo', () => {
  const photo = patch();
  expect(same(render(photo, docOf(photo, { glowSpread: 1, glowWarmth: 1 })), photo)).toBe(true);
  const lit = withLook(docOf(photo), 'gallery');
  expect(same(render(photo, parseDoc({ ...lit, finish: { glowSpread: 0.9, glowWarmth: 0.5 } })), render(photo, lit))).toBe(true);
});

test('glow adds light round a bright part, most beside it, and never takes light away', () => {
  const photo = patch(), off = render(photo, docOf(photo)), on = render(photo, docOf(photo, { glow: 0.8 })), less = render(photo, docOf(photo, { glow: 0.3 }));
  const beside = at(on, 196, MID) - at(off, 196, MID), away = at(on, 250, MID) - at(off, 250, MID), corner = at(on, 4, 4) - at(off, 4, 4);
  expect(beside).toBeGreaterThan(20);
  expect(away).toBeLessThan(beside);
  expect(corner).toBeLessThan(away + 1);
  expect(at(less, 196, MID)).toBeGreaterThan(at(off, 196, MID) + 5);
  expect(at(less, 196, MID)).toBeLessThan(at(on, 196, MID));
  for (let p = 0; p < on.data.length; p++) expect(on.data[p]! >= off.data[p]!).toBe(true);
  expect(at(on, 160, MID)).toBe(255); // the square itself stays white
});

test('spread carries the glow further; warmth turns it red-orange', () => {
  const photo = patch(), r = (f: object) => render(photo, docOf(photo, { glow: 0.8, ...f }));
  const tight = r({ glowSpread: 0 }), wide = r({ glowSpread: 1 }), off = render(photo, docOf(photo));
  const gain = (img: Image, i: number) => at(img, i, MID) - at(off, i, MID);
  expect(gain(wide, 210)).toBeGreaterThan(gain(tight, 210) + 10); // 0.06 picture widths from the square
  expect(gain(tight, 210)).toBeLessThan(0.1 * gain(tight, 193));  // a tight glow has gone by then
  expect(gain(wide, 210)).toBeGreaterThan(0.2 * gain(wide, 193)); // a wide one has not
  expect(gain(wide, 300)).toBe(0);                                // and a third of the picture away, nothing
  const plain = r({}), warm = r({ glowWarmth: 1 });
  expect(at(plain, 196, MID, 0)).toBe(at(plain, 196, MID, 2)); // a white part's glow is white
  expect(at(warm, 196, MID, 0) - at(warm, 196, MID, 2)).toBeGreaterThan(20);
  expect(0.2126 * HALATION[0] + 0.7152 * HALATION[1] + 0.0722 * HALATION[2]).toBeCloseTo(1, 12);
});

test('it is the parts that stand out that glow: an even picture hardly changes, and Brightness does not change which', () => {
  const even: Image = { data: new Uint8ClampedArray(W * H * 4).fill(180), width: W, height: H };
  const out = render(even, docOf(even, { glow: 1 }));
  expect(Math.abs(at(out, 160, 120) - 180)).toBeLessThan(6);
  const photo = patch(), a = glowMaps(photo, docOf(photo, { glow: 1 }), 1), b = glowMaps(photo, docOf(photo, { glow: 1, exposure: -1 }), 1);
  const i = (MID * a.width / W | 0) * a.width * 3 + (a.width / 2 | 0) * 3; // about the middle of the map
  expect(b.near[i]! / a.near[i]!).toBeCloseTo(0.5, 3); // half the light, the same parts
});

test('a region has exactly the pixels of the whole render, and a smaller picture has the same glow', () => {
  const photo = patch(), d = parseDoc({ ...withLook(docOf(photo), 'spotlight'), finish: { glow: 0.7, glowWarmth: 0.4 } });
  const whole = render(photo, d), region = { x: 100, y: 70, width: 90, height: 60 }, part = render(photo, d, { region });
  for (let j = 0; j < region.height; j++) {
    const a = ((region.y + j) * W + region.x) * 4;
    expect(Array.from(part.data.subarray(j * region.width * 4, (j + 1) * region.width * 4))).toEqual(Array.from(whole.data.subarray(a, a + region.width * 4)));
  }
  const half = render(photo, d, { width: W / 2 });
  // (a pixel of the half-size picture sits half a pixel aside, so allow the glow's slope)
  for (const [i, j] of [[200, MID], [250, MID], [60, 60], [160, 200]] as const) expect(Math.abs(at(half, i >> 1, j >> 1) - at(whole, i, j)), `${i}, ${j}`).toBeLessThanOrEqual(4);
});

test('the maps: long side 256, kept per photo and light, not remade for Glow\'s own settings; the guard does not count Glow', () => {
  const photo = loadFixture('door-flat-crop.jpg'), base = neutralDoc({ width: photo.width, height: photo.height, space: 'srgb', sha256: photo.sha256 });
  const lit = withLook(base, 'spotlight'), d = parseDoc({ ...lit, finish: { glow: 0.5 } }), k = guardKappa(photo, d);
  const m = glowMaps(photo, d, k);
  expect(Math.max(m.width, m.height)).toBe(GLOW_SIZE);
  expect(m.near.length).toBe(m.width * m.height * 3);
  expect(glowMaps(photo, parseDoc({ ...lit, finish: { glow: 0.9, glowSpread: 1, glowWarmth: 1 } }), k)).toBe(m);
  expect(glowKey(d, k)).not.toBe(glowKey(withLook(d, 'gallery'), k));
  expect(glowMaps(photo, withLook(d, 'gallery'), k)).not.toBe(m);
  expect(guardKappa(photo, d)).toBe(guardKappa(photo, lit));
  expect(same(render(photo, d, { width: 320, glow: m }), render(photo, d, { width: 320 }))).toBe(true); // given or made here: the same
});

test('golden: glow on', () => {
  const photo = patch();
  for (let j = 0; j < H; j++) for (let i = 0; i < 96; i++) { const p = (j * W + i) * 4; photo.data[p] = 40 + i * 2; photo.data[p + 1] = 30 + (j * 200) / H; photo.data[p + 2] = 70; }
  expectGolden('glow', render(photo, parseDoc({ ...withLook(docOf(photo), 'spotlight'), finish: { glow: 0.7, glowSpread: 0.6, glowWarmth: 0.3, contrast: 0.2 } })));
});
