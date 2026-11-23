// Light tools (BUILD.md §5.12, docs/light-tools.md): the preview against the reference with each
// tool on, to §5.11's tolerance (99% of channel values within 2 levels, none beyond 6). One
// block per tool, marked tool:<id>: removing a tool removes its block.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { estimatedRelief, glowMaps, guardKappa, neutralDoc, parseDoc, render, renderWithWall, TOOLS, wallSize, withLook, type Doc, type Image } from 'core';
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

// tool:wall (§5.12.7): the wall drawn round the piece, the canvas sized to the whole picture and
// the view set so its pixels are the reference's (W pixels a picture width, centred).
test('parity: the wall', async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as any).harness.reliefCPU());
  const base = neutralDoc({ width: small.width, height: small.height, space: 'srgb', sha256: photo.sha256 });
  const wall = (d: Doc, w: object = {}) => parseDoc({ ...d, wall: { on: true, ...w } });
  const lit = withLook(base, 'gallery');
  const docs: Record<string, Doc> = {
    'spotlight on the wall': wall(withLook(base, 'spotlight')),
    'gallery, a sun, a window, warm wall, finish': wall(parseDoc({ ...lit, lights: [...lit.lights,
      { id: 's', kind: 'sun', azimuth: 200, elevation: 20, intensity: 0.4, size: 0.05 }, { id: 'w', pos: [1.3, -0.2, 0.5], intensity: 0.6, pattern: 'window', size: 0.3 }],
    finish: { grain: 0.5, vignette: 0.4, contrast: 0.2 } }), { warmth: 0.4, tone: 0.65, standoff: 0.06, margin: 0.4, soft: 0.7 }),
    'dramatic with Texture, a sun, glow': wall(parseDoc({ ...withLook(base, 'dramatic'), relief: { mode: 'estimated' }, finish: { glow: 0.7 },
      lights: [...withLook(base, 'dramatic').lights, { id: 's', kind: 'sun', azimuth: 30, elevation: 35, intensity: 0.3 }] }), { shadow: 1 }),
  };
  const maps = estimatedRelief(small), a = small.height / small.width;
  for (const [name, doc] of Object.entries(docs)) {
    const kappa = guardKappa(small, doc), s = wallSize(doc, small.width, small.height), m = doc.finish.glow > 0 ? glowMaps(small, doc, kappa) : null;
    const zoom = small.width / Math.min(s.width, s.height / a);
    const glow = m ? { width: m.width, height: m.height, near: b64(m.near), far: b64(m.far) } : undefined;
    await check(page, name, doc, kappa, renderWithWall(small, doc, { kappa, relief: maps, ...(m ? { glow: m } : {}) }), { size: [s.width, s.height], view: { zoom }, glow });
  }
});

