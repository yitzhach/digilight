// guard.worker.ts — protect whites (§5.7) off the main thread, so letting go of a light draws at
// once and the guard's factor follows. It needs only the guard's 512 px thumbnail of the photo,
// which is its own guard thumbnail, so the factor is exactly guardKappa(photo, doc).

import { guardKappa, type Doc, type Image } from 'core';

let thumb: Image | null = null;
self.onmessage = (e: MessageEvent<{ thumb?: Image; id?: number; doc?: Doc }>) => {
  const m = e.data;
  if (m.thumb) { thumb = m.thumb; return; }
  try {
    self.postMessage({ id: m.id, kappa: guardKappa(thumb!, m.doc!) });
  } catch (err) {
    self.postMessage({ id: m.id, error: err instanceof Error ? err.message : String(err) });
  }
};
