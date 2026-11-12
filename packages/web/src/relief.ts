// relief.ts — Texture's maps for the open photo (BUILD.md Phase 4): the height and the table's
// input from the workers, then the table twice at once: on the GPU for the picture (Stage: Tmax,
// then two directions a frame) and in the workers for exports (Tmax, then the layers). Started when Texture
// is first switched on for a photo; the picture shows the Light layer until the maps are ready.
// The height is the estimate, or True Relief's measured height (Phase 5): a new source starts over.

import { signal } from '@preact/signals';
import type { Height, HorizonInput, MeasuredHeight } from 'core';
import { reliefHeight, reliefTable, reliefTmax } from './workers/pool.ts';

export interface ReliefInput { height: Height; inp: HorizonInput; tmax: Promise<number> }

/** What the GPU builds the table from (Stage watches it). */
export const reliefInput = signal<ReliefInput | null>(null);
/** The picture shows Texture (the GPU's maps are ready). */
export const reliefShown = signal(false);
/** Texture switched on to maps ready on screen, in ms (the bench reads it). */
export const reliefTiming = signal<{ height?: number; gpu?: number; cpu?: number } | null>(null);

let gen = 0, t0 = 0, cpu: Promise<void> | null = null;
/** The height the maps are made from: null for the estimate, else the measured one. */
let source: MeasuredHeight | null = null;

/** Forgets the maps (a new photo). */
export function resetRelief(): void {
  gen++; cpu = null; source = null;
  reliefInput.value = null; reliefShown.value = false; reliefTiming.value = null;
}

/** Starts making the maps for the open photo from `from` (null: estimated), once per height. */
export function startRelief(from: MeasuredHeight | null, onError: (e: Error) => void): void {
  if (from !== source) { resetRelief(); source = from; }
  if (cpu) return;
  const me = gen;
  t0 = performance.now();
  const alive = () => me === gen;
  cpu = (async () => {
    const { height, inp } = await reliefHeight(alive, from);
    if (me !== gen) return;
    reliefTiming.value = { ...reliefTiming.value, height: performance.now() - t0 };
    // The GPU finds Tmax itself where it can (D-039); the workers find their own for exports.
    const tmax = reliefTmax();
    reliefInput.value = { height, inp, tmax };
    await reliefTable(height.width * height.height, await tmax, alive);
    if (me === gen) reliefTiming.value = { ...reliefTiming.value, cpu: performance.now() - t0 };
  })();
  // A failed build is forgotten, so the next start (or export) tries again.
  cpu.catch((e: Error) => { if (me === gen) { cpu = null; onError(e); } });
}

/** Called by Stage when the GPU's maps are in use. */
export function gpuReady(): void {
  reliefShown.value = true;
  reliefTiming.value = { ...reliefTiming.value, gpu: performance.now() - t0 };
}

/** Resolves when the workers can render with Texture (exports wait for it). After a failure it
 *  builds again, so it reports this build's outcome, never an earlier one's. */
export async function reliefForExport(onError: (e: Error) => void): Promise<void> {
  startRelief(source, onError);
  await cpu;
}
