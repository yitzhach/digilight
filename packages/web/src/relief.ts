// relief.ts — Texture's maps for the open photo (BUILD.md Phase 4): the height and the table's
// input from a worker, Tmax across the workers, then the table twice at once: on the GPU for the
// picture (Stage, two directions a frame) and in the workers for exports. Started when Texture
// is first switched on for a photo; the picture shows the Light layer until the maps are ready.

import { signal } from '@preact/signals';
import type { Height, HorizonInput } from 'core';
import { reliefHeight, reliefTable, reliefTmax } from './workers/pool.ts';

export interface ReliefInput { height: Height; inp: HorizonInput; tmax: number }

/** What the GPU builds the table from (Stage watches it). */
export const reliefInput = signal<ReliefInput | null>(null);
/** The picture shows Texture (the GPU's maps are ready). */
export const reliefShown = signal(false);
/** Texture switched on to maps ready on screen, in ms (the bench reads it). */
export const reliefTiming = signal<{ gpu?: number; cpu?: number } | null>(null);

let gen = 0, t0 = 0, cpu: Promise<void> | null = null, failed: Error | null = null;

/** Forgets the maps (a new photo). */
export function resetRelief(): void {
  gen++; cpu = null; failed = null;
  reliefInput.value = null; reliefShown.value = false; reliefTiming.value = null;
}

/** Starts making the maps for the open photo, once. */
export function startRelief(onError: (e: Error) => void): void {
  if (cpu) return;
  const me = gen;
  t0 = performance.now();
  const alive = () => me === gen;
  cpu = (async () => {
    const { height, inp } = await reliefHeight(alive);
    const tmax = await reliefTmax();
    if (me !== gen) return;
    reliefInput.value = { height, inp, tmax };
    await reliefTable(height.width * height.height, tmax, alive);
    if (me === gen) reliefTiming.value = { ...reliefTiming.value, cpu: performance.now() - t0 };
  })();
  cpu.catch((e: Error) => { if (me === gen) { failed = e; cpu = null; onError(e); } });
}

/** Called by Stage when the GPU's maps are in use. */
export function gpuReady(): void {
  reliefShown.value = true;
  reliefTiming.value = { ...reliefTiming.value, gpu: performance.now() - t0 };
}

/** Resolves when the workers can render with Texture (exports wait for it). */
export async function reliefForExport(onError: (e: Error) => void): Promise<void> {
  if (failed) throw failed;
  startRelief(onError);
  await cpu;
}
