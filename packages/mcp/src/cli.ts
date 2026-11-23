#!/usr/bin/env node
// cli.ts — the digilight command line (BUILD.md Phase 7): render, looks, describe, verify. The
// same document gives the same pixels here as in the app and the MCP server (§1, promise 5);
// verify renders a record's document again and says which differs, the photo's decoding or the
// picture, from the record's two pixel hashes.

import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createCommands, LOOKS, outputSize, wallSize, type Doc } from 'core';
import { describeMetrics } from './session.ts';
import { exportPicture, openSource, writeExport, type ExportRecord, type Source } from './picture.ts';

const HELP = `digilight: relight a photo of an artwork (DigiLight 2)

  digilight render PHOTO [--look ID] [--strength 0-1] [--settings FILE] [--set PATH=VALUE]...
                         [--width N] [--format jpeg|png] [--quality 0-1] [--out FILE]
      Lights the photo (or a .digilight project) and writes the picture and its .json record
      (by default PHOTO-digilight.jpg). --settings takes copied settings, a document or an export
      record; --set takes a setting path from "digilight describe", e.g. lights.0.kelvin=3000.
  digilight looks                  the looks, for --look
  digilight describe [PREFIX] [--expert]
                                   the settings: path, range, default
  digilight verify RECORD.json PHOTO
      Renders the record's document from the photo (or its project, for a measured texture)
      again and compares the pixels' SHA-256 with the record's.`;

const out = (s: string) => process.stdout.write(`${s}\n`);
const value = (v: string): unknown => { try { return JSON.parse(v); } catch { return v; } };

/** A commands object holding the source's photo and, for a project, its document and height. */
function opened(s: Source) {
  const cmd = createCommands();
  cmd.open({ ...s.photo.image, space: s.photo.space, sha256: s.photo.sha256 });
  if (s.doc) cmd.load(s.doc, s.height);
  return cmd;
}

async function renderCmd(args: string[]): Promise<number> {
  const { values: o, positionals } = parseArgs({ args, allowPositionals: true, options: {
    look: { type: 'string' }, strength: { type: 'string' }, settings: { type: 'string' }, set: { type: 'string', multiple: true },
    width: { type: 'string' }, format: { type: 'string' }, quality: { type: 'string' }, out: { type: 'string' },
  } });
  const path = positionals[0];
  if (!path) { out(HELP); return 1; }
  const s = await openSource(path), cmd = opened(s);
  if (o.settings) {
    const j = JSON.parse(await readFile(o.settings, 'utf8')) as { document?: Doc; photo?: Doc['photo'] };
    const d = j.document ?? j;
    // A document of this very photo goes back as it is; anything else goes on as Paste settings does.
    if ((d as Doc).photo?.sha256 === s.photo.sha256) cmd.load(d as Doc, s.height);
    else cmd.applySettings(d);
  }
  if (o.look) cmd.applyLook(o.look, o.strength === undefined ? {} : { strength: Number(o.strength) });
  if (o.set?.length) cmd.set(Object.fromEntries(o.set.map((kv) => { const i = kv.indexOf('='); if (i < 1) throw new Error(`--set takes PATH=VALUE, not "${kv}"`); return [kv.slice(0, i), value(kv.slice(i + 1))]; })));
  const format = (o.format ?? (/\.png$/i.test(o.out ?? '') ? 'png' : 'jpeg')) as 'jpeg' | 'png';
  const target = o.out ?? `${path.replace(/\.[^./\\]*$/, '')}-digilight.${format === 'png' ? 'png' : 'jpg'}`;
  const { file, record } = await exportPicture(s.photo, cmd.picture(), cmd.getDoc(), cmd.getMeasured(), {
    ...(o.width ? { width: Number(o.width) } : {}), format, ...(o.quality ? { quality: Number(o.quality) } : {}),
  });
  const json = await writeExport(target, file, record);
  out(`Saved ${target} (${record.picture.width} x ${record.picture.height}) and ${json}.`);
  out(describeMetrics(cmd.render({ width: Math.min(640, cmd.getDoc().photo.width) }).metrics));
  return 0;
}

