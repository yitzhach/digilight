// render.worker.ts — the reference renderer off the main thread (BUILD.md Phase 3): rows of an
// export, and the look thumbnails. Each worker holds the photo (shared memory when the page is
// cross-origin isolated, a copy otherwise).

import { guardKappa, LOOKS, neutralDoc, render, withLook, type Doc, type Image } from 'core';
import type { Reply, Request } from './protocol.ts';

let photo: Image | null = null;
const post = (m: Reply, transfer: Transferable[] = []) => self.postMessage(m, { transfer });

function thumbs(id: number, doc: Doc, width: number, flip: boolean): void {
  const p = photo!;
  const w = Math.min(width, p.width);
  // Resizing first and lighting the small picture gives exactly render(photo, look, {width}):
  // the renderer resamples first, and lighting depends only on where a pixel sits (§5.1).
  const small = render(p, neutralDoc(doc.photo), { width: w });
  const smallPhoto = { ...doc.photo, width: small.width, height: small.height };
  for (const look of LOOKS) {
    const d = withLook(doc, look.id, { flip });
    const kappa = guardKappa(p, d);
    const img = render(small, { ...d, photo: smallPhoto }, { kappa });
    post({ type: 'thumb', id, look: look.id, data: img.data, width: img.width, height: img.height }, [img.data.buffer]);
  }
  post({ type: 'done', id });
}

self.onmessage = (e: MessageEvent<Request>) => {
  const m = e.data;
  try {
    if (m.type === 'photo') { photo = { data: m.data, width: m.width, height: m.height }; return; }
    if (!photo) throw new Error('no photo');
    if (m.type === 'render') {
      const img = render(photo, m.doc, { width: m.width, region: m.region, kappa: m.kappa });
      post({ type: 'pixels', id: m.id, data: img.data }, [img.data.buffer]);
    } else thumbs(m.id, m.doc, m.width, m.flip);
  } catch (err) {
    post({ type: 'error', id: 'id' in m ? m.id : -1, message: err instanceof Error ? err.message : String(err) });
  }
};
