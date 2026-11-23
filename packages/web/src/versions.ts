// versions.ts — Versions (BUILD.md Phase 6b item 2, D-078): "Keep this version" puts the
// document in a strip; tapping one puts it back (one undo step), holding one shows it on the
// picture until released, changing nothing. A version is the whole document, but switching puts
// on everything except the photo and its crop: the crop is the photo's preparation, the same for
// every version. Texture keeps its mode, and measured comes back only where this crop has its
// height. Kept with the autosave and in project files; the thumbnails are made for the picture now.

import { computed, effect, signal } from '@preact/signals';
import { settingsOf, withSettings, type Doc, type Image } from 'core';
import { cropKey } from './io/open.ts';
import { saveVersions } from './io/store.ts';
import { cmd, comparing, doc, kappa, newVersion, photo, run, say, versions, type Version } from './state.ts';
import { docThumbs, kappaFor } from './workers/pool.ts';

const THUMB = 160;
export const versionThumbs = signal<Record<string, Image>>({});

const key = (d: Doc) => JSON.stringify(settingsOf(d));
/** The version the document is now, if any: read from the document, as the looks are. */
export const currentVersion = computed(() => {
  const d = doc.value;
  if (!d) return null;
  const k = key(d);
  return versions.value.find((v) => key(v.doc) === k)?.id ?? null;
});

function keep(list: Version[]): void {
  versions.value = list;
  void saveVersions(list.map((v) => v.doc)).catch(() => {});
}

/** Keeps the document as a new version (not again if it already is one). */
export function keepVersion(): void {
  if (!doc.value) return;
  const at = versions.value.findIndex((v) => v.id === currentVersion.value);
  if (at >= 0) { say(`This is already version ${at + 1}.`); return; }
  keep([...versions.value, newVersion(cmd.getDoc())]);
}

export function removeVersion(id: string): void {
  if (comparing.value?.id === id) comparing.value = null;
  keep(versions.value.filter((v) => v.id !== id));
}

/** The document this version makes on the picture now (what a tap commits). */
const onPicture = (v: Version): Doc => withSettings(cmd.getDoc(), v.doc, cmd.getMeasured() !== null, true);

/** Puts the version back: one undo step. */
export function switchTo(v: Version): void {
  const d = run(() => cmd.applySettings(v.doc, { keepTexture: true }));
  if (d && v.doc.relief.mode === 'measured' && d.relief.mode !== 'measured')
    say('This version had measured texture, made before the photo was cropped again, so Texture is off. Use a side-lit photo again to bring it back.', true);
}

/** Shows the version on the picture while it is held (with its own guard factor once known). */
export function startCompare(v: Version): void {
  let d: Doc;
  try { d = onPicture(v); } catch { return; }
  const c = { id: v.id, doc: d, kappa: kappa.value };
  comparing.value = c;
  void kappaFor(d).then((k) => { if (comparing.peek() === c) comparing.value = { ...c, kappa: k }; });
}
export const stopCompare = (): void => { comparing.value = null; };

// Thumbnails: of the picture now (a new crop makes them again), each version made once.
const picture = computed(() => {
  const p = photo.value, d = doc.value;
  return p && d && d.photo.sha256 === p.sha256 && cropKey(d) === p.crop ? p : null;
});
let thumbsOf: unknown = null;
const asked = new Set<string>();
effect(() => {
  const p = picture.value, list = versions.value;
  if (p !== thumbsOf) { thumbsOf = p; asked.clear(); versionThumbs.value = {}; }
  if (!p) return;
  const now = doc.peek()!.photo, todo = list.filter((v) => !asked.has(v.id));
  if (!todo.length) return;
  for (const v of todo) asked.add(v.id);
  void docThumbs(todo.map((v) => ({ key: v.id, doc: { ...v.doc, photo: now } })), THUMB, (id, img) => {
    if (thumbsOf === p) versionThumbs.value = { ...versionThumbs.value, [id]: img };
  }).catch(() => {});
});
