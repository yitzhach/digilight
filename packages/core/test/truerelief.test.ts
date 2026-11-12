// True Relief (BUILD.md Phase 5): the port of v1's measurement and line-up, the light's axis,
// the stored height and the commands. The full gate on the real photos is bench/relief-gate.ts.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, test } from 'vitest';
import {
  applyH, axisDistance, createCommands, flipped, lightAxis, lineUp, measuredRelief, measureRelief, neutralDoc, packHeight, parseDoc, quantise, render, resampleRegion,
  unpackHeight, warpPhoto, type Image,
} from '../src/index.ts';
import { loadFixture } from '../scripts/jpeg.ts';

const small = (img: Image, W: number): Image => resampleRegion(img, W, Math.round((img.height * W) / img.width), 0, 0, W, Math.round((img.height * W) / img.width));
function corr(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let sa = 0, sb = 0;
  const n = a.length;
  for (let i = 0; i < n; i++) { sa += a[i]!; sb += b[i]!; }
  sa /= n; sb /= n;
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < n; i++) { const x = a[i]! - sa, y = b[i]! - sb; ab += x * y; aa += x * x; bb += y * y; }
  return ab / Math.sqrt(aa * bb);
}
const door = small(loadFixture('door-flat-crop.jpg'), 320), doorSun = small(loadFixture('door-sun-lined.jpg'), 320);
const sunShot = (az: number, el = 30) => [{ rgba: doorSun.data, light: { sun: { azimuthDeg: az, elevationDeg: el } } }];
const measured = measureRelief({ even: door.data, shots: sunShot(135), w: door.width, h: door.height });

test('the port gives v1\'s height on the door pair (correlation 0.99 or better)', () => {
  // v1 src/lampphotos.js run in Node on these same 320 px photos, sun 135 / 30; 1/2000 px steps.
  const raw = gunzipSync(readFileSync(new URL('v1-door-320.i16.gz', import.meta.url)));
  const v1 = new Int16Array(raw.buffer, raw.byteOffset, raw.length / 2);
  expect(v1.length).toBe(measured.height.length);
  expect(corr(measured.height, v1)).toBeGreaterThan(0.999);
  let worst = 0;
  for (let i = 0; i < v1.length; i++) worst = Math.max(worst, Math.abs(measured.height[i]! - v1[i]! / 2000));
  expect(worst).toBeLessThan(0.002); // pixels
});

test('light from the other end gives the same height turned over', () => {
  const other = measureRelief({ even: door.data, shots: sunShot(315), w: door.width, h: door.height });
  let worst = 0;
  for (let i = 0; i < other.height.length; i++) worst = Math.max(worst, Math.abs(other.height[i]! + measured.height[i]!));
  expect(worst).toBeLessThan(1e-3);
  expect(other.depth).toBeCloseTo(measured.depth, 5);
});

test('a known surface under a known sun is measured back', () => {
  // Bumps and a ridge on textured paint, lit by a sun from 150 degrees, 25 up, plus 10% sky.
  const W = 240, Hh = 200, n = W * Hh, h = new Float32Array(n), flat = new Uint8ClampedArray(n * 4), lit = new Uint8ClampedArray(n * 4);
  const bump = (x: number, y: number, cx: number, cy: number, s: number, a: number) => a * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * s * s));
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++)
    h[y * W + x] = bump(x, y, 60, 60, 7, 2) + bump(x, y, 150, 80, 5, -1.5) + bump(x, y, 110, 140, 9, 2.5) + 1.2 * Math.exp(-((x - 190) ** 2) / 32) + 0.4 * Math.sin(x * 0.9) * Math.sin(y * 0.7);
  const az = (150 * Math.PI) / 180, el = (25 * Math.PI) / 180, ux = Math.cos(az) / Math.tan(el), uy = -Math.sin(az) / Math.tan(el);
  const enc = (v: number) => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, xa = Math.max(0, x - 1), xb = Math.min(W - 1, x + 1), ya = Math.max(0, y - 1), yb = Math.min(Hh - 1, y + 1);
    const hx = (h[y * W + xb]! - h[y * W + xa]!) / (xb - xa), hy = (h[yb * W + x]! - h[ya * W + x]!) / (yb - ya);
    const s = Math.max(0, (1 - hx * ux - hy * uy) / Math.sqrt(1 + hx * hx + hy * hy));
    const paint = 0.25 + 0.15 * Math.sin(x * 0.11) * Math.cos(y * 0.07) + 0.05 * ((x * 7 + y * 13) % 5) / 5;
    for (let c = 0; c < 3; c++) { const a = paint * (1 + 0.1 * c); flat[i * 4 + c] = enc(a); lit[i * 4 + c] = enc(Math.min(1, a * (0.1 + 0.6 * s))); }
    flat[i * 4 + 3] = lit[i * 4 + 3] = 255;
  }
  const m = measureRelief({ even: flat, shots: [{ rgba: lit, light: { sun: { azimuthDeg: 150, elevationDeg: 25 } } }], w: W, h: Hh });
  // One light measures the slope along it: compare that slope, away from the edges.
  const along = (a: ArrayLike<number>) => { const o: number[] = []; for (let y = 12; y < Hh - 12; y++) for (let x = 12; x < W - 12; x++) { const i = y * W + x; o.push(0.5 * (a[i + 1]! - a[i - 1]!) * ux + 0.5 * (a[i + W]! - a[i - W]!) * uy); } return o; };
  const got = along(m.height), want = along(h);
  expect(corr(got, want)).toBeGreaterThan(0.9);
  const gain = got.reduce((s, v, i) => s + v * want[i]!, 0) / want.reduce((s, v) => s + v * v, 0);
  expect(gain).toBeGreaterThan(0.6);
  expect(gain).toBeLessThan(1.4);
});

