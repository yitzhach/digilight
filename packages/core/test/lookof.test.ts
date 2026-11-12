import { expect, test } from 'vitest';
import { createCommands, LOOKS, lookOf } from '../src/index.ts';

const photo = () => ({ data: new Uint8ClampedArray(40 * 30 * 4).fill(140), width: 40, height: 30, sha256: 'd'.repeat(64) });

test('lookOf reads the look, strength and flip back from the document', () => {
  const c = createCommands();
  c.open(photo());
  expect(lookOf(c.getDoc())).toEqual({ id: 'original', strength: 1, flip: false });
  for (const l of LOOKS.filter((k) => k.lights.length)) {
    for (const strength of [1, 0.37, 0.05]) {
      const m = lookOf(c.applyLook(l.id, { strength, flip: true }), { flip: true });
      expect(m).toEqual({ id: l.id, strength, flip: true });
    }
  }
  // Raking from the left is not symmetric: flipped is found without a hint.
  expect(lookOf(c.applyLook('raking-left', { flip: true }))).toEqual({ id: 'raking-left', strength: 1, flip: true });
  // Gallery is symmetric: flip off unless the last tap said otherwise.
  expect(lookOf(c.applyLook('gallery', { flip: true }))?.flip).toBe(false);
});

test('a lamp moved by hand, a light switched off or room light changed: no look', () => {
  const c = createCommands();
  c.open(photo());
  c.applyLook('gallery', { strength: 0.6 });
  c.updateLight('light-1', { pos: [0.3, -0.35, 0.9] });
  expect(lookOf(c.getDoc())).toBeNull();
  c.undo();
  expect(lookOf(c.getDoc())).toEqual({ id: 'gallery', strength: 0.6, flip: false }); // after Undo, the right look
  c.updateLight('light-1', { on: false });
  expect(lookOf(c.getDoc())).toBeNull();
  c.undo();
  c.set('ambient.level', 0.9);
  expect(lookOf(c.getDoc())).toBeNull();
  c.reset();
  c.addLight();
  expect(lookOf(c.getDoc())).toBeNull();
});
