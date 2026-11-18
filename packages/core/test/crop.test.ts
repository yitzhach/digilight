// Crop and straighten (Phase 6b item 1): the warp, the document's corners, the crop command.
import { expect, test } from 'vitest';
import { createCommands, cropProblem, cropSize, parseDoc, warpCrop, type Corners, type Image } from '../src/index.ts';
import { crop as copyRegion } from '../src/resample.ts';
import { sha256 } from '../scripts/jpeg.ts';

const hash = (img: Image) => sha256(new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.length));
/** 120 x 90: red = 2x, green = 2y (a plane), blue a fine checker. */
function plane(): Image {
  const width = 120, height = 90, data = new Uint8ClampedArray(width * height * 4);
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
    const p = (j * width + i) * 4;
    data[p] = 2 * i; data[p + 1] = 2 * j; data[p + 2] = (i + j) % 2 ? 200 : 50; data[p + 3] = 255;
  }
  return { data, width, height };
}
const SHA = 'f'.repeat(64);
const SKEW: Corners = [[14.5, 6], [108, 11.25], [101, 83], [9, 77.5]];

test('a square crop on whole pixels copies those pixels exactly', () => {
  const p = plane(), out = warpCrop(p, [[10, 20], [70, 20], [70, 65], [10, 65]]);
  expect([out.width, out.height]).toEqual([60, 45]);
  expect(hash(out)).toBe(hash(copyRegion(p, 10, 20, 60, 45)));
});

test('straightening keeps a smooth plane within a level (bicubic, away from the edges)', () => {
  const p = plane(), out = warpCrop(p, SKEW), { width: W, height: H } = out;
  expect({ width: W, height: H }).toEqual(cropSize(SKEW));
  // where an output pixel's centre lands on the photo, by the same corners (bilinear is exact
  // enough to check the corners and the middle of an edge)
  const at = (u: number, v: number): [number, number] => {
    const top = [SKEW[0][0] + (SKEW[1][0] - SKEW[0][0]) * u, SKEW[0][1] + (SKEW[1][1] - SKEW[0][1]) * u];
    const bot = [SKEW[3][0] + (SKEW[2][0] - SKEW[3][0]) * u, SKEW[3][1] + (SKEW[2][1] - SKEW[3][1]) * u];
    return [top[0]! + (bot[0]! - top[0]!) * v, top[1]! + (bot[1]! - top[1]!) * v];
  };
  for (const [u, v] of [[0.5, 0.5], [0.1, 0.1], [0.9, 0.12], [0.88, 0.9], [0.1, 0.9]] as const) {
    const i = Math.floor(u * W), j = Math.floor(v * H), q = (j * W + i) * 4;
    const [x, y] = at((i + 0.5) / W, (j + 0.5) / H);
    expect(Math.abs(out.data[q]! - 2 * (x - 0.5))).toBeLessThan(3); // projective vs bilinear: a little off
    expect(Math.abs(out.data[q + 1]! - 2 * (y - 0.5))).toBeLessThan(3);
  }
});

test('the corners are checked: on the photo, in order, not crossing, big enough', () => {
  expect(cropProblem(SKEW, 120, 90)).toBeNull();
  expect(cropProblem([[0, 0], [130, 0], [120, 90], [0, 90]], 120, 90)).toMatch(/on the 120 x 90 photo/);
  expect(cropProblem([[0, 0], [120, 90], [120, 0], [0, 90]], 120, 90)).toMatch(/without crossing/);
  expect(cropProblem([[0, 0], [0, 90], [120, 90], [120, 0]], 120, 90)).toMatch(/without crossing/); // anticlockwise
  expect(cropProblem([[0, 0], [10, 0], [10, 10], [0, 10]], 120, 90)).toMatch(/at least 16/);
  const d = { version: 2, photo: { width: 99, height: 72, space: 'srgb', sha256: SHA, crop: { corners: SKEW, source: [120, 90] } } };
  expect(() => parseDoc(d)).toThrow(/a crop with these corners is/);
  expect(parseDoc({ ...d, photo: { ...d.photo, ...cropSize(SKEW) } }).photo.crop?.corners).toEqual(SKEW);
});

test('crop: the picture, the size, undo, and the whole frame is no crop', () => {
  const c = createCommands(), p = plane();
  c.open({ ...p, sha256: SHA });
  c.applyLook('gallery');
  const d = c.crop(SKEW);
  expect(d.photo).toMatchObject({ ...cropSize(SKEW), sha256: SHA, crop: { corners: SKEW, source: [120, 90] } });
  expect(d.lights).toHaveLength(1); // the lights stay
  expect(hash(c.picture())).toBe(hash(warpCrop(p, SKEW)));
  expect(c.render().image.width).toBe(cropSize(SKEW).width);
  expect(() => c.render({ width: 200 })).toThrow(/width must be/);
  c.undo();
  expect(c.getDoc().photo).toEqual({ width: 120, height: 90, space: 'srgb', sha256: SHA });
  expect(c.picture()).toEqual(p);
  c.redo(); c.crop(null);
  expect(c.getDoc().photo).toEqual({ width: 120, height: 90, space: 'srgb', sha256: SHA });
  c.crop(SKEW); c.crop([[0, 0], [120, 0], [120, 90], [0, 90]]);
  expect(c.getDoc().photo.crop).toBeUndefined();
  expect(() => c.crop([[0, 0], [120, 90], [120, 0], [0, 90]])).toThrow(/Cannot crop/);
  expect(() => c.set('photo.crop', null)).toThrow(/belongs to the photo/);
});

test('crop and documents: setDoc and load bring their crop; settings never carry one', () => {
  const c = createCommands(), p = plane();
  c.open({ ...p, sha256: SHA });
  const cropped = c.crop(SKEW);
  const other = createCommands();
  other.open({ ...p, sha256: SHA });
  other.load(cropped);
  expect(hash(other.render().image)).toBe(hash(c.render().image));
  const fresh = createCommands();
  fresh.open({ ...p, sha256: SHA });
  fresh.applySettings(c.getSettings());
  expect(fresh.getDoc().photo.crop).toBeUndefined();
  fresh.setDoc(cropped);
  expect(fresh.getDoc().photo).toEqual(cropped.photo);
  expect(() => fresh.load({ ...cropped, photo: { ...cropped.photo, crop: { corners: SKEW, source: [100, 90] } } })).toThrow();
});

test('a measured height belongs to its crop: cropping turns Texture off, undo brings it back', () => {
  const c = createCommands(), p = plane();
  c.open({ ...p, sha256: SHA });
  const size = { width: 120, height: 90 }; // reliefSize of a small photo is the photo
  c.setMeasured({ width: size.width, height: size.height, data: new Uint16Array(size.width * size.height).fill(30000), lo: -0.01, hi: 0.01 } as never);
  expect(c.getDoc().relief.mode).toBe('measured');
  c.crop(SKEW);
  expect(c.getDoc().relief.mode).toBe('off');
  expect(c.getMeasured()).toBeNull();
  expect(() => c.setRelief({ mode: 'measured' })).toThrow(/side-lit photo first/);
  c.undo();
  expect(c.getDoc().relief.mode).toBe('measured');
  expect(c.getMeasured()).not.toBeNull();
});
