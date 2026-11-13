import { expect, test } from 'vitest';
import { grainAt, guardKappa, neutralDoc, parseDoc, pcg, render, toDisplay, withLook, type Doc, type Image } from '../src/index.ts';
import { decode } from '../src/srgb.ts';

/** A 128 x 96 picture: a colour ramp across, a grey ramp down. */
function ramp(): Image {
  const width = 128, height = 96, data = new Uint8ClampedArray(width * height * 4);
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
    const p = (j * width + i) * 4, g = Math.round((255 * j) / (height - 1));
    data[p] = Math.min(255, g + i); data[p + 1] = g; data[p + 2] = Math.max(0, g - i); data[p + 3] = 255;
  }
  return { data, width, height };
}
const flat = (v: number, width = 64, height = 48): Image => {
  const data = new Uint8ClampedArray(width * height * 4).fill(v);
  for (let p = 3; p < data.length; p += 4) data[p] = 255;
  return { data, width, height };
};
const docOf = (img: Image, finish: object = {}, rest: object = {}): Doc =>
  parseDoc({ ...neutralDoc({ width: img.width, height: img.height, space: 'srgb', sha256: 'c'.repeat(64) }), ...rest, finish });
const mean = (img: Image, c: number) => {
  let s = 0;
  for (let p = c; p < img.data.length; p += 4) s += img.data[p]!;
  return s / (img.data.length / 4);
};
const spread = (img: Image) => {
  const m = mean(img, 1);
  let s = 0;
  for (let p = 1; p < img.data.length; p += 4) s += (img.data[p]! - m) ** 2;
  return Math.sqrt(s / (img.data.length / 4));
};

test('the continuous sRGB curve agrees with the 8-bit tables at every code', () => {
  for (let c = 0; c < 256; c++) expect(Math.abs(toDisplay(decode(c)) * 255 - c)).toBeLessThan(1e-6);
});

test('Brightness is light: exposure 1 gives exactly what room light 2 gives', () => {
  const photo = ramp();
  const a = render(photo, docOf(photo, { exposure: 1 }), { kappa: 1 });
  const b = render(photo, docOf(photo, {}, { ambient: { level: 2 } }), { kappa: 1 });
  expect(Buffer.compare(Buffer.from(a.data), Buffer.from(b.data))).toBe(0);
});

test('the guard does not count Finish, Brightness included', () => {
  const photo = ramp(), lit = withLook(docOf(photo), 'spotlight');
  const k = guardKappa(photo, lit);
  expect(guardKappa(photo, { ...lit, finish: { ...lit.finish, exposure: 1.5, contrast: 1 } })).toBe(k);
});

test('each finish setting moves the picture the way its label says', () => {
  const photo = ramp(), plain = render(photo, docOf(photo));
  const r = (f: object) => render(photo, docOf(photo, f));
  expect(mean(r({ exposure: 0.5 }), 1)).toBeGreaterThan(mean(plain, 1) + 10);
  expect(mean(r({ exposure: -0.5 }), 1)).toBeLessThan(mean(plain, 1) - 10);
  expect(spread(r({ contrast: 0.8 }))).toBeGreaterThan(spread(plain) + 3);
  expect(spread(r({ contrast: -0.5 }))).toBeLessThan(spread(plain) - 10);
  const warm = r({ warmth: 1 }), cool = r({ warmth: -1 });
  expect(mean(warm, 0) - mean(warm, 2)).toBeGreaterThan(mean(plain, 0) - mean(plain, 2) + 10);
  expect(mean(cool, 0) - mean(cool, 2)).toBeLessThan(mean(plain, 0) - mean(plain, 2) - 10);
  const grey = r({ saturation: -1 }).data; // every pixel grey, within rounding
  for (let p = 0; p < grey.length; p += 4) expect(Math.max(Math.abs(grey[p]! - grey[p + 1]!), Math.abs(grey[p + 2]! - grey[p + 1]!))).toBeLessThanOrEqual(1);
});

test('contrast and saturation leave mid-grey and greys where they are', () => {
  const photo = flat(188); // display 188/255 is not 0.5, so contrast moves it; saturation must not
  expect(Array.from(render(photo, docOf(photo, { saturation: 0.9 })).data.subarray(0, 4))).toEqual([188, 188, 188, 255]);
  const mid = flat(128), hi = render(mid, docOf(mid, { contrast: 1 })).data, lo = render(mid, docOf(mid, { contrast: -1 })).data;
  expect(Math.abs(hi[0]! - 128)).toBeLessThanOrEqual(1);
  expect(lo[0]).toBe(128); // contrast -1 is all 0.5
});

test('vignette darkens the corners, not the centre', () => {
  const photo = flat(200), out = render(photo, docOf(photo, { vignette: 1 })).data;
  const at = (i: number, j: number) => out[(j * 64 + i) * 4]!;
  expect(at(32, 24)).toBe(200);
  expect(at(0, 0)).toBeLessThan(140);
  expect(at(0, 0)).toBe(at(63, 47));
});

test('a curve maps each value: identity changes nothing, the reverse inverts', () => {
  const photo = ramp(), plain = render(photo, docOf(photo)).data;
  const same = render(photo, docOf(photo, { curve: Array.from({ length: 256 }, (_, i) => i / 255) })).data;
  const inv = render(photo, docOf(photo, { curve: Array.from({ length: 256 }, (_, i) => 1 - i / 255) })).data;
  for (let p = 0; p < plain.length; p += 4) for (let c = 0; c < 3; c++) {
    expect(same[p + c]).toBe(plain[p + c]);
    expect(Math.abs(inv[p + c]! - (255 - plain[p + c]!))).toBeLessThanOrEqual(1);
  }
});

test('grain: an even hash on a fixed grid, zero on average, the same at any size', () => {
  expect(pcg(0)).toBe(129708002); // the reference PCG hash's first value
  let s = 0, lo = 1, hi = 0;
  for (let j = 0; j < 100; j++) for (let i = 0; i < 100; i++) {
    const h = grainAt((i + 0.5) / 100, (j + 0.5) / 100);
    s += h; lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  expect(Math.abs(s / 1e4 - 0.5)).toBeLessThan(0.01);
  expect(lo).toBeGreaterThanOrEqual(0); expect(hi).toBeLessThan(1);
  // The cell is fixed by where a point is on the picture, not by the pixel grid.
  expect(grainAt(0.25, 0.125)).toBe(grainAt(0.25 + 0.1 / 2048, 0.125 + 0.1 / 2048));
  const photo = flat(128), out = render(photo, docOf(photo, { grain: 1 }));
  expect(Math.abs(mean(out, 0) - 128)).toBeLessThan(1.5);
  expect(spread(out)).toBeGreaterThan(4);
});

test('a neutral finish changes nothing; any finish makes it a full render', () => {
  const photo = ramp();
  expect(Buffer.compare(Buffer.from(render(photo, docOf(photo, { grain: 0, vignette: 0 })).data), Buffer.from(photo.data))).toBe(0);
  expect(Buffer.compare(Buffer.from(render(photo, docOf(photo, { vignette: 0.01 })).data), Buffer.from(photo.data))).not.toBe(0);
});
