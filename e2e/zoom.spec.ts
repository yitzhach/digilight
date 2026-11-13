// Zoom out, Fit and Zoom in (BUILD.md §8, Phase 6a item 3): the buttons, the keys and the wheel,
// measured on what is drawn. The picture's edges are read from a screenshot of the stage (the
// stage's own colour ends where the photo starts), so the preview and the geometry agree.

import { expect, test, type Page } from '@playwright/test';
import { neutralDoc, render } from 'core';
import { loadFixture } from '../packages/core/scripts/jpeg.ts';
import { encodePng } from './png.ts';

const APP = 'http://localhost:5180/';
const src = loadFixture('door-flat-crop.jpg');
const photo = render(src, neutralDoc({ width: src.width, height: src.height, space: 'srgb', sha256: src.sha256 }), { width: 800 });
const png = encodePng(photo), aspect = photo.height / photo.width;

async function open(page: Page) {
  await page.goto(APP);
  await page.locator('input[type=file]').setInputFiles({ name: 'door.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('[data-look="gallery"]')).toBeVisible();
}

/** The picture's box on the stage, in CSS pixels from the stage's corner, and the stage's size. */
async function drawn(page: Page) {
  const shot = await page.locator('.stage').screenshot();
  return page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d')!;
    g.drawImage(bmp, 0, 0);
    const d = g.getImageData(0, 0, bmp.width, bmp.height).data, w = bmp.width, h = bmp.height;
    // The stage is #111113; the photo differs from it. The outermost pixels are left out: the
    // top bar's border shares the first row.
    const lit = (x: number, y: number) => { const i = (y * w + x) * 4; return Math.abs(d[i]! - 17) + Math.abs(d[i + 1]! - 17) + Math.abs(d[i + 2]! - 19) > 24; };
    let left = w, right = -1, top = h, bottom = -1;
    for (const f of [0.3, 0.4, 0.5]) {
      const y = Math.round(h * f), x = Math.round(w * f);
      for (let i = 2; i < w - 2; i++) if (lit(i, y)) { left = Math.min(left, i); right = Math.max(right, i + 1); }
      for (let j = 2; j < h - 2; j++) if (lit(x, j)) { top = Math.min(top, j); bottom = Math.max(bottom, j + 1); }
    }
    return { left, right, top, bottom, w, h, width: right - left, height: bottom - top };
  }, shot.toString('base64'));
}

const fitWidth = (w: number, h: number) => 0.9 * Math.min(w, h / aspect);
const wideWidth = (w: number, h: number) => Math.min(w / 2, h / (aspect + 1));
const out = (page: Page) => page.getByRole('button', { name: 'Zoom out' });
const fitButton = (page: Page) => page.getByRole('button', { name: 'Fit', exact: true });
const zoomIn = (page: Page) => page.getByRole('button', { name: 'Zoom in' });
/** Waits for the redraw, then checks the picture's drawn width (within 2 px). */
const width = async (page: Page, want: number) => { await expect.poll(async () => Math.abs((await drawn(page)).width - want), { timeout: 10_000 }).toBeLessThanOrEqual(2); };

