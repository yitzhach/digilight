// Versions (BUILD.md Phase 6b item 2, D-078): Keep this version puts the lighting in the strip
// under the picture; a tap goes back to it in one undo step; press and hold shows it on the
// picture until released and changes nothing; the strip comes back after a reload, and a
// project carries its versions.

import { expect, test, type Page } from '@playwright/test';

const APP = 'http://localhost:5180/';
const FIX = new URL('../fixtures/', import.meta.url).pathname;
const getDoc = (page: Page) => page.evaluate(() => (window as any).digilight.getDoc());
const waitPhoto = (page: Page, not: string | null) =>
  page.waitForFunction((w) => { try { return (window as any).digilight.getDoc().photo.sha256 !== w; } catch { return false; } }, not, { timeout: 60_000 });
const thumbs = (page: Page) => page.locator('.version-thumb');
const keep = (page: Page) => page.getByRole('button', { name: 'Keep this version' });
const picture = (page: Page) => page.locator('.stage canvas').screenshot();

test('keep versions, tap to go back, hold to compare; they come back after a reload', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(APP);
  await page.locator('header input[type=file]').setInputFiles(FIX + 'door-flat-crop.jpg');
  await waitPhoto(page, null);
  await expect(page.locator('.versions .hint')).toBeVisible();

  await page.locator('[data-look="spotlight"]').click();
  await keep(page).click();
  const spot = await getDoc(page);
  await page.locator('[data-look="original"]').click();
  await page.evaluate(() => (window as any).digilight.set({ 'finish.contrast': 0.3 }));
  await keep(page).click();
  const plain = await getDoc(page);
  await expect(thumbs(page)).toHaveCount(2);
  await expect(page.locator('.version-item.current [data-version="2"]')).toBeVisible();
  await expect(page.locator('.version-thumb canvas.loading')).toHaveCount(0); // thumbnails made
  await keep(page).click(); // the same again is not kept twice
  await expect(thumbs(page)).toHaveCount(2);

  // A tap goes back to version 1 in one undo step.
  await page.locator('[data-version="1"]').click();
  const back = await getDoc(page);
  expect(back).toEqual(spot);
  await expect(page.locator('.version-item.current [data-version="1"]')).toBeVisible();
  await page.evaluate(() => (window as any).digilight.undo());
  expect(await getDoc(page)).toEqual(plain);
  await page.evaluate(() => (window as any).digilight.redo());

  // Holding version 2 shows it on the picture (no lamp handles) until released; nothing changes.
  await page.waitForTimeout(500);
  const onSpot = await picture(page);
  await expect(page.locator('.stage .handle')).toHaveCount(1);
  const box = (await page.locator('[data-version="2"]').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await expect(page.locator('.stage .handle')).toHaveCount(0);
  const held = await picture(page);
  await page.mouse.up();
  await page.waitForTimeout(500);
  expect(held.equals(onSpot)).toBe(false);
  expect(await getDoc(page)).toEqual(spot); // the hold switched nothing
  await expect(page.locator('.stage .handle')).toHaveCount(1);
  expect((await picture(page)).equals(onSpot)).toBe(true);

  // The strip is kept with the autosave; × removes the version the picture is now.
  await page.waitForTimeout(600); // the autosave waits 400 ms
  await page.reload();
  await waitPhoto(page, null);
  await expect(thumbs(page)).toHaveCount(2);
  await expect(page.locator('.version-item.current [data-version="1"]')).toBeVisible();
  await page.getByRole('button', { name: 'Remove version 1' }).click();
  await expect(thumbs(page)).toHaveCount(1);
  expect(await getDoc(page)).toEqual(spot); // the picture stays as it is
  expect(errors).toEqual([]);
});

test('a project opens with its versions; a new photo starts with none', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(APP);
  await page.locator('header input[type=file]').setInputFiles(FIX + 'projects/versions-lintel.digilight');
  await waitPhoto(page, null);
  await expect(thumbs(page)).toHaveCount(3);
  await expect(page.locator('.version-item.current [data-version="2"]')).toBeVisible();
  await page.locator('[data-version="3"]').click();
  expect((await getDoc(page)).relief).toMatchObject({ mode: 'estimated', depth: 0.006 });
  const was = (await getDoc(page)).photo.sha256;
  await page.locator('header input[type=file]').setInputFiles(FIX + 'door-flat-crop.jpg');
  await waitPhoto(page, was);
  await expect(thumbs(page)).toHaveCount(0);
});
