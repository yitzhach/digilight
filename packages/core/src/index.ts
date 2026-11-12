// core: the document, the maths and the reference renderer (BUILD.md §4).
export * from './commands.ts';
export { colour, type RGB, type Space } from './kelvin.ts';
export { guardKappa } from './guard.ts';
export { direction, prepareLighting, type Lighting } from './light.ts';
export { resampleRegion, thumbnail } from './resample.ts';
export { LOOKS, withLook, type Look, type LookOptions } from './looks.ts';
export { metrics, pictureStats, type Metrics, type PictureStats } from './metrics.ts';
export * from './relief/index.ts';
export { isNeutral, outputSize, reliefFor, render, type Image, type Region, type RenderOptions } from './render.ts';
export { describe, neutralDoc, parseDoc, docSchema, type Doc, type Light, type PhotoInfo, type Setting } from './schema.ts';

/** Document format version (BUILD.md §6). */
export const DOC_VERSION = 2;