test('zoom: a photo opens fitted; the buttons and keys step in, out and back to Fit', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  // Fitted: 5% of the stage free on the tight side, centred.
  const a = await drawn(page), fw = fitWidth(a.w, a.h), ww = wideWidth(a.w, a.h);
  await width(page, fw);
  const f = await drawn(page);
  expect(Math.abs(f.height - fw * aspect)).toBeLessThanOrEqual(2);
  expect(Math.abs(f.left + f.right - f.w)).toBeLessThanOrEqual(2);
  expect(Math.abs(f.top + f.bottom - f.h)).toBeLessThanOrEqual(2);
  expect(Math.min(f.top / f.h, f.left / f.w)).toBeCloseTo(0.05, 2);
  await expect(fitButton(page)).toBeDisabled();

  // Zoom in: 1.5 times a press; the Fit button brings it back.
  await zoomIn(page).click();
  await width(page, Math.min(a.w, fw * 1.5));
  await expect(fitButton(page)).toBeEnabled();
  await fitButton(page).click();
  await width(page, fw);

  // Zoom out: the lamps' margin (half a picture width all round), and no further.
  await out(page).click();
  await width(page, ww);
  const wide = await drawn(page);
  expect(Math.min(wide.left, wide.top)).toBeGreaterThanOrEqual(ww / 2 - 2);
  await expect(out(page)).toBeDisabled();
  await zoomIn(page).click();
  await width(page, fw);
  await expect(fitButton(page)).toBeDisabled();

  // The keys: = and - step, 0 fits; with Ctrl they stay the browser's.
  await page.keyboard.press('=');
  await page.keyboard.press('=');
  await expect(fitButton(page)).toBeEnabled();
  await page.keyboard.press('-');
  await width(page, Math.min(a.w, fw * 1.5));
  await page.keyboard.press('0');
  await width(page, fw);
  await page.keyboard.press('Control+-');
  await expect(fitButton(page)).toBeDisabled();
  await page.keyboard.press('-');
  await width(page, ww);
  await page.keyboard.press('0');
  await width(page, fw);

  // To the most: 8 screen pixels for each of the photo's, then Zoom in has nothing left.
  for (let i = 0; i < 12 && await zoomIn(page).isEnabled(); i++) await zoomIn(page).click();
  await expect(zoomIn(page)).toBeDisabled();
  await page.keyboard.press('0');
  await width(page, fw);
  expect(errors).toEqual([]);
});

test('zoom: the wheel goes out to the lamps and no further; a drag pans but never loses the picture', async ({ page }) => {
  await open(page);
  const a = await drawn(page), fw = fitWidth(a.w, a.h), ww = wideWidth(a.w, a.h);
  const box = (await page.locator('.stage').boundingBox())!;
  await page.mouse.move(box.x + 60, box.y + 60);
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 200);
  await width(page, ww);
  const wide = await drawn(page);
  expect(Math.abs(wide.left + wide.right - wide.w)).toBeLessThanOrEqual(2);
  await expect(out(page)).toBeDisabled();

  // At Fit, dragging the empty stage far to the right stops where the widest view's edge is.
  await page.keyboard.press('0');
  await width(page, fw);
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + 20 + 80 * i, box.y + 20);
  await page.mouse.up();
  // The widest view shows a.w / ww picture widths; its left edge stays the view's left edge.
  const left = (a.w / ww - 1) / 2 * fw;
  await expect.poll(async () => Math.abs((await drawn(page)).left - left), { timeout: 10_000 }).toBeLessThanOrEqual(2);
  await fitButton(page).click();
  await width(page, fw);
});

test('zoom on a phone: the picture fills the stage, the buttons are finger-sized and off the picture, a lamp past the edge sits at it', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await open(page);
  const a = await drawn(page), fw = fitWidth(a.w, a.h), ww = wideWidth(a.w, a.h);
  await width(page, fw);
  const f = await drawn(page);
  expect(fw).toBeGreaterThan(0.6 * a.w); // it was a third of the screen's width
  const stage = (await page.locator('.stage').boundingBox())!;
  for (const b of [out(page), fitButton(page), zoomIn(page)]) {
    const r = (await b.boundingBox())!;
    expect(Math.min(r.width, r.height)).toBeGreaterThanOrEqual(40);
    expect(r.x - stage.x).toBeGreaterThanOrEqual(f.right); // beside the fitted picture, not on it
  }
  // Spotlight's lamp stands above the picture: at Fit its handle is at the stage's edge,
  // zoomed out it is in place over the picture.
  await page.locator('[data-look="spotlight"]').tap();
  const handleY = async () => { const r = (await page.locator('.handle circle:not(.hit)').first().boundingBox())!; return r.y + r.height / 2 - stage.y; };
  expect(await handleY()).toBeCloseTo(14, 0);
  await out(page).tap();
  const top = (a.h - ww * aspect) / 2, lampY = a.h / 2 - 0.75 * aspect * ww;
  await expect.poll(handleY).toBeCloseTo(lampY, 0);
  expect(lampY).toBeGreaterThan(14);
  expect(lampY).toBeLessThan(top);
  await ctx.close();
});
