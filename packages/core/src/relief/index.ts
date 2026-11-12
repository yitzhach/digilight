// relief: maps made once per photo (BUILD.md §5.2, §5.6). The app builds them across workers
// from these same functions; Node and tests build them here in one go.

import type { Image } from '../resample.ts';
import { estimateHeight } from './estimate.ts';
import { buildHorizon, horizonInput } from './horizon.ts';
import type { ReliefMaps } from './sample.ts';

export { BLURS, channelRows, estimateHeight, normalise, rawRows, reliefPhoto, reliefSize, slopes, RELIEF_SIZE, type Blurred, type Channels, type Height } from './estimate.ts';
export { gauss } from './blur.ts';
export { aoFromTable, buildHorizon, horizonInput, horizonLayer, horizonRise, horizonTmax, K, makeTaps, maxPyramid, type Horizon, type HorizonInput, type Level, type Taps } from './horizon.ts';
export { layerOf, ReliefSampler, type ReliefMaps } from './sample.ts';

const cache = new WeakMap<Uint8ClampedArray, ReliefMaps>();

/** Estimated relief maps for a photo (kept per photo). Approximate: see estimate.ts. */
export function estimatedRelief(photo: Image): ReliefMaps {
  let m = cache.get(photo.data);
  if (!m) {
    const h = estimateHeight(photo);
    m = { ...h, ...buildHorizon(horizonInput(h.h, h.width, h.height, true)) };
    cache.set(photo.data, m);
  }
  return m;
}
