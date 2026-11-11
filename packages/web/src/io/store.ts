// store.ts — autosave: the photo file and the document in IndexedDB, reopened on load.

import type { Doc } from 'core';

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

export interface Saved { photo: Blob; name: string; doc: Doc | null }

export const savePhoto = (photo: Blob, name: string) =>
  tx('readwrite', (s) => { s.put({ photo, name }, 'photo'); s.delete('doc'); });

export const saveDoc = (doc: Doc) => tx('readwrite', (s) => s.put(doc, 'doc'));

export async function loadSaved(): Promise<Saved | null> {
  try {
    const p = await tx<{ photo: Blob; name: string } | undefined>('readonly', (s) => s.get('photo'));
    if (!p) return null;
    const doc = (await tx<Doc | undefined>('readonly', (s) => s.get('doc'))) ?? null;
    return { ...p, doc };
  } catch { return null; } // private windows can refuse IndexedDB: start empty
}
