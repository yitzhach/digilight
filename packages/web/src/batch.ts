// batch.ts — Apply to more photos (BUILD.md Phase 6b item 5): the open photo's room light, lights,
// tone and finish (not Texture: it belongs to its own photo) rendered onto each of several photos
// at full size by the reference renderer, one photo in memory at a time, into one zip. The render
// workers take each photo in turn and get the open photo back at the end (Texture's maps in the
// workers are made again when next needed).

import { neutralDoc, withSettings } from 'core';
import { encodePicture, frame } from './io/export.ts';
import { decodePhoto } from './io/open.ts';
import { writeZip, type Entry } from './io/zip.ts';
import { resetRelief } from './relief.ts';
import { busy, cmd, photo, progress, run } from './state.ts';
import { kappaFor, renderRows, setGuardPhoto, setPoolPhoto } from './workers/pool.ts';

export interface BatchResult { zip: File; done: string[]; failed: { name: string; error: string }[] }

export async function applyToMore(files: Blob[], opts: { format?: 'jpeg' | 'png' } = {}, onProgress: (f: number, name: string) => void = () => {}): Promise<BatchResult> {
  const cur = photo.value;
  if (!cur) throw new Error('Open a photo and light it first: its settings go onto the others.');
  if (!files.length) throw new Error('Choose one or more photos.');
  const settings = cmd.getSettings({ relief: false }), format = opts.format ?? 'jpeg';
  const entries: Entry[] = [], done: string[] = [], failed: BatchResult['failed'] = [], used = new Set<string>();
  try {
    for (let i = 0; i < files.length; i++) {
      const name = (files[i] as File).name ?? `photo-${i + 1}`;
      onProgress(i / files.length, name);
      await frame();
      try {
        const p = await decodePhoto(files[i]!, name);
        const doc = withSettings(neutralDoc({ width: p.image.width, height: p.image.height, space: p.space, sha256: p.sha256 }), settings, false);
        setGuardPhoto(p.image, setPoolPhoto(p.image));
        const kappa = await kappaFor(doc);
        const img = await renderRows(doc, p.image.width, kappa, (f) => onProgress((i + 0.9 * f) / files.length, name));
        const blob = await encodePicture(img, p.space, format);
        let out = `${name.replace(/\.[^.]*$/, '') || 'picture'}-digilight.${format === 'png' ? 'png' : 'jpg'}`;
        for (let n = 2; used.has(out); n++) out = out.replace(/(-\d+)?(\.\w+)$/, `-${n}$2`);
        used.add(out);
        entries.push({ name: out, data: new Uint8Array(await blob.arrayBuffer()) });
        done.push(name);
      } catch (e) {
        failed.push({ name, error: e instanceof Error ? e.message : String(e) });
      }
    }
  } finally {
    // The open photo back in the workers; Texture's worker maps are made again when next needed.
    setGuardPhoto(cur.image, setPoolPhoto(cur.image));
    resetRelief();
    run(() => cmd.getDoc()); // restarts Texture for the open photo if it is on
  }
  onProgress(1, '');
  return { zip: new File([writeZip(entries)], 'digilight-pictures.zip', { type: 'application/zip' }), done, failed };
}

/** The Settings window's button: progress on screen, then the zip offered. */
export async function applyToMoreNow(files: File[], offer: (f: File) => Promise<void>, say: (t: string, e?: boolean) => void): Promise<void> {
  busy.value = 'Lighting your photos…';
  progress.value = 0;
  try {
    const r = await applyToMore(files, {}, (f) => { progress.value = f; });
    if (!r.done.length) { say(`None of the photos could be lit: ${r.failed.map((x) => `${x.name}: ${x.error}`).join('; ')}`, true); return; }
    await offer(r.zip);
    const n = r.done.length;
    say(`Lit ${n} photo${n === 1 ? '' : 's'} alike${r.failed.length ? `; could not light ${r.failed.map((x) => `${x.name} (${x.error})`).join(', ')}` : ''}.`, r.failed.length > 0);
  } catch (e) {
    say(e instanceof Error ? e.message : String(e), true);
  } finally { busy.value = null; progress.value = null; }
}