/** The piece's width an export asked for, from its picture's width (the wall adds a margin). */
function askedWidth(doc: Doc, pictureWidth: number): number {
  if (!doc.wall.on) return pictureWidth; // tool:wall
  const total = (w: number) => { const o = outputSize(doc.photo, w); return wallSize(doc, o.width, o.height).width; };
  let lo = 1, hi = doc.photo.width;
  while (lo < hi) { const m = (lo + hi) >> 1; if (total(m) < pictureWidth) lo = m + 1; else hi = m; }
  return lo;
}

async function verifyCmd(args: string[]): Promise<number> {
  const [recordPath, photoPath] = args;
  if (!recordPath || !photoPath) { out(HELP); return 1; }
  const r = JSON.parse(await readFile(recordPath, 'utf8')) as ExportRecord;
  if (r.app !== 'DigiLight 2' || !r.document || !r.picture?.pixelsSha256) { out(`${recordPath} is not a DigiLight export record.`); return 1; }
  const s = await openSource(photoPath);
  if (s.photo.sha256 !== r.photo.sha256) { out(`Not the same photo: ${photoPath} is not the file the record was made from (its SHA-256 differs).`); return 1; }
  const decoder = r.photo.pixelsSha256 !== undefined && r.photo.pixelsSha256 !== s.photo.pixelsSha256;
  if (r.document.relief.mode === 'measured' && !s.height) { out('The record has a measured texture: give its .digilight project instead of the photo.'); return 1; }
  const cmd = opened({ ...s, doc: null });
  cmd.load(r.document, r.document.relief.mode === 'measured' ? s.height : null);
  const { record } = await exportPicture(s.photo, cmd.picture(), cmd.getDoc(), cmd.getMeasured(), { width: askedWidth(r.document, r.picture.width), format: 'png' });
  if (record.picture.pixelsSha256 === r.picture.pixelsSha256) { out(`Verified: the same pixels (SHA-256 ${r.picture.pixelsSha256}).`); return 0; }
  if (decoder) {
    out('Not the same pixels, and the photo decodes differently here than where the record was made (photo.pixelsSha256 differs): JPEG decoders can read a photo a level apart (D-029), so the renderer is not shown to differ. A PNG photo verifies exactly.');
    return 1;
  }
  out(`Not the same pixels: the photo decodes the same, so the rendering differs (record ${r.picture.pixelsSha256}, here ${record.picture.pixelsSha256}).`);
  return 1;
}

export async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  switch (command) {
    case 'render': return renderCmd(rest);
    case 'verify': return verifyCmd(rest);
    case 'looks': out(LOOKS.map((l) => `${l.id.padEnd(14)} ${l.label}`).join('\n')); return 0;
    case 'describe': {
      const expert = rest.includes('--expert'), prefix = rest.find((a) => !a.startsWith('--')) ?? '';
      const c = createCommands(); // a one-pixel photo with one lamp, so the lights' settings show too
      c.open({ data: new Uint8ClampedArray([128, 128, 128, 255]), width: 1, height: 1, sha256: '0'.repeat(64) });
      c.addLight();
      const rows = c.describe().filter((d) => d.path.startsWith(prefix) && (expert || d.tier === 'simple'));
      out(rows.map((d) => `${d.path.padEnd(28)} ${d.type === 'number' ? `${d.min} to ${d.max}` : d.type === 'enum' ? d.options!.join(' | ') : d.type}, default ${JSON.stringify(d.default)}: ${d.label}`).join('\n') || `No setting starts with "${prefix}".`);
      return 0;
    }
    default: out(HELP); return command === undefined || command === '--help' || command === 'help' ? 0 : 1;
  }
}

const entry = (() => { try { return realpathSync(process.argv[1] ?? ''); } catch { return ''; } })();
if (entry === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e: unknown) => { out(e instanceof Error ? e.message : String(e)); process.exitCode = 1; });
}
