// view.ts — where the picture sits on the canvas. Picture points are (u, v): 0 to 1 across the
// width and down the height (§5.1, §6). At zoom 1 the picture fits with a margin of half its
// width around it (§8), so lamps beyond the edge stay in reach.

export const MARGIN = 0.5;

export interface Geometry {
  /** Canvas size in CSS pixels. */
  w: number; h: number;
  /** Picture height over width. */
  aspect: number;
  /** User zoom: 1 fits; the most is 8 screen pixels per photo pixel. */
  zoom: number;
  /** The picture point at the canvas centre. */
  pan: [number, number];
}

/** CSS pixels per picture width at zoom 1. */
export const fitScale = (g: Pick<Geometry, 'w' | 'h' | 'aspect'>) =>
  Math.min(g.w / (1 + 2 * MARGIN), g.h / (g.aspect + 2 * MARGIN));

export const scaleOf = (g: Geometry) => fitScale(g) * g.zoom;

/** The most zoom for a photo `photoWidth` pixels wide: 800% (§8), at least the fit. */
export const maxZoom = (g: Geometry, photoWidth: number, dpr: number) => Math.max(1, (8 * photoWidth) / dpr / fitScale(g));

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

/** Zoom by `factor` about the screen point (x, y), keeping it under the pointer. */
export function zoomAt(g: Geometry, factor: number, x: number, y: number, max: number): Geometry {
  const zoom = Math.min(max, Math.max(1, g.zoom * factor));
  const [u, v] = toPicture(g, x, y);
  const next = { ...g, zoom }, s = scaleOf(next);
  const pan: [number, number] = zoom === 1 ? [0.5, 0.5] : [u - (x - g.w / 2) / s, v - (y - g.h / 2) / (g.aspect * s)];
  return { ...next, pan };
}
