// view.ts — where the picture sits on the canvas. Picture points are (u, v): 0 to 1 across the
// width and down the height (§5.1, §6). At zoom 1 the picture fills the stage with a 5% margin
// (Fit, §8). Zoomed all the way out, half a picture width is free all round, so lamps beyond the
// edge show in place; the view never goes past that (D-055).

export const MARGIN = 0.5;
/** The share of the stage the fitted picture takes: 5% free on each side. */
export const FIT = 0.9;
/** One press of Zoom in or Zoom out. */
export const STEP = 1.5;

export interface Geometry {
  /** Canvas size in CSS pixels. */
  w: number; h: number;
  /** Picture height over width. */
  aspect: number;
  /** User zoom: 1 fits; from `minZoom` (lamps in place) to 8 screen pixels per photo pixel. */
  zoom: number;
  /** The picture point at the canvas centre. */
  pan: [number, number];
}

type Box = Pick<Geometry, 'w' | 'h' | 'aspect'>;

/** CSS pixels per picture width at zoom 1. */
export const fitScale = (g: Box) => FIT * Math.min(g.w, g.h / g.aspect);

/** CSS pixels per picture width zoomed all the way out. */
export const wideScale = (g: Box) => Math.min(g.w / (1 + 2 * MARGIN), g.h / (g.aspect + 2 * MARGIN));

export const scaleOf = (g: Geometry) => fitScale(g) * g.zoom;

/** The least zoom: the picture with half its width free all round. */
export const minZoom = (g: Box) => wideScale(g) / fitScale(g);

/** The most zoom for a photo `photoWidth` pixels wide: 800% (§8), at least the fit. */
export const maxZoom = (g: Box, photoWidth: number, dpr: number) => Math.max(1, (8 * photoWidth) / dpr / fitScale(g));

export function toScreen(g: Geometry, u: number, v: number): [number, number] {
  const s = scaleOf(g);
  return [g.w / 2 + (u - g.pan[0]) * s, g.h / 2 + (v - g.pan[1]) * g.aspect * s];
}

export function toPicture(g: Geometry, x: number, y: number): [number, number] {
  const s = scaleOf(g);
  return [g.pan[0] + (x - g.w / 2) / s, g.pan[1] + (y - g.h / 2) / (g.aspect * s)];
}

/** The preview's zoom (1 fits the bare picture in the canvas) for this geometry. */
export const previewZoom = (g: Geometry) => scaleOf(g) / Math.min(g.w, g.h / g.aspect);

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Keeps the view inside what the widest view shows: centred there, free to pan when closer. */
export function clampPan(g: Geometry): Geometry {
  const k = Math.max(0, 1 / wideScale(g) - 1 / scaleOf(g)) / 2;
  const du = g.w * k, dv = (g.h * k) / g.aspect;
  return { ...g, pan: [clamp(g.pan[0], 0.5 - du, 0.5 + du), clamp(g.pan[1], 0.5 - dv, 0.5 + dv)] };
}

/** Zoom to `to` (kept within the least and `max`) about the screen point (x, y). */
function zoomTo(g: Geometry, to: number, x: number, y: number, max: number): Geometry {
  const zoom = clamp(to, minZoom(g), max);
  const [u, v] = toPicture(g, x, y);
  const next = { ...g, zoom }, s = scaleOf(next);
  return clampPan({ ...next, pan: [u - (x - g.w / 2) / s, v - (y - g.h / 2) / (g.aspect * s)] });
}

/** Zoom by `factor` about the screen point (x, y), keeping it under the pointer where the view allows. */
export const zoomAt = (g: Geometry, factor: number, x: number, y: number, max: number) => zoomTo(g, g.zoom * factor, x, y, max);

/** Fit: the whole picture, centred. */
export const fit = (g: Geometry): Geometry => ({ ...g, zoom: 1, pan: [0.5, 0.5] });
export const isFit = (g: Geometry) => g.zoom === 1 && g.pan[0] === 0.5 && g.pan[1] === 0.5;

/** One press of Zoom in (`dir` 1) or Zoom out (-1), about the canvas centre. Fit is a stop on
 *  the way through; below it there is one more: all the way out. */
export function stepZoom(g: Geometry, dir: 1 | -1, max: number): Geometry {
  const to = dir > 0 ? (g.zoom < 0.99 ? 1 : g.zoom * STEP) : g.zoom > 1.01 ? Math.max(1, g.zoom / STEP) : minZoom(g);
  return to === 1 ? fit(g) : zoomTo(g, to, g.w / 2, g.h / 2, max);
}
