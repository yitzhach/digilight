// Projects and Apply to more photos (BUILD.md Phase 6b items 3 to 6). Gate: a project saved and
// reopened exports the same pixel SHA-256; the project committed in this phase opens; photos
// go through "Apply to more photos" equal to the reference renderer.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { estimateHeight, guardKappa, measuredRelief, neutralDoc, parseDoc, render, withLook, withSettings, type Image, type MeasuredHeight } from 'core';
import { loadFixture } from '../packages/core/scripts/jpeg.ts';
import { unpackProject } from '../packages/web/src/io/project.ts';
import { readZip } from '../packages/web/src/io/zip.ts';
import { encodePng } from './png.ts';

const APP = 'http://localhost:5180/';
const FIXTURE = new URL('../fixtures/projects/v1-door.digilight', import.meta.url).pathname;
const sha = (b: Uint8Array | Uint8ClampedArray) => createHash('sha256').update(b).digest('hex');
const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64');
const smallOf = (file: string, width: number): Image => {
  const s = loadFixture(file);
  return render(s, neutralDoc({ width: s.width, height: s.height, space: 'srgb', sha256: s.sha256 }), { width });
};
const getDoc = (page: Page) => page.evaluate(() => (window as any).digilight.getDoc());
/** The picture the app exports now: the SHA-256 of its RGBA pixels. */
const exported = (page: Page) => page.evaluate(async () => (await (window as any).digilight.export({ format: 'png' })).record.picture.pixelsSha256);
const waitPhoto = (page: Page, sha256: string) =>
  page.waitForFunction((s) => { try { return (window as any).digilight.getDoc().photo.sha256 === s; } catch { return false; } }, sha256, { timeout: 60_000 });

test('the committed project opens with its measured texture, and exports the reference picture', async ({ page }) => {
  test.setTimeout(120_000);
  const p = await unpackProject(new Uint8Array(readFileSync(FIXTURE)));
  await page.goto(APP);
  await page.locator('header input[type=file]').setInputFiles(FIXTURE); // the Open button takes projects too
  await waitPhoto(page, p.doc.photo.sha256);
  expect(await getDoc(page)).toEqual(p.doc);
  // The height as the fixture was made (fixtures/projects, project.test.ts), and the reference.
  const small = smallOf('door-flat-crop.jpg', 320), est = estimateHeight(small);
  const lo = p.height!.lo, hi = p.height!.hi;
  const m: MeasuredHeight = { width: est.width, height: est.height, lo, hi, data: Uint16Array.from(est.h, (v) => Math.round((65535 * (v - lo)) / (hi - lo))) };
  const inPage = await page.evaluate(async () => {
    const h = (window as any).digilight.getMeasured();
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', h.data)), (x) => x.toString(16).padStart(2, '0')).join('');
  });
  expect(inPage).toBe(sha(new Uint8Array(m.data.buffer)));
  expect(await exported(page)).toBe(sha(render(small, p.doc, { relief: measuredRelief(m) }).data));
});

test('a project saved and reopened exports the same pixels; the recent list reopens it', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const photo = new Uint8Array(encodePng(smallOf('lintel-flat-crop.jpg', 700)));
  await page.goto(APP);
  await page.locator('header input[type=file]').setInputFiles({ name: 'lintel.png', mimeType: 'image/png', buffer: Buffer.from(photo) });
  await waitPhoto(page, sha(photo));
  await page.locator('[data-look="spotlight"]').click();
  await page.evaluate(() => (window as any).digilight.set({ 'finish.contrast': 0.4, 'finish.vignette': 0.3 }));
  await page.evaluate(() => (window as any).digilight.setRelief({ mode: 'estimated' }));
  const doc = await getDoc(page), before = await exported(page);

  // Save project from the Settings window (a download here), then start again.
  await page.getByRole('button', { name: 'Settings…' }).click();
  const dl = page.waitForEvent('download');
  await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Save project' }).click();
  const file = (await (await dl).path())!;
  expect((await dl).suggestedFilename()).toBe('lintel.digilight');
  await page.reload();
  await page.locator('header input[type=file]').setInputFiles({ name: 'other.png', mimeType: 'image/png', buffer: encodePng(smallOf('door-flat-crop.jpg', 300)) });
  await page.waitForFunction((s) => (window as any).digilight.getDoc().photo.sha256 !== s, sha(photo));

  await page.getByRole('button', { name: 'Settings…' }).click();
  await page.locator('input[data-input="project"]').setInputFiles(file);
  await waitPhoto(page, sha(photo));
  await expect(page.getByRole('dialog', { name: 'Settings' })).toHaveCount(0); // it closes once open
  expect(await getDoc(page)).toEqual(doc);
  expect(await exported(page)).toBe(before);

  // The recent list has it: one tap reopens it over another photo.
  await page.locator('header input[type=file]').setInputFiles({ name: 'other.png', mimeType: 'image/png', buffer: encodePng(smallOf('door-flat-crop.jpg', 300)) });
  await page.waitForFunction((s) => (window as any).digilight.getDoc().photo.sha256 !== s, sha(photo));
  await page.getByRole('button', { name: 'Settings…' }).click();
  await page.getByRole('list', { name: 'Recent projects' }).getByRole('button', { name: 'lintel.digilight' }).click();
  await waitPhoto(page, sha(photo));
  expect(await getDoc(page)).toEqual(doc);
  expect(errors).toEqual([]);
});

