// session.ts — one open photo and its document for the MCP server (BUILD.md Phase 7). Every change
// goes through core's commands (§3, one way in) and says what it changed, with warnings: the
// metrics of a small render (blown whites, crushed darks, the guard), or that Texture's maps are
// still to be built. Previews and comparisons come back as small pictures.

import {
  createCommands, guardKappa, measuredRelief, metrics, neutralDoc, pictureStats, render, withSettings,
  type Doc, type Image, type Light, type Metrics, type PictureStats, type Region, type SidePhoto,
} from 'core';
import { readFile } from 'node:fs/promises';
import { decodePhoto, previewFile, type Decoded } from './image-io.ts';
import { exportPicture, openSource, writeExport, type ExportOptions } from './picture.ts';

export interface Picture { data: Buffer; mimeType: string }
export interface Result { text: string; pictures?: Picture[] }

/** A document's settings as path to value, for saying what changed (number lists as one value). */
function leaves(v: unknown, path: string, out: Map<string, string>): Map<string, string> {
  if (v && typeof v === 'object' && !(Array.isArray(v) && v.every((x) => typeof x !== 'object'))) {
    for (const [k, x] of Object.entries(v)) leaves(x, path ? `${path}.${k}` : k, out);
  } else out.set(path, JSON.stringify(v));
  return out;
}
const short = (s: string | undefined) => (s === undefined ? 'nothing' : s.length > 60 ? `${s.slice(0, 57)}...` : s);
const lamp = (l: Light) => `${l.id} (${l.kind === 'sun' ? `sun from ${l.azimuth} deg, ${l.elevation} deg up` : `lamp at ${JSON.stringify(l.pos)} aimed at ${JSON.stringify(l.aim)}`}, intensity ${l.intensity}, kelvin ${l.kelvin}${l.kind === 'sun' ? '' : `, cone ${l.cone}`}${l.on ? '' : ', off'})`;
/** What changed from `a` to `b`, a line each; a light added or removed is one line. */
export function changes(a: Doc, b: Doc): string[] {
  const out: string[] = [], diff = (p: string, u: unknown, v: unknown) => {
    const x = leaves(u, p, new Map()), y = leaves(v, p, new Map());
    for (const k of new Set([...x.keys(), ...y.keys()])) if (x.get(k) !== y.get(k)) out.push(`${k}: ${short(x.get(k))} -> ${short(y.get(k))}`);
  };
  diff('', { ...a, lights: null }, { ...b, lights: null });
  for (let i = 0; i < Math.max(a.lights.length, b.lights.length); i++) {
    const l = a.lights[i], m = b.lights[i];
    if (l && m && l.id === m.id) diff(`lights.${i}`, l, m);
    else {
      if (l) out.push(`removed ${lamp(l)}`);
      if (m) out.push(`lights.${i}: added ${lamp(m)}`);
    }
  }
  return out;
}

const pc = (v: number) => `${(100 * v).toFixed(2)}%`;
export function describeMetrics(m: Metrics): string {
  const s = (p: Metrics['render']) => `blown ${pc(p.blown)}, crushed ${pc(p.crushed)}, luma 5/50/95%: ${p.p05}/${p.p50}/${p.p95}`;
  return `Picture: ${s(m.render)}\nPhoto:   ${s(m.photo)}\nProtect whites: ${Math.round(m.kappa * 100)}%\n` +
    (m.warnings.length ? `Warnings:\n- ${m.warnings.join('\n- ')}` : 'Warnings: none');
}

export class Session {
  readonly cmd = createCommands();
  private photo: Decoded | null = null;
  /** Pictures (by crop) whose estimated texture maps are made: core keeps them per picture. */
  private mapsMade = new WeakSet<object>();
  /** The photo's own numbers per picture, size and region (they never change). */
  private stats = new WeakMap<object, Map<string, PictureStats>>();

