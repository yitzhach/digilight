// truerelief.ts — True Relief's flow in the app (BUILD.md Phase 5, §8 section 3): side-lit photos
// to the measure worker, which lines each up (about 10 s) and reads the light's axis; two small
// previews, the height as measured with the light from the axis's upper end and turned over (the
// other end), lit from the axis's upper-left end; "Which looks right?" measures at relief size
// and hands the height to the document (cmd.setMeasured). A dial per photo fine-tunes its axis.

import { signal } from '@preact/signals';
import type { MeasuredHeight } from 'core';
import { decodePhoto } from './io/open.ts';
import { saveMeasured } from './io/store.ts';
import { cmd, photo, run, say } from './state.ts';
import type { MeasureReply, MeasureRequest, ShotSpec } from './workers/measure.worker.ts';

export interface Shot {
  name: string;
  /** The axis read from the pair (0 to 180, §5.1) and how clearly the shading runs one way. */
  axis: number; coherence: number;
  /** The axis as the dial sets it (the read one until turned). */
  dial: number;
  /** A lamp's place in cm (expert; the photo then comes from the photo's tripod position). */
  lamp: { left: number; above: number; out: number } | null;
}
export interface Previews { width: number; height: number; a: Uint8ClampedArray; b: Uint8ClampedArray | null }

export const flowOpen = signal(false);
export const shots = signal<Shot[]>([]);
/** Degrees above the picture's face for every sun-like photo (expert; §10 Phase 5: 20). */
export const elevation = signal(20);
/** The piece's width in cm (expert; needed for a lamp in cm). */
export const widthCm = signal<number | null>(null);
export const previews = signal<Previews | null>(null);
/** What the worker is doing, and how far (0 to 1, estimated from the time it usually takes). */
export const progress = signal<{ text: string; frac: number } | null>(null);
export const flowError = signal<string | null>(null);
/** How the last height was measured (window.digilight.getMeasured reports it). */
export const lastMeasure = signal<{ shots: ShotSpec[]; widthCm: number | null; check: number[] | null } | null>(null);

let worker: Worker | null = null, flatFor: unknown = null, nextId = 1, previewId = 0;
const waiting = new Map<number, { resolve: (r: MeasureReply) => void; reject: (e: Error) => void; onProgress?: (t: string) => void }>();

function start(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('./workers/measure.worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (e: MessageEvent<MeasureReply>) => {
    const r = e.data, job = waiting.get(r.id);
    if (!job) return;
    if (r.type === 'progress') { job.onProgress?.(r.text); return; }
    waiting.delete(r.id);
    if (r.type === 'error') job.reject(new Error(r.message)); else job.resolve(r);
  };
  return (worker = w);
}

type WithId = Extract<MeasureRequest, { id: number }>;
type Job = WithId extends infer R ? (R extends WithId ? Omit<R, 'id'> : never) : never;
function ask<T extends MeasureReply['type']>(m: Job, transfer: Transferable[] = [], onProgress?: (t: string) => void): Promise<Extract<MeasureReply, { type: T }>> {
  const w = start(), id = nextId++;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve: resolve as (r: MeasureReply) => void, reject, ...(onProgress ? { onProgress } : {}) });
    w.postMessage({ ...m, id }, transfer);
  });
}

/** The worker gets the open photo once per photo. */
function sendFlat(): void {
  const p = photo.peek();
  if (!p) throw new Error('Open a photo of the piece first.');
  if (flatFor === p) return;
  start().postMessage({ type: 'flat', data: p.image.data.slice(), width: p.image.width, height: p.image.height } satisfies MeasureRequest);
  flatFor = p;
}

/** Shows a stage's progress, moving with the time it usually takes (ms). */
function timed<T>(text: string, expected: number, job: (setText: (t: string) => void) => Promise<T>, from = 0, to = 1): Promise<T> {
  const t0 = performance.now();
  let label = text;
  const tick = () => { progress.value = { text: label, frac: from + (to - from) * Math.min(0.95, (performance.now() - t0) / expected) }; };
  tick();
  const timer = setInterval(tick, 200);
  return job((t) => { label = t; tick(); }).finally(() => clearInterval(timer));
}

const dist = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180);
/** The end of an axis toward the upper left (where the previews' light comes from). */
export const upperLeft = (axis: number) => (dist(axis, 135) <= dist(axis + 180, 135) ? axis : axis + 180);

/** Each photo's light: A takes the axis's upper end (as core does with no `from`), B the other. */
export function specs(choice: 'a' | 'b'): ShotSpec[] {
  return shots.peek().map((s) => (s.lamp ? { lamp: s.lamp } : { from: choice === 'a' ? s.dial : s.dial + 180, elevation: elevation.peek() }));
}
const cm = () => widthCm.peek() ?? undefined;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Forgets the flow (a new photo was opened). */
export function resetTrueRelief(): void {
  worker?.terminate(); worker = null; flatFor = null;
  for (const j of waiting.values()) j.reject(new Error('a new photo was opened'));
  waiting.clear();
  flowOpen.value = false; shots.value = []; previews.value = null; progress.value = null; flowError.value = null; lastMeasure.value = null;
}

