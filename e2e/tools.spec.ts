// Light tools (BUILD.md §5.12, docs/light-tools.md): the preview against the reference with each
// tool on, to §5.11's tolerance (99% of channel values within 2 levels, none beyond 6). One
// block per tool, marked tool:<id>: removing a tool removes its block.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { estimatedRelief, glowMaps, guardKappa, neutralDoc, parseDoc, render, TOOLS, withLook, type Doc, type Image } from 'core';
import { loadFixture } from '../packages/core/scripts/jpeg.ts';
import { encodePng } from './png.ts';

const photo = loadFixture('lintel-flat-crop.jpg'), WIDTH = 1024;
const b64 = (a: { buffer: ArrayBufferLike; byteOffset: number; byteLength: number }) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
const full = neutralDoc({ width: photo.width, height: photo.height, space: 'srgb', sha256: photo.sha256 });
const small: Image = render(photo, full, { width: WIDTH }); // the photo as the reference resizes it

async function open(page: Page) {
  await page.goto('http://localhost:5179/');
  await page.waitForFunction(() => 'harness' in window);
  await page.evaluate(([p, w, h]) => (window as any).harness.init(p, w, h, 'srgb'), [b64(small.data), small.width, small.height] as const);
}
async function check(page: Page, name: string, doc: Doc, kappa: number, ref: Image, opts: object = {}) {
  const r = await page.evaluate(([d, k, o]) => (window as any).harness.draw(d, k, o), [doc, kappa, opts] as const);
  expect(r.error, 'WebGL error').toBe(0);
  const got = Buffer.from(r.pixels, 'base64');
  expect(got.length).toBe(ref.data.length);
  let n = 0, w2 = 0, max = 0;
  for (let p = 0; p < ref.data.length; p += 4) for (let c = 0; c < 3; c++) { const d = Math.abs(got[p + c]! - ref.data[p + c]!); n++; if (d <= 2) w2++; if (d > max) max = d; }
  console.log(`${name.padEnd(34)} kappa ${kappa.toFixed(3)}  within 2: ${(100 * w2 / n).toFixed(3)}%  max ${max}`);
  expect(w2 / n, name).toBeGreaterThanOrEqual(0.99);
  expect(max, name).toBeLessThanOrEqual(6);
}

// tool:bounce, tool:roomside (§5.12.1, §5.12.2): with Texture on, maps made by core in the page.
test('parity: softer shadows (bounce light, room light from one side)', async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as any).harness.reliefCPU());
  const base = neutralDoc({ width: small.width, height: small.height, space: 'srgb', sha256: photo.sha256 });
  const tex = (d: Doc, r: Partial<Doc['relief']>) => parseDoc({ ...d, relief: { ...d.relief, mode: 'estimated', depth: 0.006, shadows: 1, ...r } });
  const mix = parseDoc({ ...base, ambient: { level: 0.4, kelvin: 5200 }, lights: [
    { id: 'a', pos: [0.15, -0.3, 0.7], aim: [0.35, 0.4], intensity: 0.7, kelvin: 3200, cone: 40, edge: 0, falloff: 1 },
    { id: 'b', kind: 'sun', azimuth: 135, elevation: 12, intensity: 0.5, kelvin: 6000, size: 0.02 },
  ] });
  const docs: Record<string, Doc> = {
    'raking-left, bounce 1': tex(withLook(base, 'raking-left'), { bounce: 1 }),
    'gallery, room side 1 from the left': tex(withLook(base, 'gallery'), { roomSide: 1, roomFrom: 180 }),
    'sun and lamp, bounce and room side': tex(mix, { bounce: 0.7, roomSide: 0.6, roomFrom: 40, ao: 0.8 }),
  };
  const maps = estimatedRelief(small);
  for (const [name, doc] of Object.entries(docs)) {
    const kappa = guardKappa(small, doc);
    await check(page, name, doc, kappa, render(small, doc, { kappa, relief: maps }));
  }
});

// tool:glow (§5.12.3): the preview is given the reference's own maps, as the app's worker makes them.
test('parity: glow', async ({ page }) => {
  await open(page);
  const lit = withLook(full, 'spotlight');
  const docs: Record<string, Doc> = {
    'glow, no lights': parseDoc({ ...full, finish: { glow: 0.5 } }),
    'spotlight, glow 0.6': parseDoc({ ...lit, finish: { glow: 0.6 } }),
    'spotlight, wide warm glow, finish': parseDoc({ ...lit, finish: { glow: 1, glowSpread: 1, glowWarmth: 0.7, exposure: 0.3, contrast: 0.4, vignette: 0.5 } }),
    'dramatic, tight glow': parseDoc({ ...withLook(full, 'dramatic'), finish: { glow: 0.8, glowSpread: 0 } }),
  };
  for (const [name, doc] of Object.entries(docs)) {
    const kappa = guardKappa(photo, doc), m = glowMaps(photo, doc, kappa);
    const glow = { width: m.width, height: m.height, near: b64(m.near), far: b64(m.far) };
    await check(page, name, doc, kappa, render(photo, doc, { width: WIDTH, kappa }), { glow });
  }
});

