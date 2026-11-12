// pool.ts — a few render workers. The photo goes to each once per photo: as shared memory when
// the page is cross-origin isolated (all workers read one copy), else as one copy to one worker.

import type { Doc, Image } from 'core';
import { outputSize, thumbnail } from 'core';
import type { Reply, Request } from './protocol.ts';

/** The guard judges on a thumbnail of this long side (core guard.ts GUARD_SIZE, §5.7). */
const GUARD_SIZE = 512;

const shared = typeof SharedArrayBuffer !== 'undefined' && globalThis.crossOriginIsolated === true;
const SIZE = shared ? Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1)) : 1;

let workers: Worker[] = [];
let nextId = 1;
const waiting = new Map<number, { resolve: (r: Reply) => void; reject: (e: Error) => void; onThumb?: (r: Extract<Reply, { type: 'thumb' }>) => void }>();

function start(): Worker[] {
  if (workers.length) return workers;
  workers = Array.from({ length: SIZE }, () => {
    const w = new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<Reply>) => {
      const r = e.data, job = waiting.get(r.id);
      if (!job) return;
      if (r.type === 'thumb') { job.onThumb?.(r); return; }
      waiting.delete(r.id);
      if (r.type === 'error') job.reject(new Error(r.message)); else job.resolve(r);
    };
    return w;
  });
  return workers;
}

function ask(w: Worker, m: Request, onThumb?: (r: Extract<Reply, { type: 'thumb' }>) => void): Promise<Reply> {
  return new Promise((resolve, reject) => {
    waiting.set((m as { id: number }).id, { resolve, reject, onThumb });
    w.postMessage(m);
  });
}

/** Gives every worker the photo (call once per photo); returns it in shared memory, if shared. */
export function setPoolPhoto(p: Image): Image | null {
  for (const w of start()) {
    let data: Uint8ClampedArray;
    if (shared) {
      if (!(p.data.buffer instanceof SharedArrayBuffer)) {
        const sab = new SharedArrayBuffer(p.data.length);
        new Uint8ClampedArray(sab).set(p.data);
        p = { ...p, data: new Uint8ClampedArray(sab) };
      }
      data = p.data;
    } else data = p.data.slice();
    w.postMessage({ type: 'photo', data, width: p.width, height: p.height } satisfies Request, shared ? [] : [data.buffer]);
  }
  return shared ? p : null;
}

/** The reference picture at `width`, rows split across the workers. */
export async function renderRows(doc: Doc, width: number, kappa: number): Promise<Image> {
  const ws = start(), { width: W, height: H } = outputSize(doc.photo, width);
  const out = new Uint8ClampedArray(W * H * 4);
  // More bands than workers, so a slow band does not hold the rest.
  const bands = Math.min(H, ws.length * 4), rowsEach = Math.ceil(H / bands);
  let next = 0;
  await Promise.all(ws.map(async (w) => {
    for (let y; (y = next * rowsEach) < H; ) {
      next++;
      const h = Math.min(rowsEach, H - y), id = nextId++;
      const r = await ask(w, { type: 'render', id, doc, width: W, kappa, region: { x: 0, y, width: W, height: h } });
      if (r.type === 'pixels') out.set(r.data, y * W * 4);
    }
  }));
  return { data: out, width: W, height: H };
}

/** Thumbnails of every look on this photo, `onThumb` as each is ready. */
export function lookThumbs(doc: Doc, width: number, flip: boolean, onThumb: (look: string, img: Image) => void): Promise<unknown> {
  const id = nextId++;
  return ask(start()[0]!, { type: 'thumbs', id, doc, width, flip }, (r) => onThumb(r.look, { data: r.data, width: r.width, height: r.height }));
}

// ---------------------------------------------------------------- the guard's own worker

let guard: Worker | null = null, guardId = 0;
const guardWaiting = new Map<number, (k: number) => void>();

/** Gives the guard worker the photo (call once per photo): the shared photo, from which it makes
 *  its 512 px thumbnail itself, or else the thumbnail made here. */
export function setGuardPhoto(p: Image, sharedPhoto: Image | null): void {
  guard ??= new Worker(new URL('./guard.worker.ts', import.meta.url), { type: 'module' });
  guard.onmessage = (e: MessageEvent<{ id: number; kappa?: number; error?: string }>) => {
    const done = guardWaiting.get(e.data.id);
    guardWaiting.delete(e.data.id);
    done?.(e.data.kappa ?? 1);
  };
  if (sharedPhoto) { guard.postMessage({ photo: sharedPhoto }); return; }
  const t = thumbnail(p, GUARD_SIZE);
  guard.postMessage({ thumb: { data: t === p ? p.data.slice() : t.data, width: t.width, height: t.height } });
}

/** guardKappa(photo, doc), computed by the guard worker. */
export function kappaFor(doc: Doc): Promise<number> {
  const id = ++guardId;
  return new Promise((resolve) => { guardWaiting.set(id, resolve); guard!.postMessage({ id, doc }); });
}
