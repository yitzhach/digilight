// A light's handle on the picture (BUILD.md §8): double-click switches it off and on, the wheel
// over it changes its brightness (one undo step), Delete removes the selected light. A press
// captures the pointer, so browsers send the click and double-click to the picture's svg, not
// the handle (found 11-23: double-click did nothing).

import { expect, test, type Page } from '@playwright/test';

const APP = 'http://localhost:5180/';
const FIX = new URL('../fixtures/', import.meta.url).pathname;
const getDoc = (page: Page) => page.evaluate(() => (window as any).digilight.getDoc());

test('a handle: double-click switches the light off and on, the wheel sets brightness, Delete removes it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(APP);
  await page.locator('header input[type=file]').setInputFiles(FIX + 'door-flat-crop.jpg');
  await page.waitForFunction(() => { try { return !!(window as any).digilight.getDoc().photo.sha256; } catch { return false; } }, null, { timeout: 30_000 });
  await page.locator('[data-look="spotlight"]').click();
  const at = async () => {
    const r = (await page.locator('.handle circle:not(.hit)').first().boundingBox())!;
    return [r.x + r.width / 2, r.y + r.height / 2] as const;
  };
  let [x, y] = await at();
  await page.mouse.dblclick(x, y);
  await expect.poll(async () => (await getDoc(page)).lights[0].on).toBe(false);
  await expect(page.locator('.handle.off')).toHaveCount(1);
  await page.mouse.dblclick(x, y);
  await expect.poll(async () => (await getDoc(page)).lights[0].on).toBe(true);

  // The wheel over the handle: brighter, committed once it stops, one undo step.
  const before = (await getDoc(page)).lights[0].intensity;
  [x, y] = await at();
  await page.mouse.move(x, y);
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -100);
  await expect.poll(async () => (await getDoc(page)).lights[0].intensity, { timeout: 5_000 }).toBeGreaterThan(before);
  await page.evaluate(() => (window as any).digilight.undo());
  expect((await getDoc(page)).lights[0].intensity).toBe(before);

  await page.keyboard.press('Delete');
  await expect.poll(async () => (await getDoc(page)).lights.length).toBe(0);
  expect(errors).toEqual([]);
});
