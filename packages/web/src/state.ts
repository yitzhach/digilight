// state.ts — the app's state as signals. The document changes only through `cmd` (core's
// commands, BUILD.md §3); `preview` shows a not-yet-committed document while a control is held.

import { batch, computed, effect, signal } from '@preact/signals';
import { createCommands, glowKey, lookOf, type Doc, type GlowMaps, type LookMatch, type MeasuredHeight } from 'core';
import { cropKey, decodePhoto, type Photo } from './io/open.ts';
import { loadSaved, saveDoc, saveMeasured, savePhoto, type Saved } from './io/store.ts';
import { resetRelief, startRelief } from './relief.ts';
import { resetTrueRelief } from './truerelief.ts';
import { glowFor, kappaFor, setGuardPhoto, setPoolPhoto, sharedImage, warpPicture } from './workers/pool.ts';

export const cmd = createCommands();

export const photo = signal<Photo | null>(null);
/** The committed document. */
export const doc = signal<Doc | null>(null);
/** What the picture shows: the committed document, or one being dragged. */
export const shown = signal<Doc | null>(null);
/** A control is held: draw at a reduced scale and keep the guard's last factor (§9). */
export const live = signal(false);
export const kappa = signal(1);
/** tool:glow — Glow's maps for the picture shown, or null (Glow off, or not made yet). */
export const glow = signal<GlowMaps | null>(null);
export const selected = signal<string | null>(null);
export const expert = signal(false);
export const before = signal(false);
export const busy = signal<string | null>(null);
/** How far a long job (an export) has got, 0 to 1; null when none runs. */
export const progress = signal<number | null>(null);
export const notice = signal<{ text: string; error: boolean } | null>(null);
/** The last look tapped: only breaks ties where the document matches several (lookOf). */
export const lastTap = signal<LookMatch>({ id: 'original', strength: 1, flip: false });
/** The look the committed document matches, or null (lights changed by hand): read from the
 *  document, never remembered, so Undo and a reload show the truth. */
export const look = computed(() => (doc.value ? lookOf(doc.value, lastTap.value) : null));

export function say(text: string, error = false): void { notice.value = { text, error }; }
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// tool:glow — the maps follow what is shown, made by the guard's worker one request at a time;
// the picture is drawn with the last ones until the next arrive (as with the guard's factor).
let glowBusy = false, glowFailed = '';
const glowTick = signal(0);
effect(() => {
  void glowTick.value;
  const d = shown.value, k = kappa.value, ph = photo.value, cur = glow.peek();
  if (!d || !ph || !(d.finish.glow > 0)) { if (cur) glow.value = null; return; }
  const key = glowKey(d, k);
  if (glowBusy || cur?.key === key || glowFailed === key) return;
  glowBusy = true;
  void glowFor(d, k).then((m) => {
    glowBusy = false; glowFailed = m ? '' : key; // a failure is not asked for again until the light changes
    batch(() => { if (photo.peek() === ph) glow.value = m; glowTick.value++; });
  });
});

/** The picture for a document's crop: the file, or its crop made by the workers. */
async function pictureFor(p: Photo, d: Doc): Promise<Photo> {
  const key = cropKey(d);
  if (key === p.crop) return p;
  const c = d.photo.crop;
  return { ...p, image: c ? await warpPicture(p.file, c.corners) : p.file, crop: key };
}
/** A new picture of the same photo (a crop, or undoing one), given to the workers and waiting
 *  for sync to show it with its document. */
let pending: Photo | null = null;
function givePicture(p: Photo): void {
  resetRelief(); resetTrueRelief();
  setGuardPhoto(p.image, setPoolPhoto(p.image));
  pending = p;
}
let straightening = false, straightened: Promise<void> = Promise.resolve();
/** Resolves once the picture matches the document (after a crop, or undoing one). */
export const pictureReady = (): Promise<void> => straightened;
/** The document's crop changed: make its picture, then show the document (the picture and the
 *  document always go to the screen together). A failed crop is undone. */
function repicture(): void {
  if (!straightening) straightened = makePicture();
}
async function makePicture(): Promise<void> {
  straightening = true; busy.value = 'Straightening the photo…';
  try {
    for (let p = pending ?? photo.peek(); p && cropKey(cmd.getDoc()) !== p.crop; p = pending ?? photo.peek()) givePicture(await pictureFor(p, cmd.getDoc()));
  } catch (e) {
    cmd.undo();
    say(`The photo could not be cropped (${errorText(e)}), so the crop is undone.`, true);
  } finally {
    straightening = false; busy.value = null;
  }
  sync();
}

let saveTimer = 0;
function sync(): void {
  const d = cmd.getDoc(), p = pending ?? photo.peek();
  if (straightening) return; // repicture syncs when its picture is ready
  if (p && cropKey(d) !== p.crop) { repicture(); return; }
  // The picture is drawn at once with the last factor; the guard's new one follows (D-025).
  void kappaFor(d).then((k) => { if (doc.peek() === d) kappa.value = k; });
  if (d.relief.mode !== 'off') startRelief(d.relief.mode === 'measured' ? cmd.getMeasured() : null, (e) => say(`Texture could not be prepared: ${errorText(e)}`, true));
  batch(() => {
    if (pending) { photo.value = pending; kappa.value = 1; glow.value = null; pending = null; }
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

/** Opens a photo file: a neutral document, or `saved` (and its measured height) if it belongs to
 *  this photo. `keep`: autosave the photo (a new photo or a project; not the autosave itself). */
export async function openFile(blob: Blob, name?: string, saved?: Doc | null, measured?: MeasuredHeight | null, keep = !saved): Promise<void> {
  busy.value = 'Opening the photo…';
  try {
    const p = await decodePhoto(blob, name);
    cmd.open({ ...p.image, space: p.space, sha256: p.sha256 });
    resetRelief(); resetTrueRelief();
    let lost: string | null = null;
    if (saved && saved.photo.sha256 === p.sha256) {
      try {
        if (saved.relief.mode === 'measured' && !measured) {
          cmd.load({ ...saved, relief: { ...saved.relief, mode: 'off' } });
          lost = 'The measured texture could not be reopened, so Texture is off. Use a side-lit photo again to bring it back.';
        } else cmd.load(saved, measured ?? null);
      } catch (e) {
        lost = `Your last settings for this photo could not be reopened (${errorText(e)}), so it starts as photographed.`;
      }
    }
    // The file in shared memory once, for the workers; a saved crop is made before the first picture.
    const file = sharedImage(p.image);
    straightening = true; // no sync until this photo's picture is on screen
    let ph: Photo;
    try { ph = await pictureFor({ ...p, image: file, file }, cmd.getDoc()); } finally { straightening = false; }
    setGuardPhoto(ph.image, setPoolPhoto(ph.image));
    batch(() => { photo.value = ph; kappa.value = 1; glow.value = null; lastTap.value = { id: 'original', strength: 1, flip: false }; notice.value = lost ? { text: lost, error: true } : null; });
    sync();
    if (keep) void savePhoto(blob, p.name).then(() => { if (measured) return saveMeasured(measured); }).catch(() => {});
  } catch (e) {
    say(errorText(e), true);
  } finally {
    busy.value = null;
  }
}

/** Reopens the autosaved photo and document, if any; returns what was saved (its versions). */
export async function restore(): Promise<Saved | null> {
  const s = await loadSaved();
  if (s) await openFile(s.photo, s.name, s.doc, s.measured);
  return s;
}
