// Versions (BUILD.md Phase 6b item 2): "Keep this version" in a strip under the picture; a tap
// switches (one undo step) and exports what that version exported; a hold shows it without
// changing the document; versions come back with the autosave and in a project, and a new photo
// starts with none.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { neutralDoc, render, type Image } from 'core';
import { loadFixture } from '../packages/core/scripts/jpeg.ts';
import { unpackProject } from '../packages/web/src/io/project.ts';
import { encodePng } from './png.ts';

const APP = 'http://localhost:5180/';
const VERSIONED = new URL('../fixtures/projects/versions-door.digilight', import.meta.url).pathname;
const sha = (b: Uint8Array | Uint8ClampedArray) => createHash('sha256').update(b).digest('hex');
const smallOf = (file: string, width: number): Image => {
  const s = loadFixture(file);
  return render(s, neutralDoc({ width: s.width, height: s.height, space: 'srgb', sha256: s.sha256 }), { width });
};
const getDoc = (page: Page) => page.evaluate(() => (window as any).digilight.getDoc());
const exported = (page: Page) => page.evaluate(async () => (await (window as any).digilight.export({ format: 'png' })).record.picture.pixelsSha256);
const waitPhoto = (page: Page, sha256: string) =>
  page.waitForFunction((s) => { try { return (window as any).digilight.getDoc().photo.sha256 === s; } catch { return false; } }, sha256, { timeout: 60_000 });
const items = (page: Page) => page.locator('.versions .version-item');

test('keep, tap to switch, hold to compare, and the versions come back after a reload and in a project', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const photo = new Uint8Array(encodePng(smallOf('lintel-flat-crop.jpg', 400)));
  await page.goto(APP);
  await page.locator('header input[type=file]').setInputFiles({ name: 'lintel.png', mimeType: 'image/png', buffer: Buffer.from(photo) });
  await waitPhoto(page, sha(photo));
  const keep = page.locator('.version-keep');

  await page.locator('[data-look="spotlight"]').click();
  await keep.click();
  await expect(items(page)).toHaveCount(1);
  await expect(keep).toHaveText('Kept');
  await expect(keep).toBeDisabled();
  const a = await getDoc(page), pa = await exported(page);
  await page.locator('[data-look="warm-evening"]').click();
  await page.evaluate(() => (window as any).digilight.set('finish.vignette', 0.4));
  await expect(keep).toBeEnabled();
  await keep.click();
  await expect(items(page)).toHaveCount(2);
  const b = await getDoc(page);
  await expect(items(page).nth(1)).toHaveClass(/current/);

  // Press and hold: the first version on the picture, the document unchanged; let go, back.
  const t0 = page.locator('[data-version="0"]'), box = (await t0.boundingBox())!;
  const pic = () => page.locator('.stage canvas').screenshot().then((x) => sha(x));
  await page.waitForTimeout(500);
  const now = await pic();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(items(page).nth(0)).toHaveClass(/held/);
  await expect.poll(pic).not.toBe(now);
  expect(await getDoc(page)).toEqual(b);
  await page.mouse.up();
  await expect(items(page).nth(0)).not.toHaveClass(/held/);
  await expect.poll(pic).toBe(now);
  expect(await getDoc(page)).toEqual(b);

  // Tap: switches to it, one undo step, and exports what it exported when kept.
  await t0.click();
  await expect.poll(() => getDoc(page)).toEqual(a);
  await expect(items(page).nth(0)).toHaveClass(/current/);
  expect(await exported(page)).toBe(pa);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => getDoc(page)).toEqual(b);

  // Remove, keep again; the autosave brings them back after a reload.
  await page.getByRole('button', { name: 'Remove version 2' }).click();
  await expect(items(page)).toHaveCount(1);
  await keep.click();
  await expect(items(page)).toHaveCount(2);
  await page.waitForTimeout(800); // the autosave waits 400 ms
  await page.reload();
  await waitPhoto(page, sha(photo));
  await expect(items(page)).toHaveCount(2);
  expect(await page.evaluate(() => (window as any).digilight.versions())).toEqual([a, b]);

  // Saved in a project and opened again: the same versions.
  const file = await page.evaluate(async () => {
    const f: File = await (window as any).digilight.saveProject();
    return Array.from(new Uint8Array(await f.arrayBuffer()));
  });
  const p = await unpackProject(new Uint8Array(file));
  expect(p.versions!.map((v) => v.doc)).toEqual([a, b]);

  // Another photo starts with none.
  await page.locator('header input[type=file]').setInputFiles({ name: 'door.png', mimeType: 'image/png', buffer: encodePng(smallOf('door-flat-crop.jpg', 300)) });
  await page.waitForFunction((s) => (window as any).digilight.getDoc().photo.sha256 !== s, sha(photo));
  await expect(items(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the committed project with versions opens with them, and a tap switches', async ({ page }) => {
  const p = await unpackProject(new Uint8Array(readFileSync(VERSIONED)));
  await page.goto(APP);
  await page.locator('header input[type=file]').setInputFiles(VERSIONED);
  await waitPhoto(page, p.doc.photo.sha256);
  await expect(items(page)).toHaveCount(2);
  await expect(items(page).nth(1)).toHaveClass(/current/);
  await page.locator('[data-version="0"]').click();
  await expect.poll(() => getDoc(page)).toEqual(p.versions![0]!.doc);
});
