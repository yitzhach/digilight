// Zoom.tsx — Zoom out, Fit and Zoom in on the picture (§8; keys -, 0, =): the same zoom as the
// wheel and the pinch, for a desktop without a wheel to hand and for a phone.

import { photo } from '../state.ts';
import { geo } from './Stage.tsx';
import { fit, fitScale, isFit, maxZoom, minZoom, stepZoom } from './view.ts';

/** The most zoom for the open photo on this screen (800%, §8). */
export const zoomMax = () => maxZoom(geo.value, photo.value?.image.width ?? 1, window.devicePixelRatio || 1);

export function zoomStep(dir: 1 | -1): void { if (photo.value) geo.value = stepZoom(geo.value, dir, zoomMax()); }
export function zoomFit(): void { if (photo.value) geo.value = fit(geo.value); }

export function Zoom() {
  const g = geo.value, near = (a: number, b: number) => Math.abs(a - b) < 1e-9 * b;
  // The buttons stand where the fitted picture leaves more room: down the side, or along the bottom.
  const side = g.w - fitScale(g) > g.h - fitScale(g) * g.aspect;
  return (
    <div class={`zoom${side ? ' side' : ''}`} role="group" aria-label="Zoom">
      <button disabled={near(g.zoom, minZoom(g))} onClick={() => zoomStep(-1)} title="Zoom out: see the lights around the picture (-)" aria-label="Zoom out">−</button>
      <button disabled={isFit(g)} onClick={zoomFit} title="Fit the whole picture in the window (0)">Fit</button>
      <button disabled={near(g.zoom, zoomMax())} onClick={() => zoomStep(1)} title="Zoom in (=)" aria-label="Zoom in">+</button>
    </div>
  );
}
