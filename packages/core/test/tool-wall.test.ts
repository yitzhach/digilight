import { expect, test } from 'vitest';
import { defaultLight, neutralDoc, parseDoc, prepareLighting, render, renderWithWall, wallSize, withLook, type Doc, type Image } from '../src/index.ts';
import { crop } from '../src/resample.ts';
import { toPiece } from '../src/tools/wall.ts';
import { expectGolden } from './tool-golden.ts';

// tool:wall (BUILD.md §5.12.7): the piece on a wall, the light spilling past its edge, its shadow.
const W = 160, H = 120;
const flat = (v = 153): Image => {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let p = 0; p < data.length; p += 4) { data[p] = v; data[p + 1] = v; data[p + 2] = v; data[p + 3] = 255; }
  return { data, width: W, height: H };
};
const painted = (): Image => { // a photo with something in it
  const img = flat();
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const p = (j * W + i) * 4;
    img.data[p] = (i * 7 + j * 3) & 255; img.data[p + 1] = (i * j) & 255; img.data[p + 2] = 90 + ((i ^ j) & 63);
  }
  return img;
};
const base = neutralDoc({ width: W, height: H, space: 'srgb', sha256: 'e'.repeat(64) });
const withWall = (d: Doc, wall: object = {}): Doc => parseDoc({ ...d, wall: { on: true, ...wall } });
const same = (x: Image, y: Image) => x.width === y.width && x.height === y.height && Buffer.compare(Buffer.from(x.data), Buffer.from(y.data)) === 0;
const at = (img: Image, i: number, j: number, c = 1) => img.data[(j * img.width + i) * 4 + c]!;
/** A lamp from the left, low, aimed at the piece's middle. */
const fromLeft = (extra: object = {}, d: Doc = base): Doc =>
  parseDoc({ ...d, ambient: { level: 0.4 }, lights: [defaultLight({ id: 'k', pos: [-0.6, 0.5, 0.5], aim: [0.5, 0.5], intensity: 1, kelvin: 6500, ...extra })] });

test('off: the picture is the piece alone, whatever the other wall settings say', () => {
  const photo = painted(), lit = withLook(base, 'gallery');
  const off = parseDoc({ ...lit, wall: { margin: 0.6, tone: 0.2, warmth: 0.5, standoff: 0.08, shadow: 1 } });
  expect(same(renderWithWall(photo, off), render(photo, lit))).toBe(true);
  expect(wallSize(off, W, H)).toEqual({ width: W, height: H, margin: 0 });
  const sun = parseDoc({ ...lit, lights: [defaultLight({ id: 's', kind: 'sun' })] });
  expect(prepareLighting(sun, H / W, 1).suns).toEqual([]);
});

test('the piece\'s pixels are those of the render without the wall', () => {
  const photo = painted();
  const docs = [
    withLook(base, 'spotlight'),
    parseDoc({ ...withLook(base, 'gallery'), relief: { mode: 'estimated' }, finish: { vignette: 0.4, grain: 0.5, warmth: 0.3, glow: 0.5 } }),
    parseDoc({ ...base, lights: [defaultLight({ id: 's', kind: 'sun', azimuth: 200, elevation: 25 }), defaultLight({ id: 'p', pattern: 'window' })] }),
  ];
  for (const d of docs) {
    const piece = render(photo, d), whole = renderWithWall(photo, withWall(d, { margin: 0.2 }));
    const mp = 32;
    expect([whole.width, whole.height]).toEqual([W + 2 * mp, H + 2 * mp]);
    expect(same(crop(whole, mp, mp, W, H), piece)).toBe(true);
  }
});

test('the picture\'s size: a margin of round(margin W) each side, at the export\'s width too', () => {
  const photo = painted(), d = withWall(withLook(base, 'gallery'), { margin: 0.33 });
  expect(wallSize(d, 100, 75)).toEqual({ width: 166, height: 141, margin: 33 });
  const small = renderWithWall(photo, d, { width: 100 });
  expect([small.width, small.height]).toEqual([166, 141]);
  expect(same(crop(small, 33, 33, 100, 75), render(photo, d, { width: 100 }))).toBe(true);
});

test('a region is the same pixels as the whole picture there', () => {
  const photo = painted(), d = withWall(fromLeft({ pattern: 'blinds' }));
  const whole = renderWithWall(photo, d), { width: TW } = whole;
  for (const r of [{ x: 0, y: 0, width: TW, height: 30 }, { x: 20, y: 30, width: 150, height: 100 }, { x: 0, y: 150, width: 5, height: 5 }])
    expect(same(renderWithWall(photo, d, { region: r }), crop(whole, r.x, r.y, r.width, r.height)), JSON.stringify(r)).toBe(true);
  expect(() => renderWithWall(photo, d, { region: { x: 0, y: 0, width: TW + 1, height: 1 } })).toThrow(/region/);
});

test('a grey photo on a wall of its grey: the light runs on across the edge away from the shadow', () => {
  const photo = flat(153), d = withWall(fromLeft(), { tone: 0.6, standoff: 0.005 }); // 153 / 255 = 0.6
  const img = renderWithWall(photo, d), mp = 40;
  for (const j of [mp + 10, mp + 60, mp + 110]) expect(Math.abs(at(img, mp - 1, j) - at(img, mp, j)), `row ${j}`).toBeLessThanOrEqual(1); // the left edge
  const above = renderWithWall(photo, withWall(fromLeft({ pos: [0.5, -0.6, 0.5] }), { tone: 0.6, standoff: 0.005 }));
  for (const i of [mp + 1, mp + 40, mp + 80, mp + W - 1]) expect(Math.abs(at(above, i, mp - 1) - at(above, i, mp)), `column ${i}`).toBeLessThanOrEqual(1); // a lamp above: the top edge
  const noShadow = renderWithWall(photo, withWall(fromLeft(), { tone: 0.6, standoff: 0.005, shadow: 0 }));
  for (const j of [mp + 10, mp + 60]) expect(Math.abs(at(noShadow, mp + W, j) - at(noShadow, mp + W - 1, j))).toBeLessThanOrEqual(1); // the right edge too
});

