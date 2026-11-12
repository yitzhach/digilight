import { expect, test } from 'vitest';
import { createCommands } from '../src/index.ts';

const photo = () => ({ data: new Uint8ClampedArray(80 * 60 * 4).fill(140), width: 80, height: 60, sha256: 'c'.repeat(64) });

test('open gives a neutral document; render of it is the photo', () => {
  const c = createCommands(), p = photo();
  expect(() => c.getDoc()).toThrow(/open a photo/);
  const info = c.open(p);
  expect(info).toMatchObject({ width: 80, height: 60, space: 'srgb' });
  expect(info.looks).toContain('gallery');
  const { image, metrics } = c.render();
  expect(Array.from(image.data)).toEqual(Array.from(p.data));
  expect(metrics.kappa).toBe(1);
  expect(metrics.warnings).toEqual([]);
});

test('set by path, several at once, get, and validation', () => {
  const c = createCommands();
  c.open(photo());
  c.set('ambient.level', 0.5);
  expect(c.get('ambient.level')).toBe(0.5);
  c.set({ 'ambient.level': 0.7, 'ambient.kelvin': 5000 });
  expect(c.getDoc().ambient).toEqual({ level: 0.7, kelvin: 5000 });
  expect(() => c.set('ambient.level', 9)).toThrow(/ambient\.level/);
  expect(() => c.set('ambient.nothing', 1)).toThrow();
  expect(() => c.set('photo.width', 1)).toThrow(/photo/);
  expect(() => c.get('lights.3.kelvin')).toThrow(/no setting/);
  expect(c.get('ambient.level')).toBe(0.7); // a failed command changes nothing
});

test('lights: add, update, remove; ids stay unique', () => {
  const c = createCommands();
  c.open(photo());
  c.addLight();
  c.addLight({ kelvin: 3000 });
  let d = c.getDoc();
  expect(d.lights.map((l) => l.id)).toEqual(['light-1', 'light-2']);
  expect(d.lights[0]).toMatchObject({ pos: [0.5, -0.2, 0.8], aim: [0.5, 0.5], intensity: 0.8, kelvin: 4000, cone: 90, on: true });
  c.updateLight('light-2', { intensity: 2 });
  c.set('lights.0.kelvin', 2500);
  c.removeLight('light-1');
  d = c.getDoc();
  expect(d.lights).toHaveLength(1);
  expect(d.lights[0]).toMatchObject({ id: 'light-2', intensity: 2, kelvin: 3000 });
  c.addLight();
  expect(c.getDoc().lights.map((l) => l.id)).toEqual(['light-2', 'light-1']);
  expect(() => c.updateLight('nope', {})).toThrow(/no light/);
});

test('undo, redo, reset; each command is one step', () => {
  const c = createCommands();
  c.open(photo());
  c.applyLook('gallery');
  c.set({ 'ambient.level': 0.3, 'lights.0.intensity': 1.5 });
  c.undo();
  expect(c.getDoc().ambient.level).toBe(0.6);
  c.undo();
  expect(c.getDoc().lights).toEqual([]);
  c.redo();
  expect(c.getDoc().lights).toHaveLength(1);
  c.reset();
  expect(c.getDoc().lights).toEqual([]);
  c.undo();
  expect(c.getDoc().lights).toHaveLength(1);
  c.set('ambient.level', 0.6); // no change: not a step
  c.undo();
  expect(c.getDoc().lights).toEqual([]);
});

test('describe and looks are the menu', () => {
  const c = createCommands();
  c.open(photo());
  expect(c.looks()).toHaveLength(10);
  expect(c.describe().find((s) => s.path === 'ambient.level')?.value).toBe(1);
  expect(() => c.applyLook('disco')).toThrow(/no look/);
});

test('render metrics flag a too-bright lamp', () => {
  const c = createCommands();
  c.open({ ...photo(), data: new Uint8ClampedArray(80 * 60 * 4).fill(220) });
  c.addLight({ intensity: 4 });
  const { metrics } = c.render({ width: 40 });
  expect(metrics.kappa).toBeLessThan(1);
  expect(metrics.warnings.join(' ')).toMatch(/protect whites/);
  expect(metrics.render.p50).toBeGreaterThan(metrics.photo.p50);
});

test('setRelief: first switched on, Texture starts at depth 0.003 and shadows 0.4; later values are kept', () => {
  const c = createCommands();
  c.open({ data: new Uint8ClampedArray(8 * 6 * 4).fill(128), width: 8, height: 6, sha256: 'd'.repeat(64) });
  let d = c.setRelief({ mode: 'estimated' });
  expect([d.relief.mode, d.relief.depth, d.relief.shadows]).toEqual(['estimated', 0.003, 0.4]);
  d = c.setRelief({ depth: 0.006 });
  d = c.setRelief({ mode: 'off' });
  d = c.setRelief({ mode: 'estimated' });
  expect([d.relief.depth, d.relief.shadows]).toEqual([0.006, 0.4]);
  expect(() => c.setRelief({ mode: 'measured' })).toThrow(/side-lit/);
});

test('measured texture needs a height in every command, not only setRelief', () => {
  const c = createCommands();
  c.open(photo());
  const d = c.getDoc();
  expect(() => c.set('relief.mode', 'measured')).toThrow(/side-lit photo/);
  expect(() => c.setDoc({ ...d, relief: { ...d.relief, mode: 'measured' } })).toThrow(/side-lit photo/);
  expect(() => c.setRelief({ mode: 'measured' })).toThrow(/side-lit photo/);
  expect(() => c.load({ ...d, relief: { ...d.relief, mode: 'measured' } })).toThrow(/side-lit photo/);
  expect(c.getDoc()).toEqual(d);
  expect(() => c.render({ width: 81 })).toThrow(/photo's 80/);
});

test('load puts back a saved document with no undo step, or refuses it and changes nothing', () => {
  const c = createCommands();
  c.open(photo());
  const saved = c.applyLook('gallery');
  c.open(photo());
  c.load(saved);
  expect(c.getDoc()).toEqual(saved);
  expect(c.undo()).toEqual(saved); // nothing to undo
  expect(() => c.load({ ...saved, ambient: { level: 7, kelvin: 6500 } })).toThrow(/ambient\.level/);
  expect(() => c.load({ ...saved, photo: { ...saved.photo, sha256: 'e'.repeat(64) } })).toThrow(/different photo/);
  expect(c.getDoc()).toEqual(saved);
});