test('Apply to more photos: each photo lit alike, equal to the reference; the open photo is untouched', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const main = smallOf('door-flat-crop.jpg', 600), others = [smallOf('lintel-flat-crop.jpg', 500), smallOf('closeup-flat.jpg', 400)];
  await page.goto(APP);
  await page.locator('header input[type=file]').setInputFiles({ name: 'door.png', mimeType: 'image/png', buffer: encodePng(main) });
  await waitPhoto(page, sha(encodePng(main)));
  await page.locator('[data-look="gallery"]').click();
  await page.evaluate(() => (window as any).digilight.set({ 'finish.warmth': 0.3, 'finish.contrast': 0.2 }));
  const doc = parseDoc(await getDoc(page)), before = await exported(page);

  // Through the window: two photos and a file that is not one; a zip comes back.
  await page.getByRole('button', { name: 'Settings…' }).click();
  const dl = page.waitForEvent('download');
  await page.locator('input[data-input="many"]').setInputFiles([
    { name: 'lintel.png', mimeType: 'image/png', buffer: encodePng(others[0]!) },
    { name: 'closeup.png', mimeType: 'image/png', buffer: encodePng(others[1]!) },
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a photo') },
  ]);
  const zip = readZip(new Uint8Array(readFileSync((await (await dl).path())!)));
  expect([...zip.keys()]).toEqual(['lintel-digilight.jpg', 'closeup-digilight.jpg']);
  await expect(page.getByRole('dialog', { name: 'Settings' })).toContainText('could not light notes.txt');

  // The pixels, through the command as PNG: each the reference renderer's, with its own guard.
  const shas = await page.evaluate(async (srcs) => {
    const blobs = srcs.map(([n, b]) => new File([Uint8Array.from(atob(b), (c) => c.charCodeAt(0))], n, { type: 'image/png' }));
    const r = await (window as any).digilight.applyToMore(blobs, { format: 'png' });
    const out: string[] = [];
    const zipBytes = new Uint8Array(await r.zip.arrayBuffer());
    // Each PNG decoded by the browser (the zip read back here by offsets: stored entries).
    const v = new DataView(zipBytes.buffer);
    for (let p = 0; v.getUint32(p, true) === 0x04034b50;) {
      const size = v.getUint32(p + 18, true), n = v.getUint16(p + 26, true), start = p + 30 + n;
      const bmp = await createImageBitmap(new Blob([zipBytes.subarray(start, start + size)], { type: 'image/png' }), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
      const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d')!;
      g.drawImage(bmp, 0, 0);
      const h = await crypto.subtle.digest('SHA-256', g.getImageData(0, 0, bmp.width, bmp.height).data);
      out.push(Array.from(new Uint8Array(h), (x) => x.toString(16).padStart(2, '0')).join(''));
      p = start + size;
    }
    return out;
  }, others.map((o, i) => [`p${i}.png`, b64(encodePng(o))] as [string, string]));
  const settings = { ambient: doc.ambient, lights: doc.lights, tone: doc.tone, finish: doc.finish };
  expect(shas).toEqual(others.map((o) => {
    const d = withSettings(neutralDoc({ width: o.width, height: o.height, space: 'srgb', sha256: sha(encodePng(o)) }), settings, false);
    return sha(render(o, d, { kappa: guardKappa(o, d) }).data);
  }));

  // The open photo and its document are as they were, and export the same picture.
  expect(await getDoc(page)).toEqual(doc);
  expect(await exported(page)).toBe(before);
  expect(errors).toEqual([]);
});