// tool:gel (§5.12.4): colours reach the preview prepared, so the shader is unchanged.
test('parity: colour filter', async ({ page }) => {
  await open(page);
  const base = withLook(full, 'gallery'), lamp = base.lights[0]!;
  const docs: Record<string, Doc> = {
    'gallery, amber filter 0.7': parseDoc({ ...base, lights: [{ ...lamp, gel: 0.7, gelHue: 35 }] }),
    'gallery, full blue filter': parseDoc({ ...base, lights: [{ ...lamp, gel: 1, gelHue: 240 }] }),
    'red lamp, green sun, finish': parseDoc({ ...base, lights: [{ ...lamp, gel: 0.6, gelHue: 0 }, { id: 'b', kind: 'sun', intensity: 0.4, gel: 0.5, gelHue: 120 }],
      finish: { contrast: 0.3, warmth: -0.4 } }),
  };
  for (const [name, doc] of Object.entries(docs)) {
    const kappa = guardKappa(photo, doc);
    await check(page, name, doc, kappa, render(photo, doc, { width: WIDTH, kappa }));
  }
});

// The app itself: the panel builds a tool's controls from the schema (no interface code); Glow's
// maps reach the picture through the guard's worker (tool:glow); the export is the reference's.
test('app: the tools show under Expert controls, glow reaches the picture, the export is the reference', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = render(photo, full, { width: 600 }), png = encodePng(shot);
  const sha = (b: Uint8Array | Uint8ClampedArray) => createHash('sha256').update(b).digest('hex');
  await page.goto('http://localhost:5180/');
  await page.locator('input[type=file]').setInputFiles({ name: 'lintel.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('[data-look="spotlight"]')).toBeVisible();
  const dl = <T>(f: string, ...a: unknown[]) => page.evaluate(([n, args]) => (window as any).digilight[n as string](...(args as unknown[])), [f, a] as const) as Promise<T>;
  const section = (name: string) => page.locator('section', { has: page.getByRole('heading', { name }) });

  // Every listed tool's settings are expert: in no simple panel, and under Expert controls each
  // has its slider (a slider's id is its setting's path), with the schema's label.
  const settings = await dl<{ path: string; tier: string; label: string }[]>('describe');
  const paths = (group: string) => TOOLS.flatMap((t) => t.paths).filter((p) => p.startsWith(group));
  const slider = (name: string, path: string) => section(name).locator(`[id="s-${path}"]`);
  expect(paths('finish.').map((p) => settings.find((s) => s.path === p)!.label)).toEqual(['Glow', 'Glow spread', 'Glow warmth']);
  for (const p of paths('finish.')) await expect(slider('Finish', p)).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Expert controls' }).check();
  for (const p of paths('finish.')) await expect(slider('Finish', p)).toHaveCount(1);
  await expect(section('Finish').locator('label[for="s-finish.glowSpread"]')).toContainText('Glow spread');
  for (const p of paths('relief.')) await expect(slider('Texture', p)).toHaveCount(0); // Texture's tools show with Texture on
  await page.getByRole('checkbox', { name: 'Texture', exact: true }).check();
  expect(paths('relief.').length).toBe(3);
  for (const p of paths('relief.')) await expect(slider('Texture', p)).toHaveCount(1);
  await slider('Texture', 'relief.bounce').fill('0.5');
  expect((await dl<Doc>('getDoc')).relief.bounce).toBe(0.5);
  // A light's tools show under that light (tool:gel).
  await page.locator('[data-look="spotlight"]').click();
  for (const p of TOOLS.flatMap((t) => t.paths).filter((q) => q.startsWith('lights.'))) await expect(slider('Lights', p)).toHaveCount(1);
  await slider('Lights', 'lights.0.gel').fill('0.4');
  expect((await dl<Doc>('getDoc')).lights[0]!.gel).toBe(0.4);
  await dl('reset');

  // Glow: the picture changes once the worker's maps arrive.
  await page.locator('[data-look="spotlight"]').click();
  const picture = async () => { await page.waitForTimeout(400); return page.locator('.stage canvas').screenshot(); };
  const plain = await picture();
  await slider('Finish', 'finish.glow').fill('0.8');
  expect((await dl<Doc>('getDoc')).finish.glow).toBe(0.8);
  await expect.poll(async () => (await picture()).equals(plain), { timeout: 20_000 }).toBe(false);
  const glowing = await picture();
  await dl('undo');
  await expect.poll(async () => (await picture()).equals(plain), { timeout: 20_000 }).toBe(true); // and goes with it
  await dl('redo');
  await expect.poll(async () => (await picture()).equals(glowing), { timeout: 20_000 }).toBe(true);

  // The export is the reference renderer's picture, glow included.
  await page.locator('[data-format="png"]').click();
  const downloads: import('@playwright/test').Download[] = [];
  const two = new Promise<void>((done) => page.on('download', (d) => { downloads.push(d); if (downloads.length === 2) done(); }));
  await page.locator('[data-action="download"]').click();
  await two;
  const files = await Promise.all(downloads.map(async (d) => ({ name: d.suggestedFilename(), bytes: readFileSync((await d.path())!) })));
  const rec = JSON.parse(files.find((f) => f.name.endsWith('.json'))!.bytes.toString());
  expect(parseDoc(rec.document).finish.glow).toBe(0.8);
  expect(rec.picture.pixelsSha256).toBe(sha(render(shot, parseDoc(rec.document)).data));
  expect(errors).toEqual([]);
});