  private get doc(): Doc { return this.cmd.getDoc(); }
  private needPhoto(): Decoded {
    if (!this.photo) throw new Error('Open a photo first (open_image).');
    return this.photo;
  }
  private mapsReady(d: Doc): boolean {
    return d.relief.mode !== 'estimated' || this.mapsMade.has(this.cmd.picture().data);
  }
  /** A render at `width` from the reference renderer with its metrics (Texture's maps made here
   *  the first time they are needed). */
  private renderDoc(d: Doc, width: number, region?: { x: number; y: number; width: number; height: number }): { image: Image; metrics: Metrics } {
    const picture = this.cmd.picture(), height = this.cmd.getMeasured(), kappa = guardKappa(picture, d);
    const opts = { width, ...(region ? { region } : {}) };
    const image = render(picture, d, { ...opts, kappa, ...(d.relief.mode === 'measured' && height ? { relief: measuredRelief(height) } : {}) });
    if (d.relief.mode === 'estimated') this.mapsMade.add(picture.data);
    return { image, metrics: metrics(image, this.photoStats(picture, d, opts), kappa) };
  }
  /** The photo's own numbers at a size and region, kept: they never change. */
  private photoStats(picture: Image, d: Doc, opts: { width: number; region?: Region }): PictureStats {
    let byKey = this.stats.get(picture.data);
    if (!byKey) this.stats.set(picture.data, byKey = new Map());
    const key = JSON.stringify(opts);
    let base = byKey.get(key);
    if (!base) byKey.set(key, base = pictureStats(render(picture, neutralDoc(d.photo), opts)));
    return base;
  }
  /** The changes from `before`, and warnings from a 320 px render (or that Texture's maps are
   *  still to be made, which the next render_preview does). */
  private changed(before: Doc, extra = ''): Result {
    const d = this.doc, list = changes(before, d), warn: string[] = [];
    if (!this.mapsReady(d)) warn.push('Texture is on: the next render_preview first builds its maps from the photo (about 15 s for a large photo; once per photo). The warnings below are for the light alone.');
    const check = this.mapsReady(d) ? d : { ...d, relief: { ...d.relief, mode: 'off' as const } };
    warn.push(...this.renderDoc(check, Math.min(320, d.photo.width)).metrics.warnings);
    return { text: `${extra}${list.length ? `Changed:\n- ${list.join('\n- ')}` : 'Nothing changed.'}\n${warn.length ? `Warnings:\n- ${warn.join('\n- ')}` : 'Warnings: none'}` };
  }

  async open(path: string): Promise<Result> {
    const s = await openSource(path), p = s.photo;
    const info = this.cmd.open({ ...p.image, space: p.space, sha256: p.sha256 });
    this.photo = p; this.mapsMade = new WeakSet();
    let note = '';
    if (s.doc) {
      try { this.cmd.load(s.doc, s.height); note = `\nThe project's settings${s.height ? ', measured texture' : ''}${s.doc.photo.crop ? ' and crop' : ''} are on.`; }
      catch (e) { note = `\nThe project's settings could not be put back (${(e as Error).message}); the photo starts as photographed.`; }
    }
    const d = this.doc;
    // Ready for the first preview: the photo's numbers at the preview's size, the guard's thumbnail.
    this.photoStats(this.cmd.picture(), d, { width: Math.min(1280, d.photo.width) });
    guardKappa(this.cmd.picture(), d);
    return { text: `Opened ${p.name}: ${info.width} x ${info.height} px, ${p.space === 'display-p3' ? 'Display P3' : 'sRGB'}, SHA-256 ${p.sha256}.${note}\nPicture: ${d.photo.width} x ${d.photo.height} px. Lights: ${d.lights.length}. Texture: ${d.relief.mode}.\nLooks: ${info.looks.join(', ')}.` };
  }

