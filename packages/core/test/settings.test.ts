import { expect, test } from 'vitest';
import { createCommands, defaultDoc, settingsOf, withSettings } from '../src/index.ts';

const photo = (sha: string, w = 40, h = 30) => ({ data: new Uint8ClampedArray(w * h * 4).fill(128), width: w, height: h, sha256: sha.repeat(64) });

test('copy and paste: one photo\'s settings onto another, in one undo step', () => {
  const c = createCommands();
  c.open(photo('a'));
  c.applyLook('dramatic');
  c.set({ 'finish.contrast': 0.3, 'finish.vignette': 0.4, 'tone.whiteAdapt': 0.5 });
  c.setRelief({ mode: 'estimated' });
  const copied = JSON.stringify(c.getSettings());
  const from = c.getDoc();

  c.open(photo('b', 50, 20));
  const before = c.getDoc();
  const after = c.applySettings(copied);
  expect(after.photo).toEqual(before.photo);
  for (const k of ['ambient', 'lights', 'tone', 'finish'] as const) expect(after[k]).toEqual(from[k]);
  // Texture's settings come along, but it stays off: this photo has no measured height.
  expect(after.relief).toEqual({ ...from.relief, mode: 'off' });
  expect(c.undo()).toEqual(before);
});

test('pasted Texture comes on only as this photo\'s own measured height', () => {
  const base = defaultDoc({ width: 40, height: 30, space: 'srgb', sha256: 'c'.repeat(64) });
  const s = settingsOf({ ...base, relief: { ...base.relief, mode: 'estimated', depth: 0.005 } });
  expect(withSettings(base, s, true).relief).toMatchObject({ mode: 'measured', depth: 0.005 });
  expect(withSettings(base, s, false).relief).toMatchObject({ mode: 'off', depth: 0.005 });
});

test('a preset leaves Texture out, so applying one keeps the photo\'s own', () => {
  const base = defaultDoc({ width: 40, height: 30, space: 'srgb', sha256: 'c'.repeat(64) });
  const preset = settingsOf({ ...base, ambient: { level: 0.5, kelvin: 5000 } }, { relief: false });
  expect('relief' in preset).toBe(false);
  const mine = { ...base, relief: { ...base.relief, depth: 0.007 } };
  const d = withSettings(mine, preset, false);
  expect(d.ambient).toEqual({ level: 0.5, kelvin: 5000 });
  expect(d.relief.depth).toBe(0.007);
});

test('anything else is refused with a plain message, and nothing changes', () => {
  const c = createCommands();
  c.open(photo('a'));
  const d = c.getDoc();
  expect(() => c.applySettings('hello')).toThrow(/not DigiLight settings/);
  expect(() => c.applySettings({ name: 'x' })).toThrow(/not DigiLight settings/);
  expect(() => c.applySettings({ ambient: { level: 9 } })).toThrow(/ambient.level/);
  expect(c.getDoc()).toEqual(d);
});
