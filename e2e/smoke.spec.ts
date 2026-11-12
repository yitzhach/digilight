// The app end to end (BUILD.md Phase 3): open a fixture, apply each look, drag a light, export,
// and check the exported picture is the reference renderer's, pixel for pixel (SHA-256).

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { LOOKS, neutralDoc, parseDoc, render } from 'core';
import { loadFixture } from '../packages/core/scripts/jpeg.ts';
import { encodePng } from './png.ts';

const APP = 'http://localhost:5180/';
/** The dev server, and the built app (`vite preview` of dist: what is deployed). */
const APPS = [['dev server', APP], ['built app', 'http://localhost:5181/']] as const;
const src = loadFixture('door-flat-crop.jpg');
// A lossless photo (PNG) at 1200 px so the app decodes exactly these pixels.
const photo = render(src, neutralDoc({ width: src.width, height: src.height, space: 'srgb', sha256: src.sha256 }), { width: 1200 });
const png = encodePng(photo);
const sha = (b: Uint8Array | Uint8ClampedArray) => createHash('sha256').update(b).digest('hex');

for (const [where, app] of APPS) test(`smoke: open, looks, drag, export (${where})`, async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(app);
  await page.locator('input[type=file]').setInputFiles({ name: 'door.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('.look canvas:not(.loading)')).toHaveCount(LOOKS.length, { timeout: 30_000 });
  const getDoc = () => page.evaluate(() => (window as any).digilight.getDoc());
  expect((await getDoc()).photo).toMatchObject({ width: photo.width, height: photo.height, sha256: sha(png) });

  for (const look of LOOKS) {
    await page.locator(`[data-look="${look.id}"]`).click();
    const d = await getDoc();
    expect(d.ambient.level, look.id).toBe(look.ambient.level);
    expect(d.lights.length, look.id).toBe(look.lights.length);
  }

  // Drag the (candlelight) lamp's handle: its place changes in one undo step.
  const before = (await getDoc()).lights[0].pos;
  const box = (await page.locator('.handle circle').first().boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(x - 12 * i, y - 15 * i);
  await page.mouse.up();
  const after = (await getDoc()).lights[0].pos;
  expect(after[0]).toBeLessThan(before[0]);
  expect(after[1]).toBeLessThan(before[1]);
  await page.evaluate(() => (window as any).digilight.undo());
  expect((await getDoc()).lights[0].pos).toEqual(before);
  await page.evaluate(() => (window as any).digilight.redo());

  // Export as PNG: the picture and its record.
  await page.locator('[data-format="png"]').click();
  const downloads: import('@playwright/test').Download[] = [];
  const two = new Promise<void>((done) => page.on('download', (d) => { downloads.push(d); if (downloads.length === 2) done(); }));
  await page.locator('[data-action="download"]').click();
  await two;
  const files = await Promise.all(downloads.map(async (d) => ({ name: d.suggestedFilename(), bytes: readFileSync((await d.path())!) })));
  const pic = files.find((f) => f.name.endsWith('.png'))!, rec = JSON.parse(files.find((f) => f.name.endsWith('.json'))!.bytes.toString());

  const doc = parseDoc(rec.document);
  expect(doc.lights[0]!.pos).toEqual(after);
  const ref = render(photo, doc); // the reference, in Node, with its own guard
  expect(rec.picture.pixelsSha256).toBe(sha(ref.data));
  expect(rec.picture.fileSha256).toBe(sha(pic.bytes));
  expect(rec.photo.sha256).toBe(sha(png));
  // The PNG file itself decodes to the reference's pixels.
  const decoded = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d')!;
    g.drawImage(bmp, 0, 0);
    const d = g.getImageData(0, 0, bmp.width, bmp.height).data;
    const h = await crypto.subtle.digest('SHA-256', d);
    return Array.from(new Uint8Array(h), (x) => x.toString(16).padStart(2, '0')).join('');
  }, pic.bytes.toString('base64'));
  expect(decoded).toBe(sha(ref.data));
  expect(errors).toEqual([]);
});

test('on a phone, export offers Save or share (the share sheet gets the picture)', async ({ page }) => {
  // Chromium here has no share sheet: stand one in, as Safari on an iPhone has.
  await page.addInitScript(() => {
    const nav = navigator as any;
    nav.canShare = (d: { files?: File[] }) => !!d.files?.length;
    nav.share = async (d: { files: File[] }) => { (window as any).shared = d.files.map((f) => [f.name, f.type, f.size]); };
  });
  await page.goto(APP);
  await page.locator('input[type=file]').setInputFiles({ name: 'door.png', mimeType: 'image/png', buffer: png });
  await page.locator('[data-look="gallery"]').click();
  let downloaded = false;
  page.on('download', () => { downloaded = true; });
  await page.locator('[data-action="download"]').click();
  await page.getByRole('button', { name: 'Save or share' }).click();
  const shared = await page.waitForFunction(() => (window as any).shared).then((h) => h.jsonValue());
  expect(shared).toEqual([['door-digilight.jpg', 'image/jpeg', expect.any(Number)]]);
  await expect(page.getByRole('button', { name: 'Save or share' })).toHaveCount(0);
  expect(downloaded).toBe(false);
});

test('Texture: switched on from the panel, shown, and exported equal to the reference', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(APP);
  await page.locator('input[type=file]').setInputFiles({ name: 'door.png', mimeType: 'image/png', buffer: png });
  await page.locator('[data-look="raking-left"]').click();
  await page.getByRole('checkbox', { name: 'Texture', exact: true }).check();
  const d0 = await page.evaluate(() => (window as any).digilight.getDoc());
  expect(d0.relief).toMatchObject({ mode: 'estimated', depth: 0.003, shadows: 0.4 });
  await expect(page.getByText('Preparing the texture…')).toHaveCount(0, { timeout: 120_000 });

  await page.locator('[data-format="png"]').click();
  const downloads: import('@playwright/test').Download[] = [];
  const two = new Promise<void>((done) => page.on('download', (d) => { downloads.push(d); if (downloads.length === 2) done(); }));
  await page.locator('[data-action="download"]').click();
  await two;
  const files = await Promise.all(downloads.map(async (d) => ({ name: d.suggestedFilename(), bytes: readFileSync((await d.path())!) })));
  const rec = JSON.parse(files.find((f) => f.name.endsWith('.json'))!.bytes.toString());
  const doc = parseDoc(rec.document);
  expect(doc.relief.mode).toBe('estimated');
  expect(rec.picture.pixelsSha256).toBe(sha(render(photo, doc).data)); // Node makes its own maps: the same bits
  expect(errors).toEqual([]);
});
