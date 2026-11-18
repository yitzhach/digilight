// Crop and straighten (BUILD.md Phase 6b item 1). Gate: a project saved and reopened exports the
// same pixel SHA-256, also after a crop. The app's picture equals core's warp and render.

import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { cropSize, neutralDoc, render, warpCrop, type Corners, type Image } from 'core';
import { loadFixture } from '../packages/core/scripts/jpeg.ts';
import { encodePng } from './png.ts';

const APP = 'http://localhost:5180/';
const sha = (b: Uint8Array | Uint8ClampedArray) => createHash('sha256').update(b).digest('hex');
const smallOf = (file: string, width: number): Image => {
  const s = loadFixture(file);
  return render(s, neutralDoc({ width: s.width, height: s.height, space: 'srgb', sha256: s.sha256 }), { width });
};
const getDoc = (page: Page) => page.evaluate(() => (window as any).digilight.getDoc());
const exported = (page: Page) => page.evaluate(async () => (await (window as any).digilight.export({ format: 'png' })).record.picture.pixelsSha256);
/** The photo is open and its picture made (the top bar says nothing is busy). */
const waitPhoto = async (page: Page, sha256: string) => {
  await page.waitForFunction((s) => { try { return (window as any).digilight.getDoc().photo.sha256 === s; } catch { return false; } }, sha256, { timeout: 60_000 });
  await expect(page.locator('header .grow')).toHaveText('', { timeout: 60_000 });
};
const SKEW: Corners = [[31.5, 22], [560, 40.5], [575, 765], [12, 740]];

test('crop on the screen: drag a corner, Done; Cancel and Esc leave it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const img = smallOf('door-flat-crop.jpg', 600), png = new Uint8Array(encodePng(img));
  await page.goto(APP);
  await page.locator('header input[type=file]').setInputFiles({ name: 'door.png', mimeType: 'image/png', buffer: Buffer.from(png) });
  await waitPhoto(page, sha(png));
  await page.getByRole('button', { name: 'Crop', exact: true }).click();
  await expect(page.locator('.crop-corner')).toHaveCount(4);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.crop-corner')).toHaveCount(0);
  await page.getByRole('button', { name: 'Crop', exact: true }).click();
  const b = (await page.locator('.crop-corner').first().boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 40, b.y + b.height / 2 + 30, { steps: 5 });
  await expect(page.locator('.loupe')).toHaveCount(1);
  await page.mouse.up();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForFunction(() => (window as any).digilight.getDoc().photo.crop !== undefined);
  const d = await getDoc(page);
  expect(d.photo.crop.source).toEqual([img.width, img.height]);
  expect(d.photo.crop.corners[0][0]).toBeGreaterThan(10);
  expect(d.photo.crop.corners[1]).toEqual([img.width, 0]);
  expect(d.photo.width).toBe(cropSize(d.photo.crop.corners).width);
  // Undo puts the whole photo back.
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.waitForFunction(() => (window as any).digilight.getDoc().photo.crop === undefined);
  await expect(page.locator('header .grow')).toHaveText('');
  expect(errors).toEqual([]);
});

test('a cropped picture equals core, and a project saved and reopened exports the same pixels', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const img = smallOf('lintel-flat-crop.jpg', 600), png = new Uint8Array(encodePng(img));
  await page.goto(APP);
  await page.locator('header input[type=file]').setInputFiles({ name: 'lintel.png', mimeType: 'image/png', buffer: Buffer.from(png) });
  await waitPhoto(page, sha(png));
  await page.locator('[data-look="gallery"]').click();
  const d = await page.evaluate((c) => (window as any).digilight.crop(c), SKEW);
  expect(d.photo).toMatchObject({ ...cropSize(SKEW), crop: { corners: SKEW, source: [img.width, img.height] } });
  await page.evaluate(() => (window as any).digilight.set({ 'finish.contrast': 0.3 }));
  const doc = await getDoc(page), before = await exported(page);
  expect(before).toBe(sha(render(warpCrop(img, SKEW), doc).data));

  await page.getByRole('button', { name: 'Settings…' }).click();
  const dl = page.waitForEvent('download');
  await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Save project' }).click();
  const file = (await (await dl).path())!;
  await page.reload();
  await page.locator('header input[type=file]').setInputFiles({ name: 'other.png', mimeType: 'image/png', buffer: encodePng(smallOf('door-flat-crop.jpg', 300)) });
  await page.waitForFunction((s) => (window as any).digilight.getDoc().photo.sha256 !== s, sha(png));
  await page.locator('header input[type=file]').setInputFiles(file);
  await waitPhoto(page, sha(png));
  expect(await getDoc(page)).toEqual(doc);
  expect(await exported(page)).toBe(before);

  // The autosave reopens the crop too.
  await page.reload();
  await waitPhoto(page, sha(png));
  expect(await getDoc(page)).toEqual(doc);
  expect(await exported(page)).toBe(before);
  expect(errors).toEqual([]);
});
