// Photos from Isaac's iPhone (BUILD.md Phase 5b item 10): a Display P3 photo keeps its profile
// through export and a neutral export equals the decoded pixels; a JPEG with EXIF rotation opens
// upright; a HEIC opens through libheif (Chromium cannot open HEIC itself, so this reaches that
// path). The HEIC test waits for the file (fixtures/*.heic) and is skipped until it is there.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { loadFixture, FIXTURES } from '../packages/core/scripts/jpeg.ts';

const APP = 'http://localhost:5180/';
const file = (name: string) => readFileSync(new URL(name, FIXTURES));

async function open(page: Page, name: string, mimeType: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(APP);
  await page.locator('input[type=file]').setInputFiles({ name, mimeType, buffer: file(name) });
  await expect(page.locator('[data-look="gallery"]')).toBeVisible({ timeout: 60_000 });
  return errors;
}

test('Display P3: the photo opens as P3, a neutral export equals its decoded pixels and keeps the profile', async ({ page }) => {
  const errors = await open(page, 'lintel-iphone-p3.jpg', 'image/jpeg');
  const r = await page.evaluate(async () => {
    const dl = (window as any).digilight;
    const hex = async (b: BufferSource) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', b)), (x) => x.toString(16).padStart(2, '0')).join('');
    /** A file's pixels read into a Display P3 canvas, as the app reads a P3 photo. */
    const p3 = async (blob: Blob) => {
      const bmp = await createImageBitmap(blob), c = new OffscreenCanvas(bmp.width, bmp.height);
      const g = c.getContext('2d', { colorSpace: 'display-p3' }) as OffscreenCanvasRenderingContext2D;
      g.drawImage(bmp, 0, 0);
      const d = g.getImageData(0, 0, bmp.width, bmp.height, { colorSpace: 'display-p3' }).data;
      for (let i = 3; i < d.length; i += 4) d[i] = 255;
      return d;
    };
    const png = await dl.export({ format: 'png' }), jpg = await dl.export({ format: 'jpeg', quality: 0.95 });
    const jpgBytes = new Uint8Array(await jpg.blob.arrayBuffer());
    let icc = false; // an APP2 ICC_PROFILE segment in the JPEG
    for (let i = 0; i + 13 < jpgBytes.length && i < 65536; i++) if (jpgBytes[i] === 0xff && jpgBytes[i + 1] === 0xe2 && String.fromCharCode(...jpgBytes.subarray(i + 4, i + 15)) === 'ICC_PROFILE') { icc = true; break; }
    return {
      space: dl.getDoc().photo.space,
      exported: png.record.picture.pixelsSha256, pngBack: await hex(await p3(png.blob)), icc,
      sizes: [png.record.picture.width, png.record.picture.height],
    };
  });
  expect(r.space).toBe('display-p3');
  expect(r.sizes).toEqual([1512, 2016]);
  // The PNG read back as P3 is the export, byte for byte: the profile came along.
  expect(r.pngBack).toBe(r.exported);
  expect(r.icc).toBe(true);
  // And the neutral export is the photo as decoded: the pixels the app opened.
  const decoded = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' })), c = new OffscreenCanvas(bmp.width, bmp.height);
    const g = c.getContext('2d', { colorSpace: 'display-p3' }) as OffscreenCanvasRenderingContext2D;
    g.drawImage(bmp, 0, 0);
    const d = g.getImageData(0, 0, bmp.width, bmp.height, { colorSpace: 'display-p3' }).data;
    for (let i = 3; i < d.length; i += 4) d[i] = 255;
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', d)), (x) => x.toString(16).padStart(2, '0')).join('');
  }, file('lintel-iphone-p3.jpg').toString('base64'));
  expect(r.exported).toBe(decoded);
  expect(errors).toEqual([]);
});

test('a JPEG with EXIF rotation opens upright', async ({ page }) => {
  const errors = await open(page, 'door-exif-rotated.jpg', 'image/jpeg');
  // The stored pixels (jpeg-js ignores EXIF) turned a quarter clockwise: what the file shows.
  const s = loadFixture('door-exif-rotated.jpg'), W = s.height, H = s.width, up = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const from = ((s.height - 1 - x) * s.width + y) * 4, to = (y * W + x) * 4;
    for (let c = 0; c < 4; c++) up[to + c] = s.data[from + c]!;
  }
  const diff = await page.evaluate((b64) => {
    const want = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const { image } = (window as any).digilight.render();
    if (image.data.length !== want.length) return { size: [image.width, image.height] };
    let sum = 0;
    for (let i = 0; i < want.length; i++) sum += Math.abs(image.data[i] - want[i]!);
    return { size: [image.width, image.height], mean: sum / want.length };
  }, Buffer.from(up).toString('base64'));
  expect(diff.size).toEqual([W, H]);
  expect(diff.mean).toBeLessThan(2); // two JPEG decoders: within a level or so
  expect(errors).toEqual([]);
});

const heic = existsSync(FIXTURES) ? readdirSync(FIXTURES).find((f) => /\.hei[cf]$/i.test(f)) : undefined;
test('a HEIC from the iPhone opens through libheif', async ({ page }) => {
  test.skip(!heic, 'waits for a full-size HEIC of Isaac\'s own piece in fixtures/');
  test.setTimeout(180_000);
  const errors = await open(page, heic!, 'image/heic');
  const d = await page.evaluate(() => (window as any).digilight.getDoc());
  expect(d.photo.width * d.photo.height).toBeGreaterThan(8_000_000); // full size, not a preview
  await expect(page.locator('.notice.error')).toHaveCount(0);
  expect(errors).toEqual([]);
});
