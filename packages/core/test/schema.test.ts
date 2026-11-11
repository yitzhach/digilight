import { expect, test } from 'vitest';
import { describe, neutralDoc, parseDoc } from '../src/schema.ts';

const photo = { width: 400, height: 300, space: 'srgb' as const, sha256: 'a'.repeat(64) };

test('a new document is neutral and complete', () => {
  const d = neutralDoc(photo);
  expect(d.ambient).toEqual({ level: 1, kelvin: 6500 });
  expect(d.lights).toEqual([]);
  expect(d.relief.mode).toBe('off');
  expect(d.finish).toEqual({ exposure: 0, contrast: 0, warmth: 0, saturation: 0, vignette: 0, grain: 0 });
  expect(d.tone).toEqual({ protectWhites: true, highlightProtect: 1, whiteAdapt: 0.3 });
});

test('the schema rejects out-of-range values, unknown keys and bad types', () => {
  const d = neutralDoc(photo);
  const bad: unknown[] = [
    { ...d, ambient: { level: 2.5, kelvin: 6500 } },
    { ...d, ambient: { level: 1, kelvin: 1000 } },
    { ...d, lights: [{ id: 'a', intensity: 5 }] },
    { ...d, lights: [{ id: 'a', pos: [0.5, 0.5, 0.01] }] },
    { ...d, lights: [{ id: 'a', cone: 120 }] },
    { ...d, lights: [{ id: 'a' }, { id: 'a' }] },
    { ...d, lights: Array.from({ length: 9 }, (_, i) => ({ id: `l${i}` })) },
    { ...d, relief: { ...d.relief, depth: 0.05 } },
    { ...d, relief: { ...d.relief, mode: 'magic' } },
    { ...d, finish: { ...d.finish, curve: [0, 1] } },
    { ...d, tone: { ...d.tone, protectWhites: 'yes' } },
    { ...d, ambient: { level: 1, kelvin: 6500, colour: 'red' } },
    { ...d, version: 1 },
    { ...d, photo: { ...photo, sha256: 'nope' } },
  ];
  for (const b of bad) expect(() => parseDoc(b)).toThrow(/Invalid document/);
  expect(() => parseDoc({ ...d, lights: [{ id: 'a', intensity: 4 }] })).not.toThrow();
});

test('the error names the setting', () => {
  expect(() => parseDoc({ ...neutralDoc(photo), lights: [{ id: 'a', kelvin: 99 }] })).toThrow(/lights\.0\.kelvin/);
});

test('describe lists every setting with tier, label, range and default', () => {
  const d = parseDoc({ ...neutralDoc(photo), lights: [{ id: 'a' }] });
  const s = describe(d);
  const paths = s.map((x) => x.path);
  expect(paths).toContain('ambient.level');
  expect(paths).toContain('lights.0.pos.2');
  expect(paths).toContain('lights.0.kelvin');
  expect(paths).toContain('finish.curve');
  expect(new Set(paths).size).toBe(paths.length);
  for (const x of s) {
    expect(['simple', 'expert']).toContain(x.tier);
    expect(x.label.length).toBeGreaterThan(0);
    expect(x.help.length).toBeGreaterThan(0);
    if (x.type === 'number') {
      expect(x.min).toBeLessThan(x.max!);
      expect(x.default as number).toBeGreaterThanOrEqual(x.min!);
      expect(x.default as number).toBeLessThanOrEqual(x.max!);
    }
  }
  expect(s.find((x) => x.path === 'ambient.level')).toMatchObject({ label: 'Room light', tier: 'simple', min: 0, max: 2, default: 1, value: 1 });
  // about 40 settings without lights (§2), and no expert word on a simple control (§8)
  expect(describe(neutralDoc(photo)).length).toBeLessThanOrEqual(40);
  for (const x of s.filter((x) => x.tier === 'simple')) expect(x.label).not.toMatch(/azimuth|kelvin|specular/i);
});
