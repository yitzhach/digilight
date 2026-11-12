import { expect, test } from 'vitest';
import {
  buildHorizon, estimateHeight, horizonInput, neutralDoc, parseDoc, render, ReliefSampler, slopes, withLook,
  type Doc, type Image, type ReliefMaps,
} from '../src/index.ts';
import { smoothstep } from '../src/light.ts';
import { DEG, dcos, dsin } from '../src/dmath.ts';

const W = 256, Hh = 192;
/** Ridge, pit and ramp, in picture widths (x, y in widths); smooth, as plaster is. */
const ss = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
function H(x: number, y: number): number {
  const ridge = 0.012 * Math.exp(-((x - 0.25) ** 2) / (2 * 0.02 ** 2)) * (1 - ss(0.35, 0.45, y));
  const pit = -0.015 * Math.exp(-((x - 0.7) ** 2 + (y - 0.25) ** 2) / (2 * 0.04 ** 2));
  const ramp = 0.032 * ss(0.3, 0.7, x) * ss(0.5, 0.6, y);
  return ridge + pit + ramp;
}
function synthetic(): ReliefMaps {
  const h = new Float32Array(W * Hh);
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) h[j * W + i] = H((i + 0.5) / W, (j + 0.5) / W);
  return { width: W, height: Hh, h, ...slopes(h, W, Hh), ...buildHorizon(horizonInput(h, W, Hh, false)) };
}
/** Exact: the steepest rise toward (dx, dy), marched every quarter pixel up to 0.2 widths. */
function exactT(x: number, y: number, dx: number, dy: number): number {
  const h0 = H(x, y);
  let m = 0;
  for (let t = 0.25 / W; t <= 0.2; t += 0.25 / W) {
    const px = x + t * dx, py = y + t * dy;
    if (px < 0 || py < 0 || px > 1 || py > Hh / W) break;
    m = Math.max(m, (H(px, py) - h0) / t);
  }
  return m;
}

test('horizon table against an exact ray march: mean vis within 0.03 from 10 degrees, 0.08 at 3 and 5 (ridge, pit, ramp)', () => {
  const m = synthetic(), s = new ReliefSampler(m), omega = 0.05; // the default Softness
  for (const el of [3, 5, 10, 20, 30, 45, 60]) for (const az of [0, 45, 100, 180, 225, 300]) {
    const lx = dcos(az * DEG) * dcos(el * DEG), ly = -dsin(az * DEG) * dcos(el * DEG), lz = dsin(el * DEG), hl = Math.hypot(lx, ly);
    const tanE = lz / hl, pw = omega * (1 + tanE * tanE), diffs: number[] = [];
    for (let j = 2; j < Hh - 2; j += 3) for (let i = 2; i < W - 2; i += 3) {
      const x = (i + 0.5) / W, y = (j + 0.5) / W;
      s.set(x, y);
      const vis = smoothstep(-pw, pw, tanE - s.horizon(lx, ly));
      const ref = smoothstep(-pw, pw, tanE - exactT(x, y, lx / hl, ly / hl));
      diffs.push(Math.abs(vis - ref));
    }
    const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    // D-036: the max pyramid (§5.6) reads up to 35% high on even slopes; at 3 and 5 degrees
    // that shows (0.02 to 0.08; 0.008 to 0.028 with plain taps). From 10 degrees: under 0.03.
    expect(mean, `elevation ${el}, azimuth ${az}`).toBeLessThan(el < 10 ? 0.08 : 0.03);
  }
});

const flat = (rgb: [number, number, number]): Image => {
  const data = new Uint8ClampedArray(200 * 150 * 4);
  for (let p = 0; p < data.length; p += 4) { data[p] = rgb[0]; data[p + 1] = rgb[1]; data[p + 2] = rgb[2]; data[p + 3] = 255; }
  return { data, width: 200, height: 150 };
};
const docFor = (img: Image): Doc => neutralDoc({ width: img.width, height: img.height, space: 'srgb', sha256: 'c'.repeat(64) });
const withRelief = (d: Doc, r: Partial<Doc['relief']>): Doc => parseDoc({ ...d, relief: { ...d.relief, mode: 'estimated', ...r } });
const same = (a: Image, b: Image) => Buffer.compare(Buffer.from(a.data), Buffer.from(b.data)) === 0;

test('a flat photo (one colour) gives hHat = 0 and texture changes nothing', () => {
  const photo = flat([180, 140, 90]), h = estimateHeight(photo);
  expect(h.h.every((v) => v === 0)).toBe(true);
  for (const look of ['gallery', 'raking-left', 'candlelight']) {
    const d = withLook(docFor(photo), look);
    expect(same(render(photo, withRelief(d, { depth: 0.02, shadows: 1, ao: 1, sheen: 0 })), render(photo, d)), look).toBe(true);
  }
  expect(same(render(photo, withRelief(docFor(photo), {})), photo)).toBe(true);
});

/** A photo with grain: a checker of small dabs on a mid grey. */
function grainy(): Image {
  const w = 240, h = 180, data = new Uint8ClampedArray(w * h * 4);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const p = (j * w + i) * 4, v = 120 + 40 * Math.sin(i * 0.9) * Math.sin(j * 0.7) + (((i * 7 + j * 13) % 11) - 5) * 3;
    data[p] = v; data[p + 1] = v * 0.95; data[p + 2] = v * 0.85; data[p + 3] = 255;
  }
  return { data, width: w, height: h };
}

test('texture on: raking light varies across the grain, a region equals the whole render, sheen adds light', () => {
  const photo = grainy(), d = withRelief(withLook(docFor(photo), 'raking-left'), { depth: 0.006, shadows: 0.6 });
  const off = render(photo, withLook(docFor(photo), 'raking-left')), on = render(photo, d);
  let diff = 0;
  for (let p = 0; p < on.data.length; p += 4) diff += Math.abs(on.data[p + 1]! - off.data[p + 1]!);
  expect(diff / (on.data.length / 4)).toBeGreaterThan(1);
  const region = { x: 31, y: 17, width: 50, height: 41 }, part = render(photo, d, { region });
  for (let j = 0; j < region.height; j++) {
    const a = ((region.y + j) * on.width + region.x) * 4;
    expect(Array.from(part.data.subarray(j * region.width * 4, (j + 1) * region.width * 4))).toEqual(Array.from(on.data.subarray(a, a + region.width * 4)));
  }
  const shiny = render(photo, parseDoc({ ...d, relief: { ...d.relief, sheen: 0.5 } }));
  let up = 0;
  for (let p = 0; p < on.data.length; p += 4) up += shiny.data[p + 1]! - on.data[p + 1]!;
  expect(up).toBeGreaterThan(0);
});
