// Projects (BUILD.md Phase 6b items 3 and 4): the zip writer and reader, a project packed and
// unpacked, and the project committed in this phase (fixtures/projects/) still opening. That file
// must keep opening in every later update: change the format only by adding a migrate step.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { estimateHeight, neutralDoc, packHeight, parseDoc, render, withLook, type MeasuredHeight } from 'core';
import { loadFixture } from '../../core/scripts/jpeg.ts';
import { encodePng } from '../../../e2e/png.ts';
import { PROJECT_APP, packProject, unpackProject } from '../src/io/project.ts';
import { crc32, readZip, writeZip } from '../src/io/zip.ts';

const FILE = new URL('../../../fixtures/projects/v1-door.digilight', import.meta.url);
const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

test('zip: the standard CRC, and what is written reads back', async () => {
  expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  const a = { name: 'a.txt', data: new TextEncoder().encode('hello') }, b = { name: 'photo/ü.bin', data: new Uint8Array([0, 1, 2, 255]) };
  const files = readZip(await bytes(writeZip([a, b])));
  expect([...files.keys()]).toEqual(['a.txt', 'photo/ü.bin']);
  expect(Array.from(files.get('photo/ü.bin')!)).toEqual([0, 1, 2, 255]);
  const z = await bytes(writeZip([a]));
  z[35] = z[35]! ^ 1; // damage the data (after the 30-byte header and the name)
  expect(() => readZip(z)).toThrow(/damaged/);
  expect(() => readZip(z.subarray(0, z.length - 25))).toThrow(/not a DigiLight file/); // cut short
  expect(() => readZip(new Uint8Array(100))).toThrow(/not a DigiLight file/);
});

/** The committed project: the door at 320 px (a PNG), a look, a finish and a measured height. */
function makeFixture() {
  const src = loadFixture('door-flat-crop.jpg');
  const small = render(src, neutralDoc({ width: src.width, height: src.height, space: 'srgb', sha256: src.sha256 }), { width: 320 });
  const png = new Uint8Array(encodePng(small));
  const sha = createHash('sha256').update(png).digest('hex');
  const base = neutralDoc({ width: small.width, height: small.height, space: 'srgb', sha256: sha });
  const doc = parseDoc({ ...withLook(base, 'gallery'), relief: { ...base.relief, mode: 'measured', depth: 0.004 }, finish: { ...base.finish, contrast: 0.2, warmth: 0.1 } });
  const est = estimateHeight(small);
  let lo = Infinity, hi = -Infinity;
  for (const v of est.h) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const m: MeasuredHeight = { width: est.width, height: est.height, lo, hi, data: Uint16Array.from(est.h, (v) => Math.round((65535 * (v - lo)) / (hi - lo))) };
  const hpng = new Uint8Array(encodePng({ data: packHeight(m), width: m.width, height: m.height }));
  return packProject({ doc, photo: { name: 'door.png', bytes: png }, height: { png: hpng, width: m.width, height: m.height, lo, hi } }, '2026-11-14T00:00:00.000Z');
}

test('the project committed in Phase 6b still opens: its document, photo and measured height', async () => {
  if (process.env.UPDATE_FIXTURES || !existsSync(FILE)) writeFileSync(FILE, await bytes(makeFixture()));
  const p = await unpackProject(new Uint8Array(readFileSync(FILE)));
  expect(p.photo.name).toBe('door.png');
  expect(p.doc.photo).toMatchObject({ width: 320, space: 'srgb' });
  expect(p.doc.relief.mode).toBe('measured');
  expect(p.doc.finish).toMatchObject({ contrast: 0.2, warmth: 0.1 });
  expect(p.doc.lights.length).toBe(1);
  expect(p.height).toMatchObject({ width: 320, height: p.doc.photo.height });
});

test('a project packs and unpacks; a wrong photo, a newer version and other files are refused', async () => {
  const p = await unpackProject(new Uint8Array(readFileSync(FILE)));
  const again = await unpackProject(await bytes(packProject(p)));
  expect(again.doc).toEqual(p.doc);
  expect(Array.from(again.height!.png)).toEqual(Array.from(p.height!.png));
  const other = { ...p, photo: { ...p.photo, bytes: p.photo.bytes.slice(1) } };
  await expect(unpackProject(await bytes(packProject(other)))).rejects.toThrow(/does not match/);
  const files = readZip(new Uint8Array(readFileSync(FILE)));
  const man = JSON.parse(new TextDecoder().decode(files.get('project.json')!));
  expect(man.app).toBe(PROJECT_APP);
  const newer = writeZip([...files].map(([name, data]) => ({ name, data: name === 'project.json' ? new TextEncoder().encode(JSON.stringify({ ...man, version: 99 })) : data })));
  await expect(unpackProject(await bytes(newer))).rejects.toThrow(/newer DigiLight/);
  await expect(unpackProject(await bytes(writeZip([{ name: 'x', data: new Uint8Array(1) }])))).rejects.toThrow(/not a DigiLight project/);
});
