// versions.ts — Versions (BUILD.md Phase 6b item 2): "Keep this version" snapshots the document
// with a thumbnail; a tap switches to one (setDoc: one undo step), a hold shows it on the picture
// without changing the document. Kept with the photo: in the autosave and in project files.

import { computed, signal } from '@preact/signals';
import type { Doc } from 'core';
import { saveVersions, type Version } from './io/store.ts';
import { startRelief } from './relief.ts';
import { busy, cmd, doc, kappa, photo, run, say, shown } from './state.ts';
import { docThumb, kappaFor } from './workers/pool.ts';

export const VERSIONS_MAX = 12;
export const VERSION_THUMB = 160;

/** The kept versions and the photo they belong to. */
const kept = signal<{ sha256: string; list: Version[] }>({ sha256: '', list: [] });
/** The open photo's versions (another photo's are not shown, and go once one is kept). */
export const versions = computed(() => (kept.value.sha256 === photo.value?.sha256 ? kept.value.list : []));
/** The version shown while held (its place and the document shown), or null. */
export const comparing = signal<{ i: number; doc: Doc } | null>(null);

const key = (d: Doc) => JSON.stringify(d);
/** Which version the document is now, read from the document (as the looks are), or -1. */
export const currentVersion = computed(() => {
  const d = doc.value;
  return d ? versions.value.findIndex((v) => key(v.doc) === key(d)) : -1;
});

let saveTimer = 0;
function put(list: Version[]): void {
  const sha256 = photo.peek()?.sha256 ?? '';
  kept.value = { sha256, list };
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void saveVersions(list).catch(() => {}), 400);
}

/** Puts back versions saved with this photo (the autosave, a project). */
export function setVersions(list: Version[]): void {
  const sha256 = photo.peek()?.sha256;
  if (sha256) put(list.filter((v) => v.doc.photo.sha256 === sha256));
}

/** Keeps the document as it is now, with its thumbnail. */
export async function keepVersion(): Promise<number> {
  const d = cmd.getDoc(), have = versions.peek();
  const i = have.findIndex((v) => key(v.doc) === key(d));
  if (i >= 0) return i;
  if (have.length >= VERSIONS_MAX) throw new Error(`${VERSIONS_MAX} versions are kept: remove one (×) to keep this one.`);
  const thumb = await docThumb(d, VERSION_THUMB);
  if (photo.peek()?.sha256 !== d.photo.sha256) throw new Error('Another photo was opened.');
  put([...versions.peek(), { doc: d, thumb }]);
  return versions.peek().length - 1;
}

export function removeVersion(i: number): void {
  put(versions.peek().filter((_, j) => j !== i));
}

/** Switches to version i: one undo step. Its measured texture may belong to a crop measured
 *  again since; then it comes back with Texture off, and says so. */
export function useVersion(i: number): void {
  const v = versions.peek()[i]?.doc;
  if (!v) return;
  run(() => {
    try { cmd.setDoc(v); } catch (e) {
      if (v.relief.mode !== 'measured') throw e;
      cmd.setDoc({ ...v, relief: { ...v.relief, mode: 'off' } });
      say('This version\'s measured texture belonged to a crop measured again since, so Texture is off. Use a side-lit photo to bring it back.', true);
    }
  });
}

const sameCrop = (a: Doc, b: Doc) => JSON.stringify(a.photo.crop ?? null) === JSON.stringify(b.photo.crop ?? null);

/** Shows version i on the picture while it is held (the document stays as it is). Texture shows
 *  from the maps the picture has: switching (a tap) shows a version's own exactly. */
export function compareVersion(i: number): void {
  const d = doc.peek(), v0 = versions.peek()[i]?.doc;
  if (!d || !v0 || busy.peek() !== null) return;
  if (!sameCrop(d, v0)) { say('This version has another crop, so it cannot be shown over this one: tap it to switch to it (Undo comes back).'); return; }
  const height = cmd.getMeasured();
  const v = v0.relief.mode === 'measured' && !height ? { ...v0, relief: { ...v0.relief, mode: 'off' as const } } : v0;
  if (v.relief.mode !== 'off' && d.relief.mode === 'off') startRelief(v.relief.mode === 'measured' ? height : null, () => {});
  const c = { i, doc: v };
  comparing.value = c; shown.value = v;
  void kappaFor(v).then((k) => { if (comparing.peek() === c) kappa.value = k; });
}

export function endCompare(): void {
  if (!comparing.peek()) return;
  const d = doc.peek();
  comparing.value = null; shown.value = d;
  if (d) void kappaFor(d).then((k) => { if (doc.peek() === d && !comparing.peek()) kappa.value = k; });
}
