// store.ts — autosave: the photo file, the document and True Relief's measured height (a PNG,
// 16 bits over red and green, with lo and hi; BUILD.md Phase 5) in IndexedDB, reopened on load.

import { packHeight, unpackHeight, type Doc, type MeasuredHeight, type Settings } from 'core';

const DB = 'digilight', STORE = 'autosave';

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode), r = f(t.objectStore(STORE));
    t.oncomplete = () => { resolve(r ? r.result : undefined); d.close(); };
    t.onerror = () => { reject(t.error); d.close(); };
  });
}

export interface Saved { photo: Blob; name: string; doc: Doc | null; measured: MeasuredHeight | null }
interface SavedHeight { png: Blob; width: number; height: number; lo: number; hi: number }

export const savePhoto = (photo: Blob, name: string) =>
  tx('readwrite', (s) => { s.put({ photo, name }, 'photo'); s.delete('doc'); s.delete('measured'); });

export const saveDoc = (doc: Doc) => tx('readwrite', (s) => s.put(doc, 'doc'));

/** The measured height as a PNG (packHeight): the same 16 bits come back (heightFromPng). */
export async function heightPng(m: MeasuredHeight): Promise<Blob> {
  const c = new OffscreenCanvas(m.width, m.height), g = c.getContext('2d')!;
  g.putImageData(new ImageData(packHeight(m) as Uint8ClampedArray<ArrayBuffer>, m.width, m.height), 0, 0);
  return c.convertToBlob({ type: 'image/png' });
}
export async function heightFromPng(s: SavedHeight): Promise<MeasuredHeight> {
  const bmp = await createImageBitmap(s.png, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0);
  bmp.close();
  return unpackHeight(g.getImageData(0, 0, s.width, s.height).data, s.width, s.height, s.lo, s.hi);
}

export async function saveMeasured(m: MeasuredHeight): Promise<void> {
  const v: SavedHeight = { png: await heightPng(m), width: m.width, height: m.height, lo: m.lo, hi: m.hi };
  await tx('readwrite', (s) => s.put(v, 'measured'));
}

export async function loadSaved(): Promise<Saved | null> {
  try {
    const p = await tx<{ photo: Blob; name: string } | undefined>('readonly', (s) => s.get('photo'));
    if (!p) return null;
    const doc = (await tx<Doc | undefined>('readonly', (s) => s.get('doc'))) ?? null;
    const h = await tx<SavedHeight | undefined>('readonly', (s) => s.get('measured'));
    const measured = h ? await heightFromPng(h).catch(() => null) : null;
    return { ...p, doc, measured };
  } catch { return null; } // private windows can refuse IndexedDB: start empty
}

/** Saved presets (Settings window): a convenience only, Safari deletes it after seven days
 *  without a visit, so the presets file is the keeping place (Phase 6a item 4). */
export interface Preset { name: string; settings: Settings }
export const savePresets = (list: Preset[]) => tx('readwrite', (s) => s.put(list, 'presets'));
export async function loadPresets(): Promise<Preset[]> {
  try { return (await tx<Preset[] | undefined>('readonly', (s) => s.get('presets'))) ?? []; } catch { return []; }
}

/** Recent projects (Settings window): the last few saved or opened, newest first. A convenience
 *  only, like the presets: the `.digilight` file is the keeping place (Phase 6b item 3). */
export interface Recent { name: string; when: string; file: Blob }
export const RECENT_MAX = 5;
export async function loadRecent(): Promise<Recent[]> {
  try { return (await tx<Recent[] | undefined>('readonly', (s) => s.get('recent'))) ?? []; } catch { return []; }
}
export async function addRecent(r: Recent): Promise<Recent[]> {
  const list = [r, ...(await loadRecent()).filter((x) => x.name !== r.name)].slice(0, RECENT_MAX);
  await tx('readwrite', (s) => s.put(list, 'recent')).catch(() => {});
  return list;
}