// tool:pattern (§5.12.5): the shapes in the shader against the reference, lamps and a sun, with Texture too.
test('parity: light patterns', async ({ page }) => {
  await open(page);
  const pat = (look: string, p: object, d: Doc = full) => { const b = withLook(d, look); return parseDoc({ ...b, lights: b.lights.map((l) => ({ ...l, ...p })) }); };
  const docs: Record<string, Doc> = {
    'soft window, window': pat('soft-window', { pattern: 'window' }),
    'soft window, blinds, hard edges': pat('soft-window', { pattern: 'blinds', patternSoft: 0.05, patternSize: 0.3 }),
    'soft window, leaves': pat('soft-window', { pattern: 'leaves' }),
    'gallery, small window turned 25': pat('gallery', { pattern: 'window', patternSize: 0.25, patternTurn: 25, patternSoft: 0.6 }),
    'spotlight, leaves, large': pat('spotlight', { pattern: 'leaves', patternSize: 1.5, patternSoft: 1 }),
    'sun, blinds turned -60': parseDoc({ ...full, ambient: { level: 0.4 }, lights: [{ id: 's', kind: 'sun', intensity: 0.7, pattern: 'blinds', patternTurn: -60 }] }),
    'gallery, window moved, stretched, slanted': pat('gallery', { pattern: 'window', patternX: 0.15, patternY: -0.1, patternStretch: 1.7, patternSkew: 0.35, patternTurn: 12 }),
    'sun, leaves moved and stretched': parseDoc({ ...full, ambient: { level: 0.4 }, lights: [{ id: 's', kind: 'sun', intensity: 0.7, pattern: 'leaves', patternX: -0.3, patternStretch: 0.5, patternSkew: -0.6 }] }),
  };
  for (const [name, doc] of Object.entries(docs)) {
    const kappa = guardKappa(photo, doc);
    await check(page, name, doc, kappa, render(photo, doc, { width: WIDTH, kappa }));
  }
  // with Texture: sheen and shadows follow the pattern
  await page.evaluate(() => (window as any).harness.reliefCPU());
  const base = neutralDoc({ width: small.width, height: small.height, space: 'srgb', sha256: photo.sha256 });
  const tex = parseDoc({ ...pat('raking-left', { pattern: 'leaves', patternSize: 0.3 }, base), relief: { mode: 'estimated', depth: 0.006, sheen: 0.4 } });
  const kappa = guardKappa(small, tex);
  await check(page, 'raking left, leaves, texture and sheen', tex, kappa, render(small, tex, { kappa, relief: estimatedRelief(small) }));
});

// tool:even (§5.12.6): the correction in the shader against the reference, alone, with lights, with Texture.
test('parity: even out the photo', async ({ page }) => {
  await open(page);
  const ev = (d: Doc, prepare: object) => parseDoc({ ...d, prepare });
  const docs: Record<string, Doc> = {
    'even, no lights': ev(full, { tilt: 0.4, tiltFrom: 200, corners: 0.3 }),
    'even and tint, spotlight': ev(withLook(full, 'spotlight'), { tilt: -0.3, tiltFrom: 45, corners: -0.4, tint: 0.8 }),
    'tint only, soft window': ev(withLook(full, 'soft-window'), { tint: -1 }),
  };
  for (const [name, doc] of Object.entries(docs)) {
    const kappa = guardKappa(photo, doc);
    await check(page, name, doc, kappa, render(photo, doc, { width: WIDTH, kappa }));
  }
  await page.evaluate(() => (window as any).harness.reliefCPU());
  const base = neutralDoc({ width: small.width, height: small.height, space: 'srgb', sha256: photo.sha256 });
  const tex = parseDoc({ ...withLook(base, 'raking-top'), relief: { mode: 'estimated', depth: 0.006 }, prepare: { tilt: 0.3, tiltFrom: 300, corners: 0.2 } });
  const kappa = guardKappa(small, tex);
  await check(page, 'raking top, texture, even', tex, kappa, render(small, tex, { kappa, relief: estimatedRelief(small) }));
});

