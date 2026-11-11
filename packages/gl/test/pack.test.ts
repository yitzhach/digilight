import { expect, test } from 'vitest';
import { neutralDoc, prepareLighting, withLook } from 'core';
import { packLamps } from '../src/preview.ts';
import { LAMP_VEC4S, MAX_LAMPS } from '../src/shaders/light.glsl.ts';

test('packLamps lays each lamp out as the shader reads it', () => {
  const doc = withLook(neutralDoc({ width: 400, height: 300, space: 'srgb', sha256: 'a'.repeat(64) }), 'spotlight');
  const L = prepareLighting(doc, 0.75, 1), p = L.lamps[0]!;
  const u = packLamps(L.lamps);
  expect(u.length).toBe(MAX_LAMPS * LAMP_VEC4S * 4);
  expect([...u.subarray(0, 20)]).toEqual([p.Lx, p.Ly, p.Lz, p.r0, p.l0z, p.falloff, p.intensity, 1,
    p.sx, p.sy, p.sz, 0, p.cosOuter, p.cosInner, 0, 0, p.r, p.g, p.b, 0].map(Math.fround));
  expect(u.subarray(20).every((v) => v === 0)).toBe(true);
});