test('a handheld photo is lined up to under a pixel', () => {
  // The door seen from another spot: scaled, turned, shifted, with a little perspective.
  const ref = small(loadFixture('door-flat-crop.jpg'), 480);
  const mw = 520, mh = 720, inv = [1.1040, -0.0755, -29.5, 0.0570, 1.0795, -50.3, -0.0000640, 0.0000477, 1];
  // `mov` shows ref through H: the photo at mov pixel p is ref at inv(p).
  const mov = warpPhoto(ref.data, ref.width, ref.height, inv, mw, mh, mw, mh);
  for (let i = 3; i < mov.length; i += 4) if (mov[i] === 0) { mov[i - 3] = 90; mov[i - 2] = 110; mov[i - 1] = 80; mov[i] = 255; } // grass round the piece
  const r = lineUp(ref.data, ref.width, ref.height, mov, mw, mh);
  expect(r.H).not.toBeNull();
  expect(r.covered).toBeGreaterThan(0.95);
  for (const [x, y] of [[20, 20], [460, 20], [20, 650], [460, 650], [240, 340]] as const) {
    const [u, v] = applyH(r.H!, x, y), [bx, by] = applyH(inv, u, v); // back through the true map
    expect(Math.hypot(bx - x, by - y)).toBeLessThan(1);
  }
});

test('the light\'s axis is read within 20 degrees on the five fixture pairs', () => {
  const pairs = [['door-flat-crop.jpg', 'door-sun-lined.jpg', 135], ['lintel-flat-crop.jpg', 'lintel-sun-lined.jpg', 47],
    ['dsc8382/DSC_8382.jpg', 'dsc8382/DSC_8379.jpg', 90], ['dsc8382/DSC_8382.jpg', 'dsc8382/DSC_8380.jpg', 123], ['dsc8382/DSC_8382.jpg', 'dsc8382/DSC_8381.jpg', 55]] as const;
  for (const [f, l, truth] of pairs) {
    const a = loadFixture(f), b = loadFixture(l), r = lightAxis(a.data, b.data, a.width, a.height);
    expect(axisDistance(r.axisDeg, truth), l).toBeLessThan(20);
  }
});

test('three lamp shots: each is predicted from the other two (0.7 or better)', () => {
  const IN = 2.54, even = small(loadFixture('dsc8382/DSC_8382.jpg'), 689), lamps = [[9.39, 9, 6.5], [-2.8, 9.75, 5.75], [22.41, 9.5, 6]] as const;
  const shots = ['DSC_8379', 'DSC_8380', 'DSC_8381'].map((n, i) => ({ rgba: small(loadFixture(`dsc8382/${n}.jpg`), 689).data, light: { left: lamps[i]![0] * IN, above: lamps[i]![1] * IN, out: lamps[i]![2] * IN } }));
  const m = measureRelief({ even: even.data, shots, w: even.width, h: even.height, widthCm: 48.26 });
  for (const c of m.check!) expect(c).toBeGreaterThan(0.7);
});

test('the stored height: 16 bits through two PNG channels, and the maps made from it', () => {
  const q = quantise(measured), back = unpackHeight(packHeight(q.height), q.height.width, q.height.height, q.height.lo, q.height.hi);
  expect(back.data).toEqual(q.height.data);
  expect(q.depth).toBeCloseTo(measured.depth, 12);
  const maps = measuredRelief(q.height);
  // hHat: the measured height over its spread, to 16 bits.
  const spread = measured.depth * measured.w;
  expect(corr(maps.h, measured.height)).toBeGreaterThan(0.99999);
  expect(Math.abs((maps.h[5000]! - maps.h[9000]!) * spread - (measured.height[5000]! - measured.height[9000]!))).toBeLessThan(1e-3);
  const f = flipped(q.height);
  expect(measuredRelief(f).h[5000]).toBeCloseTo(-maps.h[5000]!, 4);
  // A render with it differs from the photo, and the same height gives the same picture.
  const doc = parseDoc({ ...neutralDoc({ width: door.width, height: door.height, space: 'srgb', sha256: 'a'.repeat(64) }), ambient: { level: 0.4, kelvin: 6500 },
    lights: [{ id: 'a', kind: 'sun', azimuth: 135, elevation: 25 }], relief: { mode: 'measured', depth: q.depth, shadows: 1 } });
  const a = render(door, doc, { relief: maps }), b = render(door, doc, { relief: measuredRelief(back) });
  expect(a.data).toEqual(b.data);
  expect(() => render(door, doc)).toThrow(/side-lit photo/);
});

test('commands: measured texture only after a measurement, then it renders', () => {
  const c = createCommands();
  c.open({ ...door, sha256: 'd'.repeat(64) });
  expect(() => c.setRelief({ mode: 'measured' })).toThrow(/side-lit photo/);
  const r = c.measureRelief({ photos: [{ image: doorSun, from: 135, elevation: 30 }] });
  expect(r.doc.relief.mode).toBe('measured');
  expect(r.doc.relief.depth).toBeGreaterThan(0.001);
  expect(r.photos[0]!.lineUp!.errorPx).toBeLessThan(1.5);
  c.applyLook('raking-left');
  const lit = c.render({ width: 160 });
  c.setRelief({ mode: 'off' });
  expect(c.render({ width: 160 }).image.data).not.toEqual(lit.image.data);
  c.setRelief({ mode: 'measured' }); // the height is still there
  expect(c.getMeasured()!.width).toBe(door.width);
  expect(() => c.setMeasured({ ...c.getMeasured()!, width: 10 })).toThrow(/must be/);
});