/** How many wall pixels right of the piece, on its middle row, the shadow darkens by over 2 levels. */
const shadowWidth = (wall: object, light: object = {}) => {
  const photo = flat(153), mp = 40, j = mp + H / 2;
  const lit = renderWithWall(photo, withWall(fromLeft(light), { ...wall, shadow: 0 }));
  const dark = renderWithWall(photo, withWall(fromLeft(light), { ...wall, shadow: 0.8 }));
  let n = 0;
  for (let i = mp + W; i < mp + W + mp; i++) if (at(lit, i, j) - at(dark, i, j) > 2) n++;
  return { n, lit, dark };
};

test('the shadow lies on the side away from the lamp and widens with standoff and softness', () => {
  const { n, lit, dark } = shadowWidth({ standoff: 0.03 }), mp = 40, j = mp + H / 2;
  expect(at(lit, mp + W + 2, j) - at(dark, mp + W + 2, j)).toBeGreaterThan(20); // right of the piece: dark
  expect(at(lit, mp - 3, j)).toBe(at(dark, mp - 3, j)); // left of it, toward the lamp: untouched
  expect(n).toBeGreaterThan(2);
  expect(shadowWidth({ standoff: 0.08 }).n).toBeGreaterThan(n);
  expect(shadowWidth({ standoff: 0.03 }, { size: 0.4 }).n).toBeGreaterThan(n);
  expect(shadowWidth({ standoff: 0 }).n).toBeLessThanOrEqual(1);
});

test('Shadow softness: the edge fades further out, and the shadow stays as dark at the piece', () => {
  const photo = flat(153), mp = 40, j = mp + H / 2;
  const r = (soft: number, shadow = 0.8) => renderWithWall(photo, withWall(fromLeft(), { standoff: 0.03, shadow, soft }));
  const lit = r(0, 0), hard = r(0), soft = r(1);
  const reach = (img: Image) => { let n = 0; for (let i = mp + W; i < 2 * mp + W; i++) if (at(lit, i, j) - at(img, i, j) > 2) n++; return n; };
  expect(reach(soft)).toBeGreaterThan(reach(hard) + 8);
  expect(at(lit, mp + W, j) - at(soft, mp + W, j)).toBeGreaterThan(0.6 * (at(lit, mp + W, j) - at(hard, mp + W, j)));
});

test('a sun throws the shadow too, away from where it comes from', () => {
  const photo = flat(153), mp = 40, j = mp + H / 2;
  const sun = (shadow: number) => renderWithWall(photo, withWall(parseDoc({ ...base, ambient: { level: 0.4 },
    lights: [defaultLight({ id: 's', kind: 'sun', azimuth: 0, elevation: 30, intensity: 1, kelvin: 6500 })] }), { shadow, standoff: 0.05 }));
  const lit = sun(0), dark = sun(1); // from the right: the shadow is on the left
  expect(at(lit, mp - 2, j) - at(dark, mp - 2, j)).toBeGreaterThan(20);
  expect(at(lit, mp + W + 2, j)).toBe(at(dark, mp + W + 2, j));
});

test('each setting goes the way its label says', () => {
  const photo = flat(153), r = (wall: object) => renderWithWall(photo, withWall(fromLeft(), wall)), mp = 40;
  expect(at(r({ tone: 0.9 }), 5, 5)).toBeGreaterThan(at(r({ tone: 0.4 }), 5, 5) + 40);
  const warm = r({ warmth: 0.8 }), cool = r({ warmth: -0.8 });
  expect(at(warm, 5, 5, 0)).toBeGreaterThan(at(warm, 5, 5, 2) + 10);
  expect(at(cool, 5, 5, 2)).toBeGreaterThan(at(cool, 5, 5, 0) + 10);
  expect(at(r({ shadow: 1 }), mp + W + 1, mp + 60)).toBeLessThan(at(r({ shadow: 0.3 }), mp + W + 1, mp + 60));
  expect(r({ margin: 0.5 }).width).toBe(W + 160);
});

test('the distance to the piece\'s edge', () => {
  const a = 0.75;
  expect(toPiece(0.5, a / 2, a)).toBeCloseTo(-a / 2, 12);
  expect(toPiece(1.2, a / 2, a)).toBeCloseTo(0.2, 12);
  expect(toPiece(-0.3, -0.4, a)).toBeCloseTo(0.5, 12);
  expect(toPiece(0.5, a + 0.1, a)).toBeCloseTo(0.1, 12);
});

test('golden: spotlight on a painted photo, on a warm wall, with grain and a window pattern', () => {
  const lit = withLook(base, 'spotlight');
  const d = parseDoc({ ...lit, lights: [...lit.lights, defaultLight({ id: 'w', pos: [1.4, -0.3, 0.6], intensity: 0.5, pattern: 'window' })],
    finish: { grain: 0.4, vignette: 0.3 }, wall: { on: true, warmth: 0.3, standoff: 0.04 } });
  expectGolden('wall', renderWithWall(painted(), d));
});
