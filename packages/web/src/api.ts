// api.ts — window.digilight: the commands (§7) for scripts and AI agents in the page. Each one
// changes the document through core's commands and updates the screen. `open` also takes a
// File, Blob or URL; `export` renders, encodes and returns the picture and its record.

import type { ExportOptions } from './io/export.ts';
import { exportPicture } from './io/export.ts';
import { exportNow } from './panel/ExportPanel.tsx';
import { cmd, doc, openFile, photo, run } from './state.ts';
import { lastMeasure, measureFromSources } from './truerelief.ts';

type Fn = (...a: never[]) => unknown;
const wrap = <F extends Fn>(f: F) => ((...a: Parameters<F>) => {
  let out: unknown, err: unknown;
  run(() => { try { out = f(...a); } catch (e) { err = e; throw e; } });
  if (err) throw err;
  return out;
}) as F;

async function blobOf(src: Blob | string, name?: string): Promise<Blob> {
  if (typeof src === 'string') {
    const r = await fetch(src);
    if (!r.ok) throw new Error(`could not fetch ${src}: ${r.status}`);
    return new File([await r.blob()], name ?? (src.split('/').pop() || 'photo'), { type: r.headers.get('content-type') ?? '' });
  }
  if (!(src instanceof Blob)) throw new Error('a photo is a File, a Blob or a URL in the app');
  return src;
}
type SideSource = { src: Blob | string; from?: number; elevation?: number; lamp?: { left: number; above: number; out: number } };

export function installApi(): void {
  const api = {
    async open(src: Blob | string, name?: string) {
      src = await blobOf(src, name);
      await openFile(src, name);
      const p = photo.value;
      if (!p) throw new Error('the photo did not open (see the message on screen)');
      return { width: p.image.width, height: p.image.height, space: p.space, sha256: p.sha256, looks: cmd.looks().map((l) => l.id) };
    },
    getDoc: () => cmd.getDoc(),
    setDoc: wrap(cmd.setDoc),
    get: (path: string) => cmd.get(path),
    set: wrap(cmd.set),
    describe: () => cmd.describe(),
    getSettings: (opts?: { relief?: boolean }) => cmd.getSettings(opts),
    applySettings: wrap(cmd.applySettings),
    looks: () => cmd.looks(),
    applyLook: wrap(cmd.applyLook),
    addLight: wrap(cmd.addLight),
    updateLight: wrap(cmd.updateLight),
    removeLight: wrap(cmd.removeLight),
    setRelief: wrap(cmd.setRelief),
    /** True Relief (§7, D-043): measureRelief({photos: [{src, from?, elevation?, lamp?}], widthCm?}),
     *  src a File, Blob or URL. Measures in a worker and switches Texture to the measurement. */
    async measureRelief(opts: { photos: SideSource[]; widthCm?: number }) {
      if (!photo.value) throw new Error('open a photo first');
      const photos = await Promise.all(opts.photos.map(async ({ src, ...p }) => ({ ...p, src: await blobOf(src) })));
      const r = await measureFromSources({ photos, ...(opts.widthCm ? { widthCm: opts.widthCm } : {}) });
      return { ...r, doc: cmd.getDoc() };
    },
    /** The measured height (16 bits between lo and hi) and how it was measured, or null. */
    getMeasured() {
      const m = cmd.getMeasured();
      return m && { ...m, how: lastMeasure.value };
    },
    render: (opts?: Parameters<typeof cmd.render>[0]) => cmd.render(opts),
    /** Renders and returns {blob, record, name}; `download: true` also saves them. */
    async export(opts: ExportOptions & { download?: boolean } = {}) {
      if (opts.download) return exportNow(opts);
      if (!photo.value || !doc.value) throw new Error('open a photo first');
      return exportPicture(photo.value, doc.value, opts);
    },
    undo: wrap(cmd.undo),
    redo: wrap(cmd.redo),
    reset: wrap(cmd.reset),
  };
  (window as unknown as { digilight: typeof api }).digilight = api;
}
