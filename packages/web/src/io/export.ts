// export.ts — the picture at full size (or a chosen width) from the reference renderer, rows
// split across the worker pool, encoded by canvas.toBlob from a canvas in the photo's colour
// space (a Display P3 photo keeps its profile), with a .json record beside it: the document and
// the SHA-256 of the photo file, of the picture's RGBA pixels and of the encoded file.

import { outputSize, type Doc } from 'core';
import { reliefForExport } from '../relief.ts';
import { kappaFor, renderRows } from '../workers/pool.ts';
import { canvas2d, imageData } from './colour.ts';
import type { Photo } from './open.ts';
import { sha256 } from './open.ts';

export interface ExportOptions { width?: number; format?: 'jpeg' | 'png'; quality?: number }
export interface ExportRecord {
  app: 'DigiLight 2'; exported: string; document: Doc;
  photo: { name: string; sha256: string; width: number; height: number; space: string };
  picture: { width: number; height: number; format: 'jpeg' | 'png'; quality?: number; pixelsSha256: string; fileSha256: string };
}
export interface Exported { blob: Blob; record: ExportRecord; name: string }

/** Lets the page draw (a message, a bar) before the next step; a hidden tab draws no frames, so
 *  at most 100 ms. */
const frame = () => new Promise<void>((r) => {
  let done = false;
  const go = () => { if (!done) { done = true; setTimeout(r, 0); } };
  requestAnimationFrame(go); setTimeout(go, 100);
});

/** The picture and its record. `onProgress` hears 0 to 1 as it goes (the rows are most of it).
 *  Nothing long runs on the page's own thread but the encoding, so the bar keeps moving (D-058). */
export async function exportPicture(photo: Photo, doc: Doc, opts: ExportOptions = {}, onProgress: (f: number) => void = () => {}): Promise<Exported> {
  const format = opts.format ?? 'jpeg', quality = opts.quality ?? 0.92;
  if (format !== 'jpeg' && format !== 'png') throw new Error('format must be "jpeg" or "png"');
  if (!(quality > 0 && quality <= 1)) throw new Error('quality must be over 0 and at most 1');
  const width = opts.width ?? photo.image.width;
  outputSize(doc.photo, width); // checks the width: never over the photo's
  onProgress(0);
  await frame();
  if (doc.relief.mode !== 'off') await reliefForExport(() => {});
  const kappa = await kappaFor(doc); // the guard worker: exactly guardKappa(photo, doc)
  const img = await renderRows(doc, width, kappa, (f) => onProgress(0.85 * f));
  await frame();
  const [canvas, g] = canvas2d(img.width, img.height, photo.space);
  g.putImageData(imageData(img.data, img.width, img.height, photo.space), 0, 0);
  const type = format === 'png' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('The browser could not encode the picture; try a smaller size.'))), type, quality));
  canvas.width = canvas.height = 0; // free its memory now
  onProgress(0.95);
  const [pixelsSha256, fileSha256] = await Promise.all([sha256(img.data as Uint8ClampedArray<ArrayBuffer>), sha256(await blob.arrayBuffer())]);
  const base = photo.name.replace(/\.[^.]*$/, '') || 'picture';
  return {
    blob, name: `${base}-digilight.${format === 'png' ? 'png' : 'jpg'}`,
    record: {
      app: 'DigiLight 2', exported: new Date().toISOString(), document: doc,
      photo: { name: photo.name, sha256: photo.sha256, width: photo.image.width, height: photo.image.height, space: photo.space },
      picture: { width: img.width, height: img.height, format, ...(format === 'jpeg' ? { quality } : {}), pixelsSha256, fileSha256 },
    },
  };
}

/** Saves the picture and its record to the person's downloads. */
export function download(e: Exported): void {
  const save = (blob: Blob, name: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };
  save(e.blob, e.name);
  save(new Blob([JSON.stringify(e.record, null, 2)], { type: 'application/json' }), e.name.replace(/\.\w+$/, '.json'));
}

/** The picture as a file the phone's share sheet takes ("Save Image" puts it in Photos). */
const asFile = (e: Exported) => new File([e.blob], e.name, { type: e.blob.type });

/** True where the browser can hand files to the system share sheet (phones, Safari). */
export function canShare(e: Exported): boolean {
  try { return typeof navigator.share === 'function' && navigator.canShare?.({ files: [asFile(e)] }) === true; } catch { return false; }
}

/** Opens the share sheet with the picture. Must run in a tap: the export itself takes too long
 *  for the browser to still count it as one, so the app shows a button once it is ready. */
export async function share(e: Exported): Promise<'shared' | 'cancelled'> {
  try {
    await navigator.share({ files: [asFile(e)] });
    return 'shared';
  } catch (err) {
    if ((err as Error).name === 'AbortError') return 'cancelled';
    throw err;
  }
}
