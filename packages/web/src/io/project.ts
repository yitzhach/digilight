// project.ts — `.digilight` project files (BUILD.md Phase 6b item 3, D-042): a stored zip of
// `project.json` (what is inside), `doc.json` (the document), the photo file as opened, and True
// Relief's measured height as a 16-bit PNG with its lo and hi. The file is the keeping place.
// pack/unpack are pure (bytes in, bytes out) so a test in Node opens a committed project.

import { migrate, type Doc } from 'core';
import { readZip, writeZip, type Entry } from './zip.ts';

export const PROJECT_APP = 'DigiLight project';
export const PROJECT_VERSION = 1;
export interface ProjectHeight { png: Uint8Array; width: number; height: number; lo: number; hi: number }
export interface Project { doc: Doc; photo: { name: string; bytes: Uint8Array }; height: ProjectHeight | null }
interface Manifest {
  app: typeof PROJECT_APP; version: number; saved?: string;
  photo: { name: string; file: string };
  height?: { file: string; width: number; height: number; lo: number; hi: number };
}

const enc = new TextEncoder(), dec = new TextDecoder();
const json = (v: unknown) => enc.encode(`${JSON.stringify(v, null, 2)}\n`);
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');
const sha256 = async (b: Uint8Array) => hex(await crypto.subtle.digest('SHA-256', b as Uint8Array<ArrayBuffer>));

/** True for a zip file (a project), by its first bytes or its name. */
export async function isProject(f: Blob & { name?: string }): Promise<boolean> {
  if (f.name && /\.digilight$/i.test(f.name)) return true;
  const b = new Uint8Array(await f.slice(0, 4).arrayBuffer());
  return b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4;
}

export function packProject(p: Project, saved = new Date().toISOString()): Blob {
  const name = p.photo.name.replace(/[\\/]/g, '_') || 'photo';
  const m: Manifest = { app: PROJECT_APP, version: PROJECT_VERSION, saved, photo: { name: p.photo.name, file: `photo/${name}` } };
  const entries: Entry[] = [{ name: 'doc.json', data: json(p.doc) }, { name: m.photo.file, data: p.photo.bytes }];
  if (p.height) {
    const { png, ...h } = p.height;
    m.height = { file: 'height.png', ...h };
    entries.push({ name: 'height.png', data: png });
  }
  return writeZip([{ name: 'project.json', data: json(m) }, ...entries]);
}

/** A project's contents, its document brought up to date (migrate) and checked against its photo. */
export async function unpackProject(bytes: Uint8Array): Promise<Project> {
  const files = readZip(bytes), read = (n: string) => files.get(n);
  const mf = read('project.json'), df = read('doc.json');
  if (!mf || !df) throw new Error('That file is not a DigiLight project.');
  const m = JSON.parse(dec.decode(mf)) as Manifest;
  if (m.app !== PROJECT_APP) throw new Error('That file is not a DigiLight project.');
  if (m.version > PROJECT_VERSION) throw new Error('That project was saved by a newer DigiLight. Reload the page to get the newest update, then open it again.');
  const photo = read(m.photo?.file);
  if (!photo) throw new Error('That project has lost its photo.');
  const doc = migrate(JSON.parse(dec.decode(df)));
  if ((await sha256(photo)) !== doc.photo.sha256) throw new Error('That project\'s photo does not match its settings: the file is damaged.');
  let height: ProjectHeight | null = null;
  if (m.height) {
    const png = read(m.height.file);
    if (!png) throw new Error('That project has lost its measured texture.');
    height = { png, width: m.height.width, height: m.height.height, lo: m.height.lo, hi: m.height.hi };
  }
  return { doc, photo: { name: m.photo.name, bytes: photo }, height };
}
