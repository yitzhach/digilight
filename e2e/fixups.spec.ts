// Phase 5b's bugs in the running app (BUILD.md §10 Phase 5b, items 1 to 8): one test each where
// a unit test cannot reach (core's lookOf, load, render width and the map rebuild have their own).

import { expect, test, type Page } from '@playwright/test';
import { neutralDoc, render } from 'core';
import { loadFixture } from '../packages/core/scripts/jpeg.ts';
import { encodePng } from './png.ts';

const APP = 'http://localhost:5180/';
const src = loadFixture('door-flat-crop.jpg');
const png = encodePng(render(src, neutralDoc({ width: src.width, height: src.height, space: 'srgb', sha256: src.sha256 }), { width: 800 }));
const dl = (page: Page) => ({
  getDoc: () => page.evaluate(() => (window as any).digilight.getDoc()),
});

async function open(page: Page) {
  await page.goto(APP);
  await page.locator('input[type=file]').setInputFiles({ name: 'door.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('[data-look="gallery"]')).toBeVisible();
}

test('1. the look comes from the document: moved by hand greys Strength; Undo and a reload show the right look', async ({ page }) => {
  await open(page);
  await page.locator('[data-look="gallery"]').click();
  const strength = page.locator('#look-strength');
  await strength.fill('60');
  await strength.dispatchEvent('change');
  await expect(page.locator('.look.current')).toHaveAttribute('data-look', 'gallery');
  // Move the lamp by hand.
  const box = (await page.locator('.handle circle:not(.hit)').first().boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  for (let i = 1; i <= 5; i++) await page.mouse.move(x - 10 * i, y + 8 * i);
  await page.mouse.up();
  await expect(strength).toBeDisabled();
  await expect(page.locator('label[for=look-strength]')).toContainText('Lights changed by hand');
  await expect(page.locator('.look.current')).toHaveCount(0);
  const moved = (await dl(page).getDoc()).lights[0].pos;
  // Undo: Gallery at 60% again.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.look.current')).toHaveAttribute('data-look', 'gallery');
  await expect(strength).toBeEnabled();
  await expect(strength).toHaveValue('60');
  await page.getByRole('button', { name: 'Redo' }).click();
  // A reload: Strength stays greyed and the lamp stays where the hand put it.
  await page.waitForTimeout(600); // autosave
  await page.reload();
  await expect(strength).toBeDisabled();
  expect((await dl(page).getDoc()).lights[0].pos).toEqual(moved);
});

test('3. on a phone: messages wrap on their own line, a tab starts at its top, a touch 20 px off a handle takes it, hints show', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await open(page);
  // A long message is read whole.
  await page.evaluate(() => { try { (window as any).digilight.set('ambient.level', 9); } catch { /* shown on screen */ } });
  const note = page.locator('.notice.error');
  await expect(note).toContainText('ambient.level');
  const nb = (await note.boundingBox())!, bar = (await page.locator('header.bar').boundingBox())!;
  expect(nb.y).toBeGreaterThanOrEqual(bar.y + bar.height - 1);
  expect(await note.evaluate((e) => e.scrollWidth <= e.clientWidth && getComputedStyle(e).whiteSpace !== 'nowrap')).toBe(true);
  // Scroll the Looks tab down, switch tab: the new tab starts at its top, nothing above the tab row.
  const panel = page.locator('aside.panel');
  await panel.evaluate((e) => { e.scrollTop = e.scrollHeight; });
  await page.locator('.tabs button', { hasText: 'Lights' }).click();
  expect(await panel.evaluate((e) => e.scrollTop)).toBe(0);
  const tabs = (await page.locator('.tabs').boundingBox())!, pb = (await panel.boundingBox())!;
  expect(Math.abs(tabs.y - pb.y)).toBeLessThanOrEqual(1.5);
  // Hints on screen where nothing hovers.
  const hint = await page.locator('.tab.current .control[title]').first().evaluate((e) => getComputedStyle(e, '::after').content);
  expect(hint.length).toBeGreaterThan(10);
  // A touch 20 px from a handle's centre drags it.
  await page.locator('.tabs button', { hasText: 'Looks' }).click();
  await page.locator('[data-look="gallery"]').click();
  const c = (await page.locator('.handle circle:not(.hit)').first().boundingBox())!;
  const x = c.x + c.width / 2 + 20, y = c.y + c.height / 2;
  const before = (await dl(page).getDoc()).lights[0].pos;
  const cdp = await ctx.newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', px: number, py: number) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: px, y: py }] });
  await touch('touchStart', x, y);
  for (let i = 1; i <= 5; i++) await touch('touchMove', x, y + 10 * i);
  await touch('touchEnd', x, y + 50);
  await expect.poll(async () => (await dl(page).getDoc()).lights[0].pos[1]).toBeGreaterThan(before[1]);
  await ctx.close();
});

test('4. Cmd+Z and Ctrl+Z undo, with Shift redo', async ({ page }) => {
  await open(page);
  await page.locator('[data-look="gallery"]').click();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur()); // keys go to the page, not a button
  await page.keyboard.press('Control+z');
  expect((await dl(page).getDoc()).lights).toEqual([]);
  await page.keyboard.press('Control+Shift+z');
  expect((await dl(page).getDoc()).lights.length).toBe(1);
  await page.keyboard.press('Meta+z');
  expect((await dl(page).getDoc()).lights).toEqual([]);
});

test('5. a lost WebGL context is rebuilt and redrawn; an error nothing caught shows as a message', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await page.locator('[data-look="gallery"]').click();
  // What the screen shows (the drawing buffer is not kept, so a screenshot is the way to read it).
  const picture = async () => { await page.waitForTimeout(400); return page.locator('.stage').screenshot(); };
  const shown = await picture();
  await page.evaluate(() => {
    const c = document.querySelector('.stage canvas') as HTMLCanvasElement;
    const ext = c.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    (window as any).ext = ext;
    ext.loseContext();
  });
  expect((await picture()).equals(shown)).toBe(false); // the picture is gone
  await page.evaluate(() => (window as any).ext.restoreContext());
  expect((await picture()).equals(shown)).toBe(true); // and back, the same
  await expect(page.locator('.notice')).toHaveCount(0);
  await page.evaluate(() => setTimeout(() => { throw new Error('nothing caught this'); }));
  await expect(page.locator('.notice.error')).toContainText('nothing caught this');
  expect(errors).toEqual(['nothing caught this']);
});

