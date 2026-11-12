// Texture on the GPU (BUILD.md Phase 4): the horizon table built by the preview against core's
// (within 2 bytes at 99% of entries), and parity documents with Texture on (§5.11 tolerances).
// The maps are made in the page by core from the photo given to it, so Node's reference renders
// with the very same maps (core is deterministic: the same bits in Node and the browser).

import { expect, test, type Page } from '@playwright/test';
import { estimatedRelief, guardKappa, neutralDoc, parseDoc, render, withLook, type Doc, type Image } from 'core';
import { loadFixture } from '../packages/core/scripts/jpeg.ts';

const photo = loadFixture('lintel-flat-crop.jpg');
const b64 = (img: Image) => Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length).toString('base64');
const at = (w: number): Image => render(photo, neutralDoc({ width: photo.width, height: photo.height, space: 'srgb', sha256: photo.sha256 }), { width: w });

async function open(page: Page, img: Image) {
  await page.goto('http://localhost:5179/');
  await page.waitForFunction(() => 'harness' in window);
  await page.evaluate(([p, w, h]) => (window as any).harness.init(p, w, h, 'srgb'), [b64(img), img.width, img.height] as const);
}

test('GPU horizon table against the CPU table: 99% of entries within 2 bytes', async ({ page }) => {
  await open(page, at(512));
  const r = await page.evaluate(() => (window as any).harness.reliefGPU());
  console.log(`table ${r.width} x ${r.height}: ${r.frames} frames, ${Math.round(r.ms)} ms (software GL); within 1: ${(100 * r.table.within1).toFixed(3)}%, within 2: ${(100 * r.table.within2).toFixed(3)}%, max ${r.table.max}; ao within 1: ${(100 * r.ao.within1).toFixed(3)}%, max ${r.ao.max}`);
  expect(r.table.within2).toBeGreaterThanOrEqual(0.99);
  expect(r.ao.within2).toBeGreaterThanOrEqual(0.99);
  console.log(`Tmax: GPU ${r.tmax[0]}, CPU ${r.tmax[1]}`);
  expect(Math.abs(r.tmax[0] / r.tmax[1] - 1)).toBeLessThan(1e-5); // found on the GPU (D-039)
  expect(r.frames).toBeGreaterThanOrEqual(31); // two directions a frame: Tmax, then the table
});

test('parity with Texture on: 99% of channel values within 2 levels, none beyond 6', async ({ page }) => {
  const small = at(1024);
  await open(page, small);
  await page.evaluate(() => (window as any).harness.reliefCPU());
  const base = neutralDoc({ width: small.width, height: small.height, space: 'srgb', sha256: photo.sha256 });
  const tex = (d: Doc, r: Partial<Doc['relief']>) => parseDoc({ ...d, relief: { ...d.relief, mode: 'estimated', depth: 0.003, shadows: 0.4, ...r } });
  const docs: Record<string, Doc> = {
    'neutral, texture on': tex(base, {}),
    'gallery': tex(withLook(base, 'gallery'), {}),
    'raking-left, shadows 1': tex(withLook(base, 'raking-left'), { shadows: 1, depth: 0.006 }),
    'raking-top, sheen': tex(withLook(base, 'raking-top'), { sheen: 0.4, ao: 0.8 }),
    'sun and lamps': tex(parseDoc({ ...base, ambient: { level: 0.4, kelvin: 5200 }, lights: [
      { id: 'a', pos: [0.15, -0.3, 0.7], aim: [0.35, 0.4], intensity: 0.7, kelvin: 3200, cone: 40, edge: 0, falloff: 1 },
      { id: 'b', kind: 'sun', azimuth: 135, elevation: 12, intensity: 0.5, kelvin: 6000, size: 0.02 },
    ] }), { shadows: 0.8 }),
  };
  const maps = estimatedRelief(small);
  for (const [name, doc] of Object.entries(docs)) {
    const kappa = guardKappa(small, doc), ref = render(small, doc, { kappa, relief: maps });
    const r = await page.evaluate(([d, k]) => (window as any).harness.draw(d, k), [doc, kappa] as const);
    expect(r.error, 'WebGL error').toBe(0);
    const got = Buffer.from(r.pixels, 'base64');
    let n = 0, w2 = 0, max = 0;
    for (let p = 0; p < ref.data.length; p += 4) for (let c = 0; c < 3; c++) { const d = Math.abs(got[p + c]! - ref.data[p + c]!); n++; if (d <= 2) w2++; if (d > max) max = d; }
    console.log(`${name.padEnd(24)} within 2: ${(100 * w2 / n).toFixed(3)}%  max ${max}`);
    expect(w2 / n, name).toBeGreaterThanOrEqual(0.99);
    expect(max, name).toBeLessThanOrEqual(6);
  }
});
