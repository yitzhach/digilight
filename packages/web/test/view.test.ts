import { describe, expect, it } from 'vitest';
import { createScale } from '../src/canvas/scale.ts';
import { fitScale, MARGIN, toPicture, toScreen, zoomAt, type Geometry } from '../src/canvas/view.ts';

const g: Geometry = { w: 1000, h: 800, aspect: 1.25, zoom: 1, pan: [0.5, 0.5] };

describe('view', () => {
  it('fits the picture with a margin of half its width', () => {
    const s = fitScale(g);
    expect(s).toBeCloseTo(Math.min(1000 / (1 + 2 * MARGIN), 800 / (1.25 + 2 * MARGIN)));
    const [x0, y0] = toScreen(g, 0, 0), [x1, y1] = toScreen(g, 1, 1);
    expect(x1 - x0).toBeCloseTo(s);
    expect(y1 - y0).toBeCloseTo(s * 1.25);
    expect(x0).toBeGreaterThanOrEqual(MARGIN * s - 1e-9);
  });
  it('maps screen to picture and back', () => {
    const z = { ...g, zoom: 3, pan: [0.3, 0.7] as [number, number] };
    const [u, v] = toPicture(z, ...toScreen(z, -0.4, 1.6));
    expect(u).toBeCloseTo(-0.4);
    expect(v).toBeCloseTo(1.6);
  });
  it('zooms about the pointer and back to the fit', () => {
    const at = toPicture(g, 700, 300), z = zoomAt(g, 2, 700, 300, 8);
    expect(z.zoom).toBe(2);
    const [u, v] = toPicture(z, 700, 300);
    expect(u).toBeCloseTo(at[0]);
    expect(v).toBeCloseTo(at[1]);
    expect(zoomAt(z, 0.1, 10, 10, 8)).toMatchObject({ zoom: 1, pan: [0.5, 0.5] });
    expect(zoomAt(z, 100, 10, 10, 8).zoom).toBe(8);
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