test('8. an autosaved document the schema no longer accepts says so', async ({ page }) => {
  await open(page);
  await page.locator('[data-look="gallery"]').click();
  await page.waitForTimeout(600); // autosave
  await page.evaluate(() => new Promise<void>((done) => {
    const r = indexedDB.open('digilight', 1);
    r.onsuccess = () => {
      const t = r.result.transaction('autosave', 'readwrite'), s = t.objectStore('autosave'), g = s.get('doc');
      g.onsuccess = () => { s.put({ ...g.result, ambient: { level: 9, kelvin: 6500 } }, 'doc'); };
      t.oncomplete = () => { r.result.close(); done(); };
    };
  }));
  await page.reload();
  await expect(page.locator('.notice.error')).toContainText('could not be reopened');
  expect((await dl(page).getDoc()).lights).toEqual([]);
});

test('2 and 7 through window.digilight: measured with no height, and a width over the photo\'s, are refused', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(async () => {
    const d = (window as any).digilight, out: string[] = [];
    try { d.set('relief.mode', 'measured'); } catch (e) { out.push((e as Error).message); }
    try { await d.export({ width: 5000 }); } catch (e) { out.push((e as Error).message); }
    return { out, mode: d.getDoc().relief.mode };
  });
  expect(r.out[0]).toMatch(/side-lit photo/);
  expect(r.out[1]).toMatch(/photo's 800/);
  expect(r.mode).toBe('off');
});
