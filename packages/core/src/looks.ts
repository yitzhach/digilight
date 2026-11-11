// looks.ts — the one-tap starting points (BUILD.md §6, Looks). A look sets `ambient` and
// `lights` only. Strength s mixes toward neutral; flip mirrors every u about 0.5.

import { LIGHT, type Doc, type Light } from './schema.ts';

export interface Look {
  id: string; label: string;
  ambient: { level: number; kelvin: number };
  lights: { pos: [number, number, number]; aim: [number, number]; intensity: number; kelvin: number;
    cone: number; edge: number; falloff: number; size: number }[];
}

const lamp = (pos: [number, number, number], aim: [number, number], intensity: number, kelvin: number,
  cone: number, edge: number, falloff: number, size: number) => ({ pos, aim, intensity, kelvin, cone, edge, falloff, size });

export const LOOKS: readonly Look[] = [
  { id: 'original', label: 'Original', ambient: { level: 1, kelvin: 6500 }, lights: [] },
  { id: 'gallery', label: 'Gallery', ambient: { level: 0.6, kelvin: 5000 }, lights: [lamp([0.5, -0.35, 0.9], [0.5, 0.45], 0.45, 3800, 45, 0.9, 0.5, 0.05)] },
  { id: 'spotlight', label: 'Spotlight', ambient: { level: 0.35, kelvin: 5000 }, lights: [lamp([0.5, -0.25, 1.1], [0.5, 0.5], 0.6, 3600, 32, 1, 0.6, 0.05)] },
  { id: 'soft-window', label: 'Soft window', ambient: { level: 0.35, kelvin: 6500 }, lights: [lamp([-0.8, 0.35, 0.8], [0.5, 0.5], 0.7, 6000, 90, 0.6, 1, 0.4)] },
  { id: 'warm-evening', label: 'Warm evening', ambient: { level: 0.5, kelvin: 5000 }, lights: [lamp([-1.5, 0.2, 0.6], [0.5, 0.5], 0.5, 3300, 90, 0.6, 0.5, 0.15)] },
  { id: 'cool-daylight', label: 'Cool daylight', ambient: { level: 0.5, kelvin: 9000 }, lights: [lamp([0.5, -0.6, 1.2], [0.5, 0.5], 0.5, 8500, 90, 0.6, 0.5, 0.3)] },
  { id: 'raking-left', label: 'Raking from the left', ambient: { level: 0.35, kelvin: 6500 }, lights: [lamp([-2.0, 0.5, 0.35], [0.5, 0.5], 0.8, 4500, 90, 0.6, 0.5, 0.02)] },
  { id: 'raking-top', label: 'Raking from the top', ambient: { level: 0.35, kelvin: 6500 }, lights: [lamp([0.5, -2.0, 0.35], [0.5, 0.5], 0.8, 4500, 90, 0.6, 0.5, 0.02)] },
  { id: 'dramatic', label: 'Dramatic', ambient: { level: 0.2, kelvin: 5000 }, lights: [lamp([-0.3, -0.2, 0.5], [0.45, 0.45], 0.65, 3800, 35, 0.9, 1, 0.05)] },
  { id: 'candlelight', label: 'Candlelight', ambient: { level: 0.3, kelvin: 4500 }, lights: [lamp([0.5, 1.2, 0.5], [0.5, 0.65], 0.65, 2300, 90, 0.6, 0.8, 0.03)] },
];

export interface LookOptions { strength?: number; flip?: boolean }

// a (1 - t) + b t: exactly a at t = 0 and exactly b at t = 1
const mix = (a: number, b: number, t: number) => a * (1 - t) + b * t;
const flipU = (u: number, flip: boolean) => (flip ? 1 - u : u);

/** `doc` with the look's ambient and lights (unvalidated; commands validate). */
export function withLook(doc: Doc, id: string, { strength = 1, flip = false }: LookOptions = {}): Doc {
  const look = LOOKS.find((l) => l.id === id);
  if (!look) throw new Error(`no look "${id}"; the looks are ${LOOKS.map((l) => l.id).join(', ')}`);
  if (!(strength >= 0 && strength <= 1)) throw new Error('strength must be from 0 to 1');
  const s = strength;
  const lights: Light[] = look.lights.map((l, i) => ({
    id: `light-${i + 1}`, on: true, kind: 'lamp',
    pos: [flipU(l.pos[0], flip), l.pos[1], l.pos[2]], aim: [flipU(l.aim[0], flip), l.aim[1]],
    azimuth: LIGHT.azimuth.default, elevation: LIGHT.elevation.default,
    intensity: l.intensity * s, kelvin: l.kelvin, cone: l.cone, edge: l.edge, falloff: l.falloff, size: l.size,
  }));
  return {
    ...doc,
    ambient: { level: mix(1, look.ambient.level, s), kelvin: mix(6500, look.ambient.kelvin, s) },
    lights,
  };
}
