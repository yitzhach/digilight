import { describe, expect, it } from 'vitest';
import { createScale } from '../src/canvas/scale.ts';
import { clampPan, fit, fitScale, FIT, isFit, MARGIN, minZoom, stepZoom, toPicture, toScreen, wideScale, zoomAt, type Geometry } from '../src/canvas/view.ts';

const g: Geometry = { w: 1000, h: 800, aspect: 1.25, zoom: 1, pan: [0.5, 0.5] };
const wide: Geometry = { ...g, zoom: minZoom(g) };

describe('view', () => {
  it('fits the picture in the stage with a 5% margin', () => {
    const s = fitScale(g);
    expect(s).toBeCloseTo(FIT * Math.min(1000, 800 / 1.25));
    const [x0, y0] = toScreen(g, 0, 0), [x1, y1] = toScreen(g, 1, 1);
    expect(x1 - x0).toBeCloseTo(s);
    expect(y1 - y0).toBeCloseTo(s * 1.25);
    expect(y0).toBeCloseTo(0.05 * 800);
    expect(y1).toBeCloseTo(0.95 * 800);
  });
  it('zoomed all the way out keeps half a picture width free all round', () => {
    const s = wideScale(g);
    expect(s).toBeCloseTo(Math.min(1000 / (1 + 2 * MARGIN), 800 / (1.25 + 2 * MARGIN)));
    expect(minZoom(g)).toBeLessThan(1);
    const [x0, y0] = toScreen(wide, 0, 0), [x1] = toScreen(wide, 1, 1);
    expect(x1 - x0).toBeCloseTo(s);
    expect(x0).toBeGreaterThanOrEqual(MARGIN * s - 1e-9);
    expect(y0).toBeGreaterThanOrEqual(MARGIN * s - 1e-9);
  });
  it('maps screen to picture and back', () => {
    const z = { ...g, zoom: 3, pan: [0.3, 0.7] as [number, number] };
    const [u, v] = toPicture(z, ...toScreen(z, -0.4, 1.6));
    expect(u).toBeCloseTo(-0.4);
    expect(v).toBeCloseTo(1.6);
  });
  it('zooms about the pointer, out to the widest view and in to the most', () => {
    const at = toPicture(g, 700, 300), z = zoomAt(g, 2, 700, 300, 8);
    expect(z.zoom).toBe(2);
    const [u, v] = toPicture(z, 700, 300);
    expect(u).toBeCloseTo(at[0]);
    expect(v).toBeCloseTo(at[1]);
    const out = zoomAt(z, 0.01, 10, 10, 8);
    expect(out.zoom).toBe(minZoom(g));
    expect(out.pan[0]).toBeCloseTo(0.5);
    expect(out.pan[1]).toBeCloseTo(0.5);
    expect(zoomAt(z, 100, 10, 10, 8).zoom).toBe(8);
  });
  it('never shows more than the widest view does', () => {
    const [u0, v0] = toPicture(wide, 0, 0), [u1, v1] = toPicture(wide, 1000, 800);
    for (const zoom of [minZoom(g), 0.8, 1, 3]) {
      const far = clampPan({ ...g, zoom, pan: [-9, 9] });
      expect(toPicture(far, 0, 0)[0]).toBeCloseTo(u0);
      expect(toPicture(far, 1000, 800)[1]).toBeCloseTo(v1);
      const other = clampPan({ ...g, zoom, pan: [9, -9] });
      expect(toPicture(other, 1000, 800)[0]).toBeCloseTo(u1);
      expect(toPicture(other, 0, 0)[1]).toBeCloseTo(v0);
    }
    const near = { ...g, zoom: 3, pan: [0.4, 0.6] as [number, number] };
    expect(clampPan(near).pan).toEqual([0.4, 0.6]);
  });
  it('the buttons step in and out, stopping at Fit', () => {
    const a = stepZoom(g, 1, 8), b = stepZoom(a, 1, 8);
    expect(a.zoom).toBeCloseTo(1.5);
    expect(b.zoom).toBeCloseTo(2.25);
    expect(a.pan).toEqual([0.5, 0.5]);
    const panned = { ...b, pan: [0.3, 0.6] as [number, number] };
    expect(stepZoom(panned, -1, 8).pan).toEqual([0.3, 0.6]);
    expect(isFit(stepZoom(stepZoom(panned, -1, 8), -1, 8))).toBe(true);
    expect(stepZoom(g, -1, 8).zoom).toBe(minZoom(g));
    expect(stepZoom(wide, -1, 8)).toEqual(wide);
    expect(isFit(stepZoom(wide, 1, 8))).toBe(true);
    expect(stepZoom({ ...g, zoom: 7 }, 1, 8).zoom).toBe(8);
    expect(stepZoom({ ...g, zoom: 8 }, 1, 8).zoom).toBe(8);
    expect(isFit(fit(panned))).toBe(true);
  });
});

describe('adaptive scale (§9)', () => {
  it('lowers over 24 ms, holds at the display rate, raises after a smooth run', () => {
    const s = createScale();
    for (let i = 0; i < 3; i++) s.record(40);
    expect(s.q).toBe(0.75);
    for (let i = 0; i < 3; i++) s.record(30);
    expect(s.q).toBe(0.5);
    for (let i = 0; i < 29; i++) s.record(16.7);
    expect(s.q).toBe(0.5);
    s.record(16.7);
    expect(s.q).toBe(0.75);
    for (let i = 0; i < 3; i++) s.record(8);
    expect(s.q).toBe(1);
  });
});
