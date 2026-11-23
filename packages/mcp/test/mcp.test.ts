// The MCP server's parts (BUILD.md Phase 7): photos decode as the app decodes them and pictures
// keep a Display P3 profile; the session says what changed; the tools are the brief's list; the
// command line renders and verifies, and tells a changed record. e2e/mcp.spec.ts is the gate.

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { iccKind, neutralDoc, render } from 'core';
import sharp from 'sharp';
import { expect, test } from 'vitest';
import { loadFixture } from '../../core/scripts/jpeg.ts';
import { encodePng } from '../../../e2e/png.ts';
import { main } from '../src/cli.ts';
import { decodePhoto, encodePicture } from '../src/image-io.ts';
import { changes, Session } from '../src/session.ts';
import { TOOLS } from '../src/tools.ts';

const FIX = new URL('../../../fixtures/', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'digilight-mcp-'));
/** The door at 400 px as a PNG file: lossless, so every decoder reads the same pixels. */
const src = loadFixture('door-flat-crop.jpg');
const small = render(src, neutralDoc({ width: src.width, height: src.height, space: 'srgb', sha256: src.sha256 }), { width: 400 });
const PNG = join(dir, 'door.png');
writeFileSync(PNG, encodePng(small));

test('a PNG decodes to its own pixels; a picture keeps a Display P3 profile without its pixels changing', async () => {
  const d = await decodePhoto(new Uint8Array(readFileSync(PNG)), 'door.png');
  expect(d.space).toBe('srgb');
  expect(Buffer.from(d.image.data).equals(Buffer.from(small.data))).toBe(true);
  for (const format of ['png', 'jpeg'] as const) {
    const file = await encodePicture(small, 'display-p3', format);
    const meta = await sharp(file).metadata();
    expect(meta.icc && iccKind(new Uint8Array(meta.icc))).toBe('display-p3');
    const back = await decodePhoto(new Uint8Array(file), `p3.${format}`);
    expect(back.space).toBe('display-p3');
    if (format === 'png') expect(Buffer.from(back.image.data).equals(Buffer.from(small.data))).toBe(true);
  }
  // The iPhone's photo: its own Display P3 profile, read as stored (as the app's P3 canvas reads it).
  const p3 = await decodePhoto(new Uint8Array(readFileSync(FIX + 'lintel-iphone-p3.jpg')), 'p3.jpg');
  const stored = await sharp(readFileSync(FIX + 'lintel-iphone-p3.jpg'), { ignoreIcc: true }).ensureAlpha().raw().toBuffer();
  expect(p3.space).toBe('display-p3');
  expect(Buffer.from(p3.image.data).equals(stored)).toBe(true);
  // EXIF orientation 6: upright, as the app shows it.
  const turned = await decodePhoto(new Uint8Array(readFileSync(FIX + 'door-exif-rotated.jpg')), 'r.jpg');
  expect(turned.image.width).toBeLessThan(turned.image.height);
});

test('the tools are the brief\'s list; a change says what changed; a light added is one line', async () => {
  expect(TOOLS.map((t) => t.name)).toEqual(['open_image', 'list_looks', 'apply_look', 'describe_settings', 'get_settings', 'set_settings', 'add_light',
    'update_light', 'remove_light', 'set_relief', 'measure_relief', 'render_preview', 'compare', 'export_image', 'undo', 'reset']);
  for (const t of TOOLS) expect(t.description.length).toBeGreaterThan(20);
  const s = new Session();
  expect(() => s.looks()).not.toThrow();
  expect(() => s.applyLook('gallery')).toThrow(/Open a photo first/);
  await s.open(PNG);
  const set = s.setSettings({ 'finish.contrast': 0.2, 'ambient.level': 0.5 }).text;
  expect(set).toContain('finish.contrast: 0 -> 0.2');
  expect(set).toContain('ambient.level: 1 -> 0.5');
  const d0 = s.cmd.getDoc(), add = s.addLight({ pos: [-1.5, 0.4, 0.5] }).text;
  expect(add).toMatch(/lights\.0: added light-1 \(lamp at \[-1\.5,0\.4,0\.5\]/);
  expect(changes(d0, s.cmd.getDoc())).toHaveLength(1);
  expect(s.setSettings({ 'finish.contrast': 0.2 }).text).toContain('Nothing changed.');
  expect(() => s.setSettings({ 'lights.0.intensity': 9 })).toThrow(/<=4/);
  // Bright light, whites unprotected, warns; Texture says its maps come first.
  s.setSettings({ 'tone.protectWhites': false, 'tone.highlightProtect': 0 });
  expect(s.updateLight('light-1', { intensity: 4, pos: [0.5, 0.5, 0.2] }).text).toMatch(/whites: .* more of the picture is blown/);
  expect(s.setRelief({ mode: 'estimated' }).text).toContain('next render_preview first builds its maps');
  const p = await s.preview(200);
  expect(p.text).toMatch(/Preview 200 x \d+ px/);
  expect(p.pictures?.[0]?.mimeType).toBe('image/jpeg');
  const c = await s.compare('photo', 'current', 100);
  expect(c.pictures).toHaveLength(3);
  expect(s.undo().text).toContain('relief.mode: "estimated" -> "off"');
});

test('digilight render writes a picture and record that verify accepts; a changed record is caught', async () => {
  const out = join(dir, 'lit.png');
  const log: string[] = [], write = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((s: string) => { log.push(String(s)); return true; }) as typeof process.stdout.write;
  try {
    expect(await main(['render', PNG, '--look', 'spotlight', '--set', 'finish.vignette=0.3', '--out', out])).toBe(0);
    const json = out.replace(/\.png$/, '.json'), record = JSON.parse(readFileSync(json, 'utf8'));
    expect(record.photo.pixelsSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(record.document.finish.vignette).toBe(0.3);
    expect(await main(['verify', json, PNG])).toBe(0);
    writeFileSync(json, JSON.stringify({ ...record, document: { ...record.document, finish: { ...record.document.finish, vignette: 0.31 } } }));
    expect(await main(['verify', json, PNG])).toBe(1);
    expect(log.join('')).toMatch(/the photo decodes the same, so the rendering differs/);
  } finally { process.stdout.write = write; }
});