// tool:pattern: the box on the picture moves the pattern; one undo step takes it back (D-068).
test('app: a pattern\'s box on the picture moves it', async ({ page }) => {
  const shot = render(photo, full, { width: 600 });
  await page.goto('http://localhost:5180/');
  await page.locator('input[type=file]').setInputFiles({ name: 'lintel.png', mimeType: 'image/png', buffer: encodePng(shot) });
  const dl = <T>(f: string, ...a: unknown[]) => page.evaluate(([n, args]) => (window as any).digilight[n as string](...(args as unknown[])), [f, a] as const) as Promise<T>;
  await page.locator('[data-look="soft-window"]').click();
  await page.getByRole('checkbox', { name: 'Expert controls' }).check();
  const patterns = page.locator('label.select', { hasText: 'Pattern' }).locator('select');
  await expect(patterns.locator('option')).toHaveText(['None', 'Window', 'Blinds', 'Leaves']); // words, not values
  await patterns.selectOption('window');
  await expect(page.locator('.pattern-box')).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit pattern' }).click();
  const box = await page.locator('.pattern-box polygon').boundingBox();
  expect(box).not.toBeNull();
  const cx = box!.x + box!.width / 2, cy = box!.y + box!.height / 2;
  await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 40, cy - 30, { steps: 5 }); await page.mouse.up();
  const l = (await dl<Doc>('getDoc')).lights[0]!;
  expect(l.patternX).toBeGreaterThan(0.02); expect(l.patternY).toBeGreaterThan(0.02); // right and up
  await dl('undo');
  expect((await dl<Doc>('getDoc')).lights[0]!.patternX).toBe(0);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.pattern-box')).toHaveCount(0);
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
  const withLight = await dl<{ path: string; type: string; label: string }[]>('describe');
  for (const p of TOOLS.flatMap((t) => t.paths).filter((q) => q.startsWith('lights.'))) {
    const s = withLight.find((x) => x.path === p)!;
    if (s.type === 'enum') await expect(section('Lights').locator('label.select', { hasText: s.label })).toHaveCount(1); // tool:pattern
    else await expect(slider('Lights', p)).toHaveCount(1);
  }
  for (const p of TOOLS.flatMap((t) => t.paths).filter((q) => q.startsWith('prepare.'))) await expect(slider('Lights', p)).toHaveCount(1); // tool:even
  await expect(section('Lights').locator('[id="s-lights.0.gelHue"] ~ .track.hue')).toHaveCount(1); // tool:gel: the colour strip
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

// tool:wall: the wall's settings sit in Export's expert list; the picture shows the wall; the
// export is the whole picture, piece and wall, from the reference.
test('app: the wall in the panel, on the picture and in the export', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = render(photo, full, { width: 600 }), png = encodePng(shot);
  await page.goto('http://localhost:5180/');
  await page.locator('input[type=file]').setInputFiles({ name: 'lintel.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('[data-look="spotlight"]')).toBeVisible();
  const dl = <T>(f: string, ...a: unknown[]) => page.evaluate(([n, args]) => (window as any).digilight[n as string](...(args as unknown[])), [f, a] as const) as Promise<T>;
  const exportSection = page.locator('section', { has: page.getByRole('heading', { name: 'Export' }) });
  await page.getByRole('checkbox', { name: 'Expert controls' }).check();
  for (const p of TOOLS.find((t) => t.id === 'wall')!.paths.filter((q) => q !== 'wall.on')) await expect(exportSection.locator(`[id="s-${p}"]`)).toHaveCount(1);
  await page.locator('[data-look="spotlight"]').click();
  const picture = async () => { await page.waitForTimeout(400); return page.locator('.stage canvas').screenshot(); };
  const plain = await picture();
  await exportSection.getByRole('checkbox', { name: 'Wall', exact: true }).check();
  expect((await dl<Doc>('getDoc')).wall.on).toBe(true);
  await expect.poll(async () => (await picture()).equals(plain), { timeout: 10_000 }).toBe(false);
  await page.locator('[data-format="png"]').click();
  const downloads: import('@playwright/test').Download[] = [];
  const two = new Promise<void>((done) => page.on('download', (d) => { downloads.push(d); if (downloads.length === 2) done(); }));
  await page.locator('[data-action="download"]').click();
  await two;
  const files = await Promise.all(downloads.map(async (d) => ({ name: d.suggestedFilename(), bytes: readFileSync((await d.path())!) })));
  const rec = JSON.parse(files.find((f) => f.name.endsWith('.json'))!.bytes.toString()), doc = parseDoc(rec.document);
  const want = renderWithWall(shot, doc), size = wallSize(doc, shot.width, shot.height);
  expect([rec.picture.width, rec.picture.height]).toEqual([size.width, size.height]);
  expect(size.width).toBe(shot.width + 2 * Math.round(0.25 * shot.width));
  expect(rec.picture.pixelsSha256).toBe(createHash('sha256').update(want.data).digest('hex'));
  expect(errors).toEqual([]);
});
