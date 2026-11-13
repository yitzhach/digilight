// The Settings window (BUILD.md Phase 6a item 4): copy one photo's settings and paste them onto
// another in one undo step; save a preset and apply it in one tap; keep presets in a file and
// in the browser across a reload.

import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const FIX = new URL('../fixtures/', import.meta.url).pathname;
const open = async (page: Page, file: string) => {
  const was = await page.evaluate(() => { try { return (window as any).digilight.getDoc().photo.sha256; } catch { return null; } });
  await page.locator('header input[type=file]').setInputFiles(FIX + file);
  await page.waitForFunction((w) => { try { return (window as any).digilight.getDoc().photo.sha256 !== w; } catch { return false; } }, was, { timeout: 30_000 });
};
const getDoc = (page: Page) => page.evaluate(() => (window as any).digilight.getDoc());
const settings = (page: Page) => page.getByRole('dialog', { name: 'Settings' });
const openSettings = async (page: Page) => {
  await page.getByRole('button', { name: 'Settings…' }).click();
  await expect(settings(page)).toBeVisible();
};
const lighting = (d: any) => ({ ambient: d.ambient, lights: d.lights, tone: d.tone, finish: d.finish });

test('copy and paste settings onto another photo; a preset in one tap; presets in a file', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:5180/');
  await open(page, 'door-flat-crop.jpg');
  await page.locator('[data-look="dramatic"]').click();
  await page.evaluate(() => (window as any).digilight.set({ 'finish.contrast': 0.3, 'finish.vignette': 0.4 }));
  const first = await getDoc(page);

  await openSettings(page);
  await settings(page).getByRole('button', { name: 'Copy settings' }).click();
  await settings(page).getByRole('button', { name: 'Close' }).click();

  await open(page, 'lintel-flat-crop.jpg');
  const fresh = await getDoc(page);
  await openSettings(page);
  await settings(page).getByRole('button', { name: 'Paste settings' }).click();
  await expect(settings(page)).toHaveCount(0); // closes once pasted
  const pasted = await getDoc(page);
  expect(pasted.photo).toEqual(fresh.photo);
  expect(lighting(pasted)).toEqual(lighting(first));
  await page.evaluate(() => (window as any).digilight.undo()); // one step
  expect(await getDoc(page)).toEqual(fresh);
  await page.evaluate(() => (window as any).digilight.redo());

  // Save it as a preset, open a third photo, apply it in one tap.
  await openSettings(page);
  await settings(page).getByLabel('Preset name').fill('Dark wall');
  await settings(page).getByRole('button', { name: 'Save settings' }).click();
  await expect(settings(page).getByRole('button', { name: 'Dark wall', exact: true })).toBeVisible();
  await settings(page).getByRole('button', { name: 'Close' }).click();
  await open(page, 'closeup-flat.jpg');
  await openSettings(page);
  await settings(page).getByRole('button', { name: 'Dark wall', exact: true }).click();
  expect(lighting(await getDoc(page))).toEqual(lighting(first));

  // The presets file: saved, the preset deleted, loaded back.
  await openSettings(page);
  const dl = page.waitForEvent('download');
  await settings(page).getByRole('button', { name: 'Save presets to a file' }).click();
  const file = (await (await dl).path())!;
  expect(JSON.parse(readFileSync(file, 'utf8')).presets.map((p: any) => p.name)).toEqual(['Dark wall']);
  await settings(page).getByRole('button', { name: 'Delete Dark wall' }).click();
  await expect(settings(page).getByText('No presets yet.')).toBeVisible();
  await settings(page).locator('input[type=file]').setInputFiles(file);
  await expect(settings(page).getByRole('button', { name: 'Dark wall', exact: true })).toBeVisible();

  // The browser keeps them across a reload, and Paste still has the copied settings.
  await page.reload();
  await expect(page.locator('.look canvas:not(.loading)').first()).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => (window as any).digilight.reset());
  await openSettings(page);
  await expect(settings(page).getByRole('button', { name: 'Dark wall', exact: true })).toBeVisible();
  await settings(page).getByRole('button', { name: 'Paste settings' }).click();
  expect(lighting(await getDoc(page))).toEqual(lighting(first));
  expect(errors).toEqual([]);
});

test('on a phone the Settings window fits and opens from the Export tab', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:5180/');
  await open(page, 'door-flat-crop.jpg');
  await page.locator('.tabs button', { hasText: 'Export' }).click();
  await openSettings(page);
  const box = (await settings(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: test.info().outputPath('phone-settings.png') });
});
