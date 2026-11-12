// state.ts — the app's state as signals. The document changes only through `cmd` (core's
// commands, BUILD.md §3); `preview` shows a not-yet-committed document while a control is held.

import { batch, signal } from '@preact/signals';
import { createCommands, type Doc } from 'core';
import { decodePhoto, type Photo } from './io/open.ts';
import { loadSaved, saveDoc, savePhoto } from './io/store.ts';
import { resetRelief, startRelief } from './relief.ts';
import { kappaFor, setGuardPhoto, setPoolPhoto } from './workers/pool.ts';

export const cmd = createCommands();

export const photo = signal<Photo | null>(null);
/** The committed document. */
export const doc = signal<Doc | null>(null);
/** What the picture shows: the committed document, or one being dragged. */
export const shown = signal<Doc | null>(null);
/** A control is held: draw at a reduced scale and keep the guard's last factor (§9). */
export const live = signal(false);
export const kappa = signal(1);
export const selected = signal<string | null>(null);
export const expert = signal(false);
export const before = signal(false);
export const busy = signal<string | null>(null);
export const notice = signal<{ text: string; error: boolean } | null>(null);
/** The last look tapped, so Strength and Flip re-apply it. */
export const look = signal<{ id: string; strength: number; flip: boolean }>({ id: 'original', strength: 1, flip: false });

export function say(text: string, error = false): void { notice.value = { text, error }; }
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

let saveTimer = 0;
function sync(): void {
  const d = cmd.getDoc();
  // The picture is drawn at once with the last factor; the guard's new one follows (D-025).
  void kappaFor(d).then((k) => { if (doc.peek() === d) kappa.value = k; });
  if (d.relief.mode !== 'off') startRelief((e) => say(`Texture could not be prepared: ${errorText(e)}`, true));
  batch(() => {
    doc.value = d; shown.value = d; live.value = false;
    if (!d.lights.some((l) => l.id === selected.value)) selected.value = d.lights[0]?.id ?? null;
  });
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void saveDoc(d).catch(() => {}), 400);
}

/** Runs commands (one undo step each) and shows the result; errors become a notice. */
export function run<T>(f: () => T): T | undefined {
  try {
    const r = f();
    sync();
    return r;
  } catch (e) {
    batch(() => { say(errorText(e), true); shown.value = doc.value; live.value = false; });
    return undefined;
  }
}

/** Shows `d` without committing it (while a handle or slider is held). */
export function preview(d: Doc): void { batch(() => { shown.value = d; live.value = true; }); }

/** Opens a photo file: a neutral document, or `saved` if it belongs to this photo. */
export async function openFile(blob: Blob, name?: string, saved?: Doc | null): Promise<void> {
  busy.value = 'Opening the photo…';
  try {
    const p = await decodePhoto(blob, name);
    cmd.open({ ...p.image, space: p.space, sha256: p.sha256 });
    resetRelief();
    if (saved && saved.photo.sha256 === p.sha256) { try { cmd.setDoc(saved); } catch { /* an older document: start neutral */ } }
    setGuardPhoto(p.image, setPoolPhoto(p.image));
    batch(() => { photo.value = p; kappa.value = 1; look.value = { id: 'original', strength: 1, flip: false }; notice.value = null; });
    sync();
    if (!saved) void savePhoto(blob, p.name).catch(() => {});
  } catch (e) {
    say(errorText(e), true);
  } finally {
    busy.value = null;
  }
}

/** Reopens the autosaved photo and document, if any. */
export async function restore(): Promise<void> {
  const s = await loadSaved();
  if (s) await openFile(s.photo, s.name, s.doc);
}
