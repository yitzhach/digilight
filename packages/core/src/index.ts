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
export { DOC_LATEST, migrate } from './migrate.ts';
export { readSettings, settingsOf, SETTINGS_APP, withSettings, type Settings } from './settings.ts';
export { describe, neutralDoc, parseDoc, docSchema, type Setting } from './schema.ts';
export { defaultDoc, defaultLight, type Doc, type Light, type PhotoInfo } from './fields.ts';
// Light tools (§5.12): trials, each removable in one commit.
export { dropRetired, RETIRED, TOOLS, type Tool } from './tools/index.ts';
export { ROOM_ELEVATION, ROOM_WRAP } from './tools/bounce.ts';
export { dragPattern, PATTERN_EDGE, PATTERN_FLOOR, patternExtent, patternPlane, PATTERNS, shapeToPlane, type PatternHandle, type Pt } from './tools/pattern.ts'; // tool:pattern
export { renderWithWall, wallPixels, wallSize } from './tools/wall.ts'; // tool:wall
export { glowKey, glowMaps, glowTint, type GlowMaps } from './tools/glow.ts';

/** Document format version (BUILD.md §6). */
export const DOC_VERSION = 2;
