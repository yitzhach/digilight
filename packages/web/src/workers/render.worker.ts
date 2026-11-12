// render.worker.ts — the reference renderer off the main thread (BUILD.md Phase 3): rows of an
// export, the look thumbnails, and Texture's maps (Phase 4). Each worker holds the photo and the
// maps (shared memory when the page is cross-origin isolated, a copy otherwise).

import {
  aoFromTable, channelRows, estimateHeight, gauss, guardKappa, normalise, rawRows, resampleRegion, horizonInput, horizonLayer, horizonTmax, K, LOOKS, neutralDoc, render, withLook,
  type Doc, type Height, type HorizonInput, type Image, type ReliefMaps,
} from 'core';
import type { Reply, Request } from './protocol.ts';

let photo: Image | null = null;
let height: Height | null = null, inp: HorizonInput | null = null, table: Uint8Array | null = null, maps: ReliefMaps | null = null;
const post = (m: Reply, transfer: Transferable[] = []) => self.postMessage(m, { transfer });

function thumbs(id: number, doc: Doc, width: number, flip: boolean): void {
  const p = photo!;
  const w = Math.min(width, p.width);
  // Resizing first and lighting the small picture gives exactly render(photo, look, {width}):
  // the renderer resamples first, and lighting depends only on where a pixel sits (§5.1).
  // Thumbnails show the Light layer only (Texture's maps are made for the full photo).
  const small = render(p, neutralDoc(doc.photo), { width: w });
  const smallPhoto = { ...doc.photo, width: small.width, height: small.height };
  for (const look of LOOKS) {
    const d = withLook(doc, look.id, { flip });
    const kappa = guardKappa(p, d);
    const img = render(small, { ...d, photo: smallPhoto, relief: { ...d.relief, mode: 'off' } }, { kappa });
    post({ type: 'thumb', id, look: look.id, data: img.data, width: img.width, height: img.height }, [img.data.buffer]);
  }
  post({ type: 'done', id });
}

/** A copy of a typed array in shared memory, so the other workers read this one. */
function share<T extends Float32Array | Uint8Array>(a: T): T {
  const b = new (a.constructor as new (buf: SharedArrayBuffer) => T)(new SharedArrayBuffer(a.byteLength));
  b.set(a as never);
  return b;
}

self.onmessage = (e: MessageEvent<Request>) => {
  const m = e.data;
  try {
    if (m.type === 'photo') { photo = { data: m.data, width: m.width, height: m.height }; height = inp = table = maps = null; return; }
    if (m.type === 'relief-input') { height = m.height; inp = m.inp; table = maps = null; return; }
    if (m.type === 'relief-maps') {
      const n = height!.width * height!.height;
      maps = { ...height!, table: m.table ?? table!, ao: m.ao ?? aoFromTable(table!, n, m.tmax), tmax: m.tmax };
      return;
    }
    if (!photo) throw new Error('no photo');
    switch (m.type) {
      case 'render': {
        if (m.doc.relief.mode !== 'off' && !maps) throw new Error('Texture is still being prepared');
        const img = render(photo, m.doc, { width: m.width, region: m.region, kappa: m.kappa, ...(maps ? { relief: maps } : {}) });
        post({ type: 'pixels', id: m.id, data: img.data }, [img.data.buffer]);
        break;
      }
      case 'thumbs': thumbs(m.id, m.doc, m.width, m.flip); break;
      case 'relief-thumb': {
        const img = resampleRegion(photo, m.width, m.height, 0, m.y0, m.width, m.y1 - m.y0);
        m.out.set(img.data, m.y0 * m.width * 4);
        post({ type: 'done', id: m.id });
        break;
      }
      case 'relief-chan': channelRows(m.img, m.ch, m.y0, m.y1); post({ type: 'done', id: m.id }); break;
      case 'relief-blur': m.out.set(gauss(m.src, m.width, m.height, m.sigma)); post({ type: 'done', id: m.id }); break;
      case 'relief-raw': rawRows(m.ch, m.bl, m.width, m.raw, m.y0, m.y1); post({ type: 'done', id: m.id }); break;
      case 'relief-height': {
        let h = m.raw ? normalise(m.raw.data, m.raw.width, m.raw.height) : estimateHeight(photo);
        if (m.shared) h = { ...h, h: share(h.h), p: share(h.p), q: share(h.q) };
        let i = horizonInput(h.h, h.width, h.height, true);
        if (m.shared) i = { ...i, pyramid: i.pyramid.map((L) => ({ ...L, data: share(L.data) })) };
        height = h; inp = i; table = maps = null;
        post({ type: 'height', id: m.id, height: h, inp: i });
        break;
      }
      case 'relief-tmax': post({ type: 'value', id: m.id, value: horizonTmax(inp!, m.k0, m.k1) }); break;
      case 'relief-layers': {
        const n = inp!.width * inp!.height;
        table = m.table ?? table ?? new Uint8Array(K * n);
        const best = new Float64Array(n);
        for (let k = m.k0; k < m.k1; k++) horizonLayer(inp!, k, m.tmax, table.subarray(k * n, (k + 1) * n), best);
        post({ type: 'done', id: m.id });
        break;
      }
      case 'relief-ao': {
        const n = inp!.width * inp!.height, ao = aoFromTable(table!, n, m.tmax);
        if (m.ao) m.ao.set(ao);
        post({ type: 'done', id: m.id });
        break;
      }
    }
  } catch (err) {
    post({ type: 'error', id: 'id' in m ? m.id : -1, message: err instanceof Error ? err.message : String(err) });
  }
};
