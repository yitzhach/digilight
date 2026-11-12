// True Relief in the app (BUILD.md Phase 5, step 5): the door pair through the flow (side-lit
// photo, two previews, "Which looks right?"), then the export equals measureFromPhotos + render in
// Node, and the autosaved height (a PNG) comes back bit for bit after a reload.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { measuredRelief, measureFromPhotos, parseDoc, render } from 'core';
import { loadFixture } from '../packages/core/scripts/jpeg.ts';
import { encodePng } from './png.ts';

const APP = 'http://localhost:5180/';
// Lossless files (PNG) so the app decodes exactly the pixels Node measures from.
const flat = loadFixture('door-flat-crop.jpg'), sun = loadFixture('door-sun.jpg');
const flatPng = encodePng(flat), sunPng = encodePng(sun);
const sha = (b: Uint8Array | Uint8ClampedArray | Uint16Array) => createHash('sha256').update(new Uint8Array(b.buffer, b.byteOffset, b.byteLength)).digest('hex');

/** The page's measured height: its size, lo, hi, how it was measured and the SHA-256 of its 16 bits. */
const measuredInPage = () => (async () => {
  const m = (window as any).digilight.getMeasured();
  if (!m) return null;
  const h = await crypto.subtle.digest('SHA-256', m.data);
  return { width: m.width, height: m.height, lo: m.lo, hi: m.hi, how: m.how, sha: Array.from(new Uint8Array(h), (x) => x.toString(16).padStart(2, '0')).join('') };
})();

test('True Relief: the door pair through the flow; export equals the reference', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(APP);
  await page.locator('input[type=file]').first().setInputFiles({ name: 'door.png', mimeType: 'image/png', buffer: flatPng });
  await expect(page.locator('.look canvas:not(.loading)').first()).toBeVisible({ timeout: 30_000 });

  // The flow: the side-lit photo, lined up with progress shown, then the two previews.
  let t0 = Date.now();
  await page.locator('input[data-side-lit]').setInputFiles({ name: 'door-sun.png', mimeType: 'image/png', buffer: sunPng });
  await expect(page.locator('.true-relief progress')).toBeVisible();
  await expect(page.locator('[data-choice="b"] canvas')).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('[data-choice="a"] canvas')).toBeVisible();
  await expect(page.locator('.true-relief')).toContainText('Which looks right?');
  console.log(`lined up and previews shown: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  // The dial re-measures the previews.
  const picture = () => page.locator('[data-choice="a"] canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const dial = page.locator('[data-dial="0"]'), axis = Number(await dial.inputValue()), first = await picture();
  console.log(`axis read from the pair: ${axis} (the sun: about 135)`);
  t0 = Date.now();
  await dial.fill('100');
  await expect.poll(picture, { timeout: 30_000 }).not.toBe(first);
  console.log(`dial turned, previews again: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await dial.fill(String(Math.round(axis)));
  await expect(page.locator('.true-relief')).toContainText(`${Math.round(axis)}°`);

  // The door's sun came from the upper left: preview A (the axis's upper end) is right.
  t0 = Date.now();
  await page.locator('[data-choice="a"]').click();
  await expect(page.locator('[data-texture-status]')).toHaveText('Measured from your side-lit photo.', { timeout: 120_000 });
  console.log(`measured at relief size: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const got = (await page.evaluate(measuredInPage))!;
  const from = got.how.shots[0].from as number;
  expect(Math.abs(from - 135)).toBeLessThan(20);

  // The same chain in Node, from the same pixels and the same direction.
  const t = measureFromPhotos(flat, [{ image: sun, from, elevation: 20 }]);
  expect({ width: got.width, height: got.height, lo: got.lo, hi: got.hi, sha: got.sha })
    .toEqual({ width: t.height.width, height: t.height.height, lo: t.height.lo, hi: t.height.hi, sha: sha(t.height.data) });
  const live = parseDoc(await page.evaluate(() => (window as any).digilight.getDoc()));
  expect(live.relief.mode).toBe('measured');
  expect(live.relief.depth).toBe(Math.min(0.03, Math.round(t.depth * 1e5) / 1e5));

  // Light it, export as PNG: the reference renders the same pixels with the same height.
  await page.locator('[data-look="raking-left"]').click();
  await page.locator('[data-format="png"]').click();
  const downloads: import('@playwright/test').Download[] = [];
  const two = new Promise<void>((done) => page.on('download', (d) => { downloads.push(d); if (downloads.length === 2) done(); }));
  await page.locator('[data-action="download"]').click();
  await two;
  const files = await Promise.all(downloads.map(async (d) => ({ name: d.suggestedFilename(), bytes: readFileSync((await d.path())!) })));
  const rec = JSON.parse(files.find((f) => f.name.endsWith('.json'))!.bytes.toString());
  const doc = parseDoc(rec.document);
  expect(doc.relief.mode).toBe('measured');
  const ref = render(flat, doc, { relief: measuredRelief(t.height) });
  expect(rec.picture.pixelsSha256).toBe(sha(ref.data));

  // Autosave: reloaded, the photo, the document and the height (from its PNG) come back.
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(page.locator('[data-texture-status]')).toHaveText('Measured from your side-lit photo.', { timeout: 30_000 });
  const back = (await page.evaluate(measuredInPage))!;
  expect({ lo: back.lo, hi: back.hi, sha: back.sha }).toEqual({ lo: got.lo, hi: got.hi, sha: got.sha });
  expect(errors).toEqual([]);
});

test('True Relief: a photo of something else says what to do', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(APP);
  await page.locator('input[type=file]').first().setInputFiles({ name: 'door.png', mimeType: 'image/png', buffer: flatPng });
  const other = encodePng(loadFixture('lintel-sun.jpg'));
  await page.locator('input[data-side-lit]').setInputFiles({ name: 'lintel-sun.png', mimeType: 'image/png', buffer: other });
  await expect(page.locator('.true-relief .error')).toContainText(/line this photo up|too little of the piece/, { timeout: 90_000 });
});
