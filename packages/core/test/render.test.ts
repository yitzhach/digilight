import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { LOOKS, neutralDoc, parseDoc, render, withLook, type Doc, type Image } from '../src/index.ts';
import { loadFixture, sha256 } from '../scripts/jpeg.ts';

/** A 256 x 192 test picture: ramps, a checker, pure white and black patches. */
function procedural(): Image {
  const width = 256, height = 192, data = new Uint8ClampedArray(width * height * 4);
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
    const p = (j * width + i) * 4;
    data[p] = i; data[p + 1] = Math.round((255 * j) / (height - 1)); data[p + 2] = ((i >> 4) + (j >> 4)) % 2 ? 230 : 40;
    if (i < 32 && j < 32) data[p] = data[p + 1] = data[p + 2] = 255;
    if (i >= 224 && j >= 160) data[p] = data[p + 1] = data[p + 2] = 0;
    data[p + 3] = 255;
  }
  return { data, width, height };
}
const docFor = (img: { width: number; height: number }, sha = 'b'.repeat(64)): Doc =>
  neutralDoc({ width: img.width, height: img.height, space: 'srgb', sha256: sha });
const hash = (img: Image) => sha256(new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.length));

test('identity: a neutral document returns the photo byte for byte (door)', () => {
  const photo = loadFixture('door-flat-crop.jpg');
  const out = render(photo, docFor(photo, photo.sha256));
  expect(out.width).toBe(photo.width);
  expect(Buffer.compare(Buffer.from(out.data), Buffer.from(photo.data))).toBe(0);
});

test('identity per pixel: room light 1 with a lamp switched off or at zero copies every byte', () => {
  const photo = procedural();
  const d = parseDoc({ ...docFor(photo), lights: [{ id: 'a', on: false }, { id: 'b', intensity: 0 }] });
  expect(hash(render(photo, d))).toBe(hash(photo));
});

test('each look on the procedural photo matches its golden SHA-256', () => {
  const photo = procedural(), file = new URL('goldens.json', import.meta.url);
  const got: Record<string, string> = {};
  for (const look of LOOKS) got[look.id] = hash(render(photo, withLook(docFor(photo), look.id)));
  got['gallery-flip-half'] = hash(render(photo, withLook(docFor(photo), 'gallery', { strength: 0.5, flip: true })));
  if (process.env.UPDATE_GOLDENS) writeFileSync(file, `${JSON.stringify(got, null, 2)}\n`);
  expect(got).toEqual(JSON.parse(readFileSync(file, 'utf8')));
});

test('a region has exactly the pixels of the whole render there, at any width', () => {
  const photo = procedural(), d = withLook(docFor(photo), 'dramatic');
  for (const width of [256, 200, 128]) {
    const whole = render(photo, d, { width });
    const region = { x: 17, y: 23, width: 61, height: 40 };
    const part = render(photo, d, { width, region });
    for (let j = 0; j < region.height; j++) {
      const a = ((region.y + j) * whole.width + region.x) * 4;
      expect(Array.from(part.data.subarray(j * region.width * 4, (j + 1) * region.width * 4)))
        .toEqual(Array.from(whole.data.subarray(a, a + region.width * 4)));
    }
  }
});

test('a width over the photo\'s is refused, never upscaled', () => {
  const photo = procedural(), d = withLook(docFor(photo), 'gallery');
  expect(() => render(photo, d, { width: photo.width + 1 })).toThrow(/photo's 256/);
  expect(render(photo, d, { width: photo.width }).width).toBe(photo.width);
});

test('a look at strength 0 is neutral; flip mirrors the lamp', () => {
  const photo = procedural(), d = docFor(photo);
  expect(hash(render(photo, withLook(d, 'spotlight', { strength: 0 })))).toBe(hash(photo));
  expect(withLook(d, 'raking-left', { flip: true }).lights[0]!.pos[0]).toBe(3);
});

test('light adds where it points: the spotlight is brighter at its aim than at a corner', () => {
  const photo = { data: new Uint8ClampedArray(64 * 48 * 4).fill(128), width: 64, height: 48 };
  const out = render(photo, withLook(docFor(photo), 'spotlight'));
  const at = (i: number, j: number) => out.data[(j * 64 + i) * 4 + 1]!;
  expect(at(1, 1)).toBeLessThan(at(32, 24) - 25);
});

test('full-size render of door-flat-crop with the gallery look takes under 1 s', () => {
  const photo = loadFixture('door-flat-crop.jpg');
  const d = withLook(docFor(photo, photo.sha256), 'gallery');
  render(photo, d, { width: 64 }); // warm up
  const t = performance.now();
  const out = render(photo, d);
  const ms = performance.now() - t;
  console.log(`gallery, ${photo.width} x ${photo.height}: ${ms.toFixed(0)} ms`);
  expect(out.data.length).toBe(photo.data.length);
  expect(ms).toBeLessThan(1000);
});