  looks(): Result {
    return { text: this.cmd.looks().map((l) => `${l.id}: ${l.label}`).join('\n') };
  }
  applyLook(id: string, strength?: number, flip?: boolean): Result {
    this.needPhoto();
    const before = this.doc;
    this.cmd.applyLook(id, { ...(strength === undefined ? {} : { strength }), ...(flip === undefined ? {} : { flip }) });
    return this.changed(before, `Look ${id}${strength === undefined ? '' : ` at ${Math.round(strength * 100)}%`}${flip ? ', flipped' : ''}.\n`);
  }
  describe(prefix?: string, tier?: 'simple' | 'expert'): Result {
    this.needPhoto();
    const rows = this.cmd.describe().filter((s) => (!prefix || s.path.startsWith(prefix)) && (!tier || s.tier === tier));
    if (!rows.length) return { text: `No setting starts with "${prefix}".` };
    return {
      text: rows.map((s) => {
        const range = s.type === 'number' ? ` ${s.min} to ${s.max} (step ${s.step})` : s.type === 'enum' ? ` one of ${s.options!.join(', ')}` : ` ${s.type}`;
        return `${s.path} = ${JSON.stringify(s.value)} | ${s.label} (${s.tier}) |${range}, default ${JSON.stringify(s.default)} | ${s.help}`;
      }).join('\n'),
    };
  }
  getSettings(paths?: string[]): Result {
    this.needPhoto();
    if (paths?.length) return { text: paths.map((p) => `${p} = ${JSON.stringify(this.cmd.get(p))}`).join('\n') };
    return { text: JSON.stringify({ ...this.cmd.getSettings(), photo: this.doc.photo }, null, 2) };
  }
  setSettings(values: Record<string, unknown>): Result {
    this.needPhoto();
    const before = this.doc;
    this.cmd.set(values);
    return this.changed(before);
  }
  addLight(fields: Partial<Omit<Light, 'id'>>): Result {
    this.needPhoto();
    const before = this.doc, d = this.cmd.addLight(fields);
    return this.changed(before, `Added ${d.lights[d.lights.length - 1]!.id}.\n`);
  }
  updateLight(id: string, fields: Partial<Omit<Light, 'id'>>): Result {
    this.needPhoto();
    const before = this.doc;
    this.cmd.updateLight(id, fields);
    return this.changed(before);
  }
  removeLight(id: string): Result {
    this.needPhoto();
    const before = this.doc;
    this.cmd.removeLight(id);
    return this.changed(before, `Removed ${id}.\n`);
  }
  setRelief(partial: Partial<Doc['relief']>): Result {
    this.needPhoto();
    const before = this.doc;
    this.cmd.setRelief(partial);
    return this.changed(before);
  }
  async measureRelief(photos: { path: string; from?: number; elevation?: number }[], widthCm: number | undefined, onProgress: (text: string) => void): Promise<Result> {
    this.needPhoto();
    if (!photos.length || photos.length > 3) throw new Error('Give one to three side-lit photos.');
    const side: SidePhoto[] = [];
    for (const p of photos) {
      const name = p.path.split(/[\\/]/).pop() ?? p.path;
      let bytes: Uint8Array;
      try { bytes = new Uint8Array(await readFile(p.path)); } catch { throw new Error(`No file at ${p.path}`); }
      side.push({ image: (await decodePhoto(bytes, name)).image, ...(p.from === undefined ? {} : { from: p.from }), ...(p.elevation === undefined ? {} : { elevation: p.elevation }) });
    }
    const before = this.doc;
    const t = this.cmd.measureRelief({ photos: side, ...(widthCm ? { widthCm } : {}), onProgress });
    const lines = t.photos.map((s, i) => `Photo ${i + 1}: light from ${s.from === null ? `${Math.round(s.axis.axisDeg)} (read from the photo${s.assumedEnd ? '; if raised parts look sunk, measure again with from + 180' : ''})` : s.from} deg, ${s.lineUp?.H ? `lined up (${s.lineUp.inliers} of ${s.lineUp.matches} matches agree${s.lineUp.errorPx === null ? '' : `, ${s.lineUp.errorPx.toFixed(1)} px`})` : 'taken from the same spot'}.`);
    return this.changed(before, `Measured the texture: ${t.height.width} x ${t.height.height} heights, depth ${t.depth.toFixed(5)}.\n${lines.join('\n')}\n`);
  }

