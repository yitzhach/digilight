// pool.ts — a few render workers. The photo goes to each once per photo: as shared memory when
// the page is cross-origin isolated (all workers read one copy), else as one copy to one worker.

import type { Blurred, Channels, Doc, Height, HorizonInput, Image, MeasuredHeight } from 'core';
import { BLURS, K, outputSize, reliefSize, thumbnail } from 'core';
import type { Reply, Request } from './protocol.ts';

/** The guard judges on a thumbnail of this long side (core guard.ts GUARD_SIZE, §5.7). */
const GUARD_SIZE = 512;

const shared = typeof SharedArrayBuffer !== 'undefined' && globalThis.crossOriginIsolated === true;
const SIZE = shared ? Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1)) : 1;

let workers: Worker[] = [];
/** The photo in shared memory (the staged estimate reads it), if shared. */
let poolPhoto: Image | null = null;
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
  poolPhoto = shared ? p : null;
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

// ---------------------------------------------------------------- Texture's maps (Phase 4)

type WithId = Extract<Request, { id: number }>;
type Job = WithId extends infer R ? (R extends WithId ? Omit<R, 'id'> : never) : never;
const one = async (w: Worker, m: Job): Promise<Reply> => {
  const r = await ask(w, { ...m, id: nextId++ } as WithId);
  if (r.type === 'error') throw new Error(r.message);
  return r;
};
/** Directions [k0, k1) for worker i of n. */
const share = (i: number, n: number): [number, number] => [Math.floor((i * K) / n), Math.floor(((i + 1) * K) / n)];

/** Row bands [y0, y1) of h rows, one per worker. */
const bands = (h: number, n: number) => Array.from({ length: n }, (_, i) => [Math.floor((i * h) / n), Math.floor(((i + 1) * h) / n)] as const);
const f32 = (n: number) => new Float32Array(new SharedArrayBuffer(4 * n));

/** How long each stage of the last estimate took, in ms (the bench prints them). */
export const reliefStages: Record<string, number> = {};
function stopwatch() {
  let t = performance.now();
  return (name: string) => { const now = performance.now(); reliefStages[name] = Math.round(now - t); t = now; };
}

/** The raw estimated height, its stages split across the workers (the same bits as core's
 *  estimateHeight in one go). */
async function rawHeight(ws: Worker[], p: Image): Promise<{ data: Float32Array; width: number; height: number }> {
  const { width: w, height: h, same } = reliefSize(p), n = w * h;
  const lap = stopwatch();
  let img = p;
  if (!same) {
    const out = new Uint8ClampedArray(new SharedArrayBuffer(4 * n));
    await Promise.all(bands(h, ws.length).map(([y0, y1], i) => one(ws[i]!, { type: 'relief-thumb', out, width: w, height: h, y0, y1 })));
    img = { data: out, width: w, height: h };
  }
  lap('resize');
  const ch: Channels = { L: f32(n), cr: f32(n), cg: f32(n), cb: f32(n) };
  await Promise.all(bands(h, ws.length).map(([y0, y1], i) => one(ws[i]!, { type: 'relief-chan', img, ch, y0, y1 })));
  lap('channels');
  const bl = Object.fromEntries(BLURS.map(([k]) => [k, f32(n)])) as unknown as Blurred;
  let next = 0; // five blurs over the workers, each takes the next
  await Promise.all(ws.map(async (wk) => {
    for (let b; (b = BLURS[next++]); ) await one(wk, { type: 'relief-blur', src: ch[b[1]], width: w, height: h, sigma: b[2] * w, out: bl[b[0]] });
  }));
  lap('blurs');
  const raw = f32(n);
  await Promise.all(bands(h, ws.length).map(([y0, y1], i) => one(ws[i]!, { type: 'relief-raw', ch, bl, width: w, raw, y0, y1 })));
  lap('raw');
  return { data: raw, width: w, height: h };
}

/** The height (estimated, or `measured`) and the table's input (worker 0), then given to every worker. */
export async function reliefHeight(alive: () => boolean, measured: MeasuredHeight | null = null): Promise<{ height: Height; inp: HorizonInput }> {
  const ws = start();
  for (const k of Object.keys(reliefStages)) delete reliefStages[k];
  const raw = !measured && shared && ws.length > 1 && poolPhoto ? await rawHeight(ws, poolPhoto) : undefined;
  const lap = stopwatch();
  if (!alive()) throw new Error('a new photo was opened');
  const r = await one(ws[0]!, { type: 'relief-height', shared, ...(raw ? { raw } : {}), ...(measured ? { measured } : {}) });
  if (r.type !== 'height') throw new Error('relief: unexpected reply');
  lap('height and pyramid');
  if (!alive()) throw new Error('a new photo was opened');
  for (const w of ws.slice(1)) w.postMessage({ type: 'relief-input', height: r.height, inp: r.inp } satisfies Request);
  return { height: r.height, inp: r.inp };
}

/** The table's Tmax, directions split across the workers. */
export async function reliefTmax(): Promise<number> {
  const ws = start();
  const vs = await Promise.all(ws.map((w, i) => { const [k0, k1] = share(i, ws.length); return one(w, { type: 'relief-tmax', k0, k1 }); }));
  return Math.max(0, ...vs.map((v) => (v.type === 'value' ? v.value : 0)));
}

/** The table and hollows made by the workers, who then render with them (exports). */
export async function reliefTable(n: number, tmax: number, alive: () => boolean): Promise<void> {
  const ws = start();
  const table = shared ? new Uint8Array(new SharedArrayBuffer(K * n)) : null, ao = shared ? new Uint8Array(new SharedArrayBuffer(n)) : null;
  await Promise.all(ws.map((w, i) => { const [k0, k1] = share(i, ws.length); return one(w, { type: 'relief-layers', k0, k1, tmax, table }); }));
  if (shared) await one(ws[0]!, { type: 'relief-ao', tmax, ao });
  if (!alive()) return; // a new photo: the workers have dropped these maps
  for (const w of ws) w.postMessage({ type: 'relief-maps', table, ao, tmax } satisfies Request);
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
