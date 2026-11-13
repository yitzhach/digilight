// core: the document, the maths and the reference renderer (BUILD.md §4).
export * from './commands.ts';
export { colour, type RGB, type Space } from './kelvin.ts';
export { GRAIN_CELLS, GRAIN_SHIFT, grainAt, pcg, prepareFinish, toDisplay, type Finish } from './finish.ts';
export { guardKappa } from './guard.ts';
export { direction, prepareLighting, type Lighting } from './light.ts';
export { resampleRegion, thumbnail } from './resample.ts';
export { LOOKS, lookOf, withLook, type Look, type LookMatch, type LookOptions } from './looks.ts';
export { metrics, pictureStats, type Metrics, type PictureStats } from './metrics.ts';
export * from './relief/index.ts';
export { isNeutral, outputSize, reliefFor, render, type Image, type Region, type RenderOptions } from './render.ts';
export { describe, neutralDoc, parseDoc, docSchema, type Setting } from './schema.ts';
export { defaultDoc, defaultLight, type Doc, type Light, type PhotoInfo } from './fields.ts';

/** Document format version (BUILD.md §6). */
export const DOC_VERSION = 2;