  async preview(width?: number, region?: { x: number; y: number; width: number; height: number }, format: 'jpeg' | 'png' = 'jpeg'): Promise<Result> {
    const p = this.needPhoto(), d = this.doc, w = width ?? Math.min(1280, d.photo.width);
    const slow = !this.mapsReady(d), t0 = performance.now();
    const r = this.renderDoc(d, w, region), ms = Math.round(performance.now() - t0);
    const pic = await previewFile(r.image, p.space, format);
    return {
      text: `Preview ${r.image.width} x ${r.image.height} px${region ? ` (a region of the ${w} px picture)` : ''} in ${ms} ms${slow ? ' (Texture\'s maps were built first)' : ''}.\n${describeMetrics(r.metrics)}`,
      pictures: [pic],
    };
  }

  /** 'photo', 'current' or settings (or a document) as JSON: the document it makes now. */
  private state(s: unknown): Doc {
    if (s === 'photo') return neutralDoc(this.doc.photo);
    if (s === 'current' || s === undefined) return this.doc;
    return withSettings(this.doc, s, this.cmd.getMeasured() !== null, true);
  }
  async compare(a: unknown, b: unknown, width?: number): Promise<Result> {
    const p = this.needPhoto(), d = this.doc, w = width ?? Math.min(640, d.photo.width);
    const A = this.renderDoc(this.state(a), w).image, B = this.renderDoc(this.state(b), w).image;
    const n = A.width * A.height, diff = new Uint8ClampedArray(n * 4);
    let sum = 0, moved = 0, la = 0, lb = 0;
    for (let i = 0, q = 0; i < n; i++, q += 4) {
      const dr = Math.abs(A.data[q]! - B.data[q]!), dg = Math.abs(A.data[q + 1]! - B.data[q + 1]!), db = Math.abs(A.data[q + 2]! - B.data[q + 2]!), m = Math.max(dr, dg, db);
      sum += dr + dg + db; if (m > 4) moved++;
      la += 0.2126 * A.data[q]! + 0.7152 * A.data[q + 1]! + 0.0722 * A.data[q + 2]!;
      lb += 0.2126 * B.data[q]! + 0.7152 * B.data[q + 1]! + 0.0722 * B.data[q + 2]!;
      diff[q] = diff[q + 1] = diff[q + 2] = 4 * m; diff[q + 3] = 255;
    }
    const name = (s: unknown) => (typeof s === 'string' ? s : 'the settings given');
    return {
      text: `A (${name(a)}), B (${name(b)}) and their difference (four times brighter), ${A.width} x ${A.height} px.\n` +
        `Mean difference ${(sum / (3 * n)).toFixed(2)} levels; ${pc(moved / n)} of the picture differs by more than 4 levels.\n` +
        `Mean brightness (luma): A ${(la / n).toFixed(1)}, B ${(lb / n).toFixed(1)}.`,
      pictures: [await previewFile(A, p.space), await previewFile(B, p.space), await previewFile({ data: diff, width: A.width, height: A.height }, p.space)],
    };
  }

  async exportImage(path: string, opts: ExportOptions): Promise<Result> {
    const p = this.needPhoto(), d = this.doc;
    const format = opts.format ?? (/\.png$/i.test(path) ? 'png' : 'jpeg');
    if (!this.mapsReady(d)) this.mapsMade.add(this.cmd.picture().data); // made by the render below
    const { file, record } = await exportPicture(p, this.cmd.picture(), d, this.cmd.getMeasured(), { ...opts, format });
    const json = await writeExport(path, file, record);
    const m = this.renderDoc(d, Math.min(640, d.photo.width)).metrics;
    return { text: `Saved ${path} (${record.picture.width} x ${record.picture.height}, ${format.toUpperCase()}) and its record ${json}.\nPicture pixels SHA-256 ${record.picture.pixelsSha256}.\n${m.warnings.length ? `Warnings:\n- ${m.warnings.join('\n- ')}` : 'Warnings: none'}` };
  }

  undo(): Result { this.needPhoto(); const before = this.doc; this.cmd.undo(); return this.changed(before, 'Undone.\n'); }
  reset(): Result { this.needPhoto(); const before = this.doc; this.cmd.reset(); return this.changed(before, 'Back to the photo as taken.\n'); }
}
