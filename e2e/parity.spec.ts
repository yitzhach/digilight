// Preview against reference (BUILD.md §5.11, Phase 2): six documents on a fixture at 1024 px.
// 99% of channel values within 2 levels, none beyond 6; the neutral document exact.
//
// The preview is given the photo at 1024 px as the reference resizes it (area average), so this
// compares the lighting; how the GPU filters a zoomed-out photo is a display matter (D-023).

import { expect, test, type Page } from '@playwright/test';
import { guardKappa, neutralDoc, parseDoc, render, withLook, type Doc, type Image } from 'core';
import { loadFixture } from '../packages/core/scripts/jpeg.ts';

const FIXTURE = 'lintel-flat-crop.jpg', WIDTH = 1024;
const photo = loadFixture(FIXTURE);
const base = neutralDoc({ width: photo.width, height: photo.height, space: 'srgb', sha256: photo.sha256 });

const DOCS: Record<string, Doc> = {
  neutral: base,
  gallery: withLook(base, 'gallery'),
  spotlight: withLook(base, 'spotlight'),
  'raking-left': withLook(base, 'raking-left'),
  dramatic: withLook(base, 'dramatic'),
  'four-light mix': parseDoc({
    ...base,
    ambient: { level: 0.4, kelvin: 5200 },
    lights: [
      { id: 'a', pos: [0.15, -0.3, 0.7], aim: [0.35, 0.4], intensity: 0.7, kelvin: 3200, cone: 40, edge: 0, falloff: 1 },
      { id: 'b', kind: 'sun', azimuth: 135, elevation: 25, intensity: 0.25, kelvin: 6000 },
      { id: 'c', pos: [1.8, 0.6, 0.4], intensity: 0.9, kelvin: 2400, falloff: 0.3 },
      { id: 'd', pos: [0.5, 1.1, 1.5], aim: [0.6, 0.7], intensity: 1.2, kelvin: 9000, cone: 20, edge: 0.8, falloff: 0.6 },
    ],
  }),
};

const small: Image = render(photo, base, { width: WIDTH }); // neutral: the resized photo itself
const b64 = (img: Image) => Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length).toString('base64');

async function preview(page: Page, doc: Doc, kappa: number, opts = {}): Promise<Uint8Array> {
  const r = await page.evaluate(([d, k, o]) => (window as any).harness.draw(d, k, o), [doc, kappa, opts] as const);
  expect(r.error, 'WebGL error').toBe(0);
  return Buffer.from(r.pixels, 'base64');
}

/** Channel differences (r, g, b) between two RGBA8 pictures. */
function compare(a: Uint8Array, b: Uint8ClampedArray) {
  let n = 0, within2 = 0, max = 0, sum = 0;
  for (let p = 0; p < b.length; p += 4) for (let c = 0; c < 3; c++) {
    const d = Math.abs(a[p + c]! - b[p + c]!);
    n++; sum += d; if (d <= 2) within2++; if (d > max) max = d;
  }
  return { within2: within2 / n, max, mean: sum / n };
}

const average = (a: ArrayLike<number>, c: number) => {
  let s = 0;
  for (let p = c; p < a.length; p += 4) s += a[p]!;
  return s / (a.length / 4);
};

test.describe.configure({ mode: 'serial' });
let page: Page;
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.goto('http://localhost:5179/');
  await page.waitForFunction(() => 'harness' in window);
  await page.evaluate(([p, w, h]) => (window as any).harness.init(p, w, h, 'srgb'), [b64(small), small.width, small.height] as const);
});

for (const [name, doc] of Object.entries(DOCS)) {
  test(`parity: ${name}`, async () => {
    const kappa = guardKappa(photo, doc);
    const ref = render(photo, doc, { width: WIDTH, kappa });
    const got = await preview(page, doc, kappa);
    expect(got.length).toBe(ref.data.length);
    const s = compare(got, ref.data);
    console.log(`${name.padEnd(15)} kappa ${kappa.toFixed(3)}  within 2: ${(100 * s.within2).toFixed(3)}%  max ${s.max}  mean ${s.mean.toFixed(4)}`);
    if (name === 'neutral') expect(Buffer.compare(Buffer.from(got), Buffer.from(ref.data))).toBe(0);
    expect(s.within2).toBeGreaterThanOrEqual(0.99);
    expect(s.max).toBeLessThanOrEqual(6);
  });
}

test('reduced scale and zoom draw without errors', async () => {
  const doc = DOCS.gallery!, kappa = guardKappa(photo, doc);
  const ref = render(photo, doc, { width: WIDTH, kappa });
  // A half-size frame stretched back loses fine detail, so judge its average colour.
  const half = await preview(page, doc, kappa, { scale: 0.5 });
  for (let c = 0; c < 3; c++) expect(Math.abs(average(half, c) - average(ref.data, c))).toBeLessThan(1);
  const out = await preview(page, doc, kappa, { view: { zoom: 0.5 } });
  expect(out[3]).toBe(0); // the corner is outside the picture: nothing drawn
  const mid = ((small.height >> 1) * small.width + (small.width >> 1)) * 4 + 3;
  expect(out[mid]).toBe(255);
});
