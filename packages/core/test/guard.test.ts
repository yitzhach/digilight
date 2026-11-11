import { expect, test } from 'vitest';
import { LOOKS, guardKappa, neutralDoc, render, withLook } from '../src/index.ts';
import { blownShare, guardThumb } from '../src/guard.ts';
import { loadFixture } from '../scripts/jpeg.ts';

const docFor = (p: { width: number; height: number; sha256: string }) =>
  neutralDoc({ width: p.width, height: p.height, space: 'srgb', sha256: p.sha256 });

test('with the guard on, a four-times-too-bright lamp leaves at most 0.5% new blown pixels (door, 512 px)', () => {
  const photo = loadFixture('door-flat-crop.jpg');
  const d = withLook(docFor(photo), 'gallery');
  d.lights[0]!.intensity *= 4;
  const kappa = guardKappa(photo, d);
  expect(kappa).toBeLessThan(1);
  const { thumb, blown } = guardThumb(photo);
  expect(Math.max(thumb.width, thumb.height)).toBe(512);
  expect(blownShare(render(thumb, { ...d, photo: { ...d.photo, width: thumb.width, height: thumb.height } }, { kappa })) - blown)
    .toBeLessThanOrEqual(0.005);
  // and without the guard the same lamp blows far more
  const off = { ...d, tone: { ...d.tone, protectWhites: false } };
  expect(blownShare(render(thumb, { ...off, photo: { ...d.photo, width: thumb.width, height: thumb.height } })) - blown)
    .toBeGreaterThan(0.02);
});

test('every look gives kappa >= 0.7 on the door and the lintel', () => {
  for (const name of ['door-flat-crop.jpg', 'lintel-flat-crop.jpg']) {
    const photo = loadFixture(name);
    for (const look of LOOKS) {
      const k = guardKappa(photo, withLook(docFor(photo), look.id));
      expect(k, `${look.id} on ${name}`).toBeGreaterThanOrEqual(0.7);
    }
  }
});

test('protect whites off means kappa 1', () => {
  const photo = loadFixture('door-flat-crop.jpg');
  const d = withLook(docFor(photo), 'gallery');
  d.lights[0]!.intensity = 4;
  d.tone.protectWhites = false;
  expect(guardKappa(photo, d)).toBe(1);
});
