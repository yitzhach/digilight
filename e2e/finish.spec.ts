// Finish (BUILD.md §5.9, §8 panel section 4; Phase 6a item 1): its sliders set the document in one
// undo step each, and the export is the reference renderer's picture, pixel for pixel.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { neutralDoc, parseDoc, render } from 'core';
import { loadFixture } from '../packages/core/scripts/jpeg.ts';
import { encodePng } from './png.ts';

const src = loadFixture('door-flat-crop.jpg');
const photo = render(src, neutralDoc({ width: src.width, height: src.height, space: 'srgb', sha256: src.sha256 }), { width: 900 });
const png = encodePng(photo);
const sha = (b: Uint8Array | Uint8ClampedArray) => createHash('sha256').update(b).digest('hex');

test('Finish: the sliders set the document, undo steps back, the export is the reference', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:5180/');
  await page.locator('input[type=file]').setInputFiles({ name: 'door.png', mimeType: 'image/png', buffer: png });
  await page.locator('[data-look="gallery"]').click();
  const getDoc = () => page.evaluate(() => (window as any).digilight.getDoc());
  const finish = page.locator('section', { has: page.getByRole('heading', { name: 'Finish' }) });
  for (const [label, t] of [['Brightness', '25'], ['Contrast', '40'], ['Warmth', '-30'], ['Saturation', '20'], ['Vignette', '60']] as const)
    await finish.getByLabel(label).fill(t);
  expect((await getDoc()).finish).toEqual({ exposure: 0.5, contrast: 0.4, warmth: -0.3, saturation: 0.2, vignette: 0.6, grain: 0 });
  await page.evaluate(() => (window as any).digilight.undo());
  expect((await getDoc()).finish.vignette).toBe(0);
  await page.evaluate(() => (window as any).digilight.redo());

  // Grain is expert: it shows with Expert controls on.
  await expect(finish.getByLabel('Grain')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Expert controls' }).check();
  await finish.getByLabel('Grain').fill('0.3');
  expect((await getDoc()).finish.grain).toBe(0.3);

  await page.locator('[data-format="png"]').click();
  const downloads: import('@playwright/test').Download[] = [];
  const two = new Promise<void>((done) => page.on('download', (d) => { downloads.push(d); if (downloads.length === 2) done(); }));
  await page.locator('[data-action="download"]').click();
  await two;
  const files = await Promise.all(downloads.map(async (d) => ({ name: d.suggestedFilename(), bytes: readFileSync((await d.path())!) })));
  const rec = JSON.parse(files.find((f) => f.name.endsWith('.json'))!.bytes.toString());
  expect(rec.picture.pixelsSha256).toBe(sha(render(photo, parseDoc(rec.document)).data));
  expect(errors).toEqual([]);
});

test('on a phone, Finish has its own tab', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:5180/');
  await page.locator('input[type=file]').setInputFiles({ name: 'door.png', mimeType: 'image/png', buffer: png });
  await page.locator('.tabs button', { hasText: 'Finish' }).click();
  await expect(page.getByRole('heading', { name: 'Finish' })).toBeVisible();
  // Five tabs fit across: no tab's name is cut off.
  const cut = await page.locator('.tabs button').evaluateAll((bs) => bs.filter((b) => b.scrollWidth > b.clientWidth).length);
  expect(cut).toBe(0);
  await page.screenshot({ path: test.info().outputPath('phone-finish.png') });
});
