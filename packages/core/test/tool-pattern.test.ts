import { expect, test } from 'vitest';
import { defaultLight, neutralDoc, parseDoc, render, withLook, type Doc, type Image } from '../src/index.ts';
import { lightingAt, prepareLighting } from '../src/light.ts';
import { dragPattern, lampBasis, patternAt, patternExtent, patternPlane, PATTERN_FLOOR, shapeToPlane, type Pattern, type PatternHandle } from '../src/tools/pattern.ts';
import { expectGolden } from './tool-golden.ts';

// tool:pattern (BUILD.md §5.12.5): the shadow of a window, blinds or leaves in a light.
const W = 200, H = 150, a = H / W;
const grey = (v = 110): Image => {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let p = 0; p < data.length; p += 4) { data[p] = v; data[p + 1] = v; data[p + 2] = v; data[p + 3] = 255; }
  return { data, width: W, height: H };
};
const photo = grey();
const base = neutralDoc({ width: W, height: H, space: 'srgb', sha256: 'b'.repeat(64) });
/** A look with its lamp's pattern settings. */
const lit = (pat: object = {}, look = 'soft-window'): Doc => { const d = withLook(base, look); return parseDoc({ ...d, lights: d.lights.map((l) => ({ ...l, ...pat })) }); };
const draw = (d: Doc) => render(photo, d, { kappa: 1 });
const same = (x: Image, y: Image) => Buffer.compare(Buffer.from(x.data), Buffer.from(y.data)) === 0;
/** E's green over the picture, on a grid. */
function light(d: Doc, n = 60): number[] {
  const L = prepareLighting(d, a, 1), out = new Float64Array(3), E: number[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { lightingAt(L, (i + 0.5) / n, ((j + 0.5) / n) * a, out); E.push(out[1]!); }
  return E;
}
const SHAPES: Pattern[] = ['window', 'blinds', 'leaves'];

test('off: with no pattern its size, softness and turn change nothing', () => {
  expect(same(draw(lit({ patternSize: 1.3, patternSoft: 0.9, patternTurn: 40 })), draw(lit()))).toBe(true);
  const sun = (pat: object) => render(photo, parseDoc({ ...base, lights: [{ id: 's', kind: 'sun', intensity: 0.5, ...pat }] }));
  expect(same(sun({ patternTurn: 70 }), sun({}))).toBe(true);
});

for (const pattern of SHAPES) {
  test(`${pattern}: lowers the mean light; where it lets light through, the lamp is as it was`, () => {
    const plain = light(lit()), with_ = light(lit({ pattern }));
    const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
    expect(mean(with_)).toBeLessThan(mean(plain) * 0.97);
    const ratio = with_.map((v, i) => v / plain[i]!);
    expect(Math.max(...ratio)).toBeGreaterThan(0.99);
    expect(Math.max(...ratio)).toBeLessThanOrEqual(1 + 1e-12);
    expect(Math.min(...ratio)).toBeGreaterThan(PATTERN_FLOOR - 1e-9); // never darker than the shadow's floor
  });

  test(`${pattern}: turning by -180 and by 180 is the same picture; by 90 it is not`, () => {
    expect(same(draw(lit({ pattern, patternTurn: -180 })), draw(lit({ pattern, patternTurn: 180 })))).toBe(true);
    expect(same(draw(lit({ pattern, patternTurn: 90 })), draw(lit({ pattern })))).toBe(false);
  });

  test(`${pattern}: continuous where floor steps (float32 and float64 agree, D-057)`, () => {
    for (const x of [-1, -0.5, 0, 0.25, 0.5, 1, 1 / 3, 2 / 3, 1 / 6.1, 1 / 12.3]) for (const y of [-0.75, 0, 0.5, 0.25, 0.123]) {
      const k = pattern === 'window' ? 1 : pattern === 'blinds' ? 2 : 3, e = 1e-7;
      for (const soft of [0.3, 1]) {
        expect(Math.abs(patternAt(k, x - e, y, soft) - patternAt(k, x + e, y, soft))).toBeLessThan(1e-4);
        expect(Math.abs(patternAt(k, x, y - e, soft) - patternAt(k, x, y + e, soft))).toBeLessThan(1e-4);
      }
    }
  });

  test(`golden: soft window with ${pattern}`, () => {
    expectGolden(`pattern-${pattern}`, render(photo, lit({ pattern, patternSize: 0.4, patternTurn: 10 })));
  });
}

test('up in the pattern is up in the picture, and right is right, for a lamp above and one at the side', () => {
  for (const [L, A] of [[[0.5, -0.35 * a, 0.9], [0.5, 0.45 * a]], [[-0.8, 0.35 * a, 0.8], [0.5, 0.5 * a]]] as const) {
    const ex = A[0] - L[0], ey = A[1] - L[1], r0 = Math.hypot(ex, ey, L[2]), s = [ex / r0, ey / r0, -L[2] / r0] as const;
    const B = lampBasis(defaultLight({ id: 'x', pattern: 'window', patternSize: 1 }), s);
    const pq = (x: number, y: number) => {
      const D = [x - L[0], y - L[1], -L[2]], t = r0 / (D[0]! * s[0] + D[1]! * s[1] + D[2]! * s[2]);
      return [t * (D[0]! * B.U[0] + D[1]! * B.U[1] + D[2]! * B.U[2]), t * (D[0]! * B.V[0] + D[1]! * B.V[1] + D[2]! * B.V[2])];
    };
    const [p0, q0] = pq(A[0], A[1]);
    expect(Math.abs(p0!)).toBeLessThan(1e-12); expect(Math.abs(q0!)).toBeLessThan(1e-12); // the aim point is the centre
    expect(pq(A[0], A[1] - 0.1)[1]).toBeGreaterThan(0.02);  // above the aim point: up
    expect(pq(A[0] + 0.1, A[1])[0]).toBeGreaterThan(0.02);  // to its right: right
    expect(Math.abs(pq(A[0], A[1] - 0.1)[0]!)).toBeLessThan(1e-9); // straight up stays straight up
  }
});

test('size, softness and turn do what their labels say (blinds)', () => {
  const stripes = (d: Doc, along: 'x' | 'y') => { // light and dark changes along a line through the middle
    const L = prepareLighting(d, a, 1), out = new Float64Array(3);
    let n = 0, prev = 0;
    for (let k = 0; k < 400; k++) {
      const t = (k + 0.5) / 400, x = along === 'x' ? t : 0.5, y = (along === 'y' ? t : 0.5) * a;
      lightingAt(L, x, y, out);
      const v = out[1]!;
      if (k && Math.abs(v - prev) > 0.002) n++;
      prev = v;
    }
    return n;
  };
  const blinds = { pattern: 'blinds', patternSoft: 0 };
  expect(stripes(lit({ ...blinds, patternSize: 0.25 }), 'y')).toBeGreaterThan(stripes(lit({ ...blinds, patternSize: 0.5 }), 'y'));
  // under a lamp above the picture (a side lamp's perspective tilts them): slats lie across, turned 90 upright
  const up = lit({ ...blinds, patternTurn: 90 }, 'gallery'), across = lit({ ...blinds }, 'gallery');
  expect(stripes(across, 'y')).toBeGreaterThan(stripes(across, 'x'));
  expect(stripes(up, 'x')).toBeGreaterThan(stripes(across, 'x'));
  expect(stripes(up, 'y')).toBeLessThan(stripes(across, 'y'));
  const range = (d: Doc) => { const v = light(d); return Math.max(...v) - Math.min(...v); };
  const soft = light(lit({ pattern: 'blinds', patternSoft: 1 })), hard = light(lit({ ...blinds }));
  const share = (v: number[], plain: number[]) => v.filter((x, i) => x / plain[i]! > 0.2 && x / plain[i]! < 0.98).length;
  const plain = light(lit());
  expect(share(soft, plain)).toBeGreaterThan(share(hard, plain)); // softer: more of the picture in the edges
  expect(range(lit({ ...blinds }))).toBeGreaterThan(0);
});

test('a sun with a pattern is not folded into the room light: it varies over the picture', () => {
  const sun = (pattern: string) => parseDoc({ ...base, ambient: { level: 0.4 }, lights: [{ id: 's', kind: 'sun', intensity: 0.8, pattern }] });
  const E = light(sun('blinds'));
  expect(Math.max(...E) - Math.min(...E)).toBeGreaterThan(0.3);
  const flat = light(sun('none'));
  expect(Math.max(...flat) - Math.min(...flat)).toBe(0);
  expectGolden('pattern-sun', render(photo, parseDoc({ ...sun('leaves'), lights: [{ ...sun('leaves').lights[0]!, patternTurn: 30, patternSize: 0.8 }] })));
});

// The frame the handles use (D-068): the box drawn on the picture is where the shapes are.
const shaped = defaultLight({ id: 'p', pos: [0.1, -0.2, 0.7], aim: [0.55, 0.45], pattern: 'window', patternSize: 0.4,
  patternTurn: 25, patternStretch: 1.6, patternSkew: 0.3, patternX: 0.1, patternY: -0.05 });

test('the frame: a shape point drawn on the picture is that shape point in the lamp\'s pattern, and back', () => {
  const plane = patternPlane(shaped, a);
  const L = [shaped.pos[0], shaped.pos[1] * a, shaped.pos[2]], A = [shaped.aim[0], shaped.aim[1] * a];
  const r0 = Math.hypot(A[0]! - L[0]!, A[1]! - L[1]!, L[2]!), s = [(A[0]! - L[0]!) / r0, (A[1]! - L[1]!) / r0, -L[2]! / r0] as const;
  const B = lampBasis(shaped, s);
  for (const [sp, sq] of [[0, 0], [0.5, 0.75], [-0.5, 0.75], [0.5, -0.75], [0.3, -0.2]] as const) {
    const [x, y] = plane.toPicture(...shapeToPlane(shaped, sp, sq))!;
    const D = [x - L[0]!, y - L[1]!, -L[2]!], t = r0 / (D[0]! * s[0] + D[1]! * s[1] + D[2]! * s[2]);
    expect(t * (D[0]! * B.U[0] + D[1]! * B.U[1] + D[2]! * B.U[2]) - B.C[0]).toBeCloseTo(sp, 9);
    expect(t * (D[0]! * B.V[0] + D[1]! * B.V[1] + D[2]! * B.V[2]) - B.C[1]).toBeCloseTo(sq, 9);
    const back = plane.toPlane(x, y)!, there = shapeToPlane(shaped, sp, sq);
    expect(back[0]).toBeCloseTo(there[0], 9); expect(back[1]).toBeCloseTo(there[1], 9);
  }
  const sun = patternPlane({ ...shaped, kind: 'sun' }, a);
  expect(sun.toPicture(...sun.toPlane(0.2, 0.6)!)).toEqual([0.2, 0.6]);
});

test('the handles: a drag to where a handle already is changes nothing; move, scale, stretch and slant go their way', () => {
  const [ex, ey] = patternExtent('window');
  const keep = (h: PatternHandle, sp: number, sq: number) => {
    const p = shapeToPlane(shaped, sp, sq), out = dragPattern(shaped, h, p, p);
    for (const [k, v] of Object.entries(out)) expect(v, `${h} ${k}`).toBeCloseTo((shaped as unknown as Record<string, number>)[k]!, 3);
  };
  keep('move', 0, 0); keep('scale', ex, ey); keep('stretch', ex, 0); keep('top', 0, ey);
  expect(dragPattern(shaped, 'move', [0, 0], [0.2, 0.1])).toEqual({ patternX: 0.3, patternY: 0.05 });
  expect(dragPattern(shaped, 'scale', shapeToPlane(shaped, ex, ey), shapeToPlane({ ...shaped, patternSize: 0.8 }, ex, ey)).patternSize).toBeCloseTo(0.8, 3);
  expect(dragPattern(shaped, 'stretch', [0, 0], shapeToPlane({ ...shaped, patternStretch: 2.5 }, ex, 0)).patternStretch).toBeCloseTo(2.5, 3);
  const top = dragPattern(shaped, 'top', [0, 0], shapeToPlane({ ...shaped, patternSkew: -0.4 }, 0, ey));
  expect(top.patternSkew).toBeCloseTo(-0.4, 3); expect(top.patternSize).toBeCloseTo(0.4, 3);
  expect(dragPattern(shaped, 'stretch', [0, 0], [-5, 0]).patternStretch).toBe(0.25); // held to the range
});

test('stretch, slant and shift each move the picture; at their defaults they are the pattern as it was', () => {
  const base = draw(lit({ pattern: 'window' }));
  expect(same(draw(lit({ pattern: 'window', patternStretch: 1, patternSkew: 0, patternX: 0, patternY: 0 })), base)).toBe(true);
  for (const p of [{ patternStretch: 1.5 }, { patternSkew: 0.4 }, { patternX: 0.2 }, { patternY: 0.2 }])
    expect(same(draw(lit({ pattern: 'window', ...p })), base), JSON.stringify(p)).toBe(false);
  expectGolden('pattern-shaped', render(photo, parseDoc({ ...lit(), lights: [{ ...shaped, intensity: 0.8 }] })));
});