export function closeFlow(): void {
  if (worker) worker.postMessage({ type: 'clear' } satisfies MeasureRequest);
  flowOpen.value = false; shots.value = []; previews.value = null; progress.value = null; flowError.value = null;
}

/** Lines each side-lit photo up and reads its axis (one to three photos in all). */
async function addPhotos(files: (Blob & { name?: string })[]): Promise<void> {
  sendFlat();
  if (shots.peek().length + files.length > 3) throw new Error('Use one to three side-lit photos.');
  for (const [k, f] of files.entries()) {
    const name = f.name ?? `photo ${k + 1}`, of = files.length > 1 ? ` ${k + 1} of ${files.length}` : '';
    const r = await timed(`Lining up the side-lit photo${of}…`, 10_000, async () => {
      const p = await decodePhoto(f, name), data = p.image.data;
      return ask<'added'>({ type: 'add', data, width: p.image.width, height: p.image.height }, [data.buffer]);
    }, k / files.length, (k + 1) / files.length);
    shots.value = [...shots.peek(), { name, axis: r.axis, coherence: r.coherence, dial: r.axis, lamp: null }];
  }
}

/** The panel's button: add photos, then show the two previews. */
export async function addSidePhotos(files: File[]): Promise<void> {
  flowOpen.value = true; flowError.value = null;
  try {
    await addPhotos(files);
    progress.value = null;
    await refreshPreviews();
  } catch (e) {
    progress.value = null; flowError.value = msg(e);
  }
}

/** Measures at long side 512 for the two previews (after a photo, the dial or an expert change). */
export async function refreshPreviews(): Promise<void> {
  const s = shots.peek();
  if (!s.length) return;
  const id = ++previewId, first = s.find((x) => !x.lamp);
  try {
    const r = await ask<'previews'>({ type: 'preview', shots: specs('a'), light: first ? upperLeft(first.dial) : 135, ...(cm() ? { widthCm: cm()! } : {}) });
    if (id === previewId) { previews.value = { width: r.width, height: r.height, a: r.a, b: r.b }; flowError.value = null; }
  } catch (e) {
    if (id === previewId) flowError.value = msg(e);
  }
}

/** Measures at relief size and gives the document the height; Depth starts from the measurement. */
async function measure(sp: ShotSpec[]): Promise<{ height: MeasuredHeight; depth: number; check: number[] | null }> {
  const r = await timed('Measuring the surface…', 10_000, (setText) =>
    ask<'measured'>({ type: 'measure', shots: sp, ...(cm() ? { widthCm: cm()! } : {}) }, [], setText));
  progress.value = null;
  const ok = run(() => cmd.setMeasured(r.height, r.depth));
  if (!ok) throw new Error('The measurement did not fit this photo. Open the photo again and retry.');
  lastMeasure.value = { shots: sp, widthCm: widthCm.peek(), check: r.check };
  void saveMeasured(r.height).catch(() => {});
  return r;
}

/** "Which looks right?": the chosen preview's ends, measured at relief size. */
export async function choose(choice: 'a' | 'b'): Promise<void> {
  flowError.value = null;
  try {
    await measure(specs(choice));
    closeFlow();
    say('Measured from your side-lit photo.');
  } catch (e) {
    progress.value = null; flowError.value = msg(e);
  }
}

/** window.digilight.measureRelief: the same steps without the previews. A photo without `from`
 *  takes its axis's upper end (`assumedEnd`; the other end is + 180), as core's command does. */
export async function measureFromSources(opts: {
  photos: { src: Blob; from?: number; elevation?: number; lamp?: { left: number; above: number; out: number } }[]; widthCm?: number;
}): Promise<{ depth: number; check: number[] | null; photos: { axis: number; from: number | null; elevation: number | null; assumedEnd: boolean }[] }> {
  if (opts.photos.length < 1 || opts.photos.length > 3) throw new Error('True Relief takes one to three side-lit photos');
  closeFlow();
  widthCm.value = opts.widthCm ?? null;
  try {
    await addPhotos(opts.photos.map((p) => p.src));
    const read = shots.peek();
    const sp: ShotSpec[] = opts.photos.map((p, k) => (p.lamp ? { lamp: p.lamp } : { from: p.from ?? read[k]!.axis, elevation: p.elevation ?? 20 }));
    const r = await measure(sp);
    return {
      depth: r.depth, check: r.check,
      photos: sp.map((s, k) => ({ axis: read[k]!.axis, from: 'from' in s ? s.from : null, elevation: 'from' in s ? s.elevation : null, assumedEnd: !opts.photos[k]!.lamp && opts.photos[k]!.from === undefined })),
    };
  } finally {
    closeFlow();
  }
}
