// light.ts — the light at a point (BUILD.md §5.3, §5.4), Light layer: rel = sh = 1, no relief.
// prepareLighting() does the per-document work once; lightingAt() is the per-pixel part.

import { DEG, dcos, dsin } from './dmath.ts';
import { colour, type RGB } from './kelvin.ts';
import type { Doc, Light } from './schema.ts';

export const luma = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

export function smoothstep(a: number, b: number, x: number): number {
  if (!(b > a)) return x < a ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Toward the light from an azimuth and elevation in degrees (§5.1; y is down). */
export function direction(azimuth: number, elevation: number): RGB {
  const az = azimuth * DEG, el = elevation * DEG, ce = dcos(el);
  return [dcos(az) * ce, -dsin(az) * ce, dsin(el)];
}

/** A lamp, ready for lightingAt (all in picture widths; y down). */
interface Lamp {
  Lx: number; Ly: number; Lz: number; r0: number; l0z: number; falloff: number;
  sx: number; sy: number; sz: number; spot: boolean; cosOuter: number; cosInner: number;
  intensity: number; r: number; g: number; b: number; // colour times the document's factor
}

export interface Lighting {
  /** Ambient plus every sun (constant over the picture), times the factor. */
  base: RGB;
  lamps: Lamp[];
  /** True when E is exactly (1, 1, 1) everywhere (§5.5 identity). */
  unit: boolean;
}

/**
 * The document's light for a picture `a = H / W` high, `kappa` the guard's factor (§5.7).
 * Per channel factor f = kappa / mix(1, Wc / luma(Wc), whiteAdapt) (§5.4), folded into every
 * colour so the per-pixel sum is already E.
 */
export function prepareLighting(doc: Doc, a: number, kappa: number): Lighting {
  const space = doc.photo.space;
  const on = doc.lights.filter((l) => l.on);
  const amb = colour(doc.ambient.kelvin, space).map((c) => c * doc.ambient.level) as RGB;
  const Wc: RGB = [amb[0], amb[1], amb[2]];
  const cols = on.map((l) => colour(l.kelvin, space));
  on.forEach((l, i) => { for (let c = 0; c < 3; c++) Wc[c]! += l.intensity * cols[i]![c]!; });
  const wl = luma(Wc[0], Wc[1], Wc[2]), wa = doc.tone.whiteAdapt;
  const f = [0, 1, 2].map((c) => kappa / (wl > 0 ? 1 + (Wc[c]! / wl - 1) * wa : 1)) as RGB;

  const base: RGB = [amb[0] * f[0], amb[1] * f[1], amb[2] * f[2]];
  const lamps: Lamp[] = [];
  on.forEach((l, i) => {
    const col = cols[i]!;
    if (l.kind === 'sun') { // fall = lam = spot = 1
      for (let c = 0; c < 3; c++) base[c]! += l.intensity * col[c]! * f[c]!;
    } else if (l.intensity > 0) lamps.push(prepareLamp(l, a, [col[0] * f[0], col[1] * f[1], col[2] * f[2]]));
  });
  const unit = lamps.length === 0 && base[0] === 1 && base[1] === 1 && base[2] === 1;
  return { base, lamps, unit };
}

function prepareLamp(l: Light, a: number, col: RGB): Lamp {
  const Lx = l.pos[0], Ly = l.pos[1] * a, Lz = l.pos[2];
  const Ax = l.aim[0], Ay = l.aim[1] * a;
  const ex = Lx - Ax, ey = Ly - Ay;
  const r0 = Math.sqrt(ex * ex + ey * ey + Lz * Lz);
  const spot = l.cone < 89.5;
  return {
    Lx, Ly, Lz, r0, l0z: Lz / r0, falloff: l.falloff,
    sx: (Ax - Lx) / r0, sy: (Ay - Ly) / r0, sz: -Lz / r0,
    spot, cosOuter: spot ? dcos(l.cone * DEG) : 0, cosInner: spot ? dcos(l.cone * (1 - l.edge) * DEG) : 0,
    intensity: l.intensity, r: col[0], g: col[1], b: col[2],
  };
}

/** E at picture point (x, y) into out[0..2]. */
export function lightingAt(L: Lighting, x: number, y: number, out: Float64Array): void {
  let r = L.base[0], g = L.base[1], b = L.base[2];
  for (const p of L.lamps) {
    const dx = p.Lx - x, dy = p.Ly - y, dz = p.Lz;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const q = p.r0 / d;
    const fall = 1 + (q * q - 1) * p.falloff;
    const lam = Math.min(dz / d / p.l0z, 8);
    let e = p.intensity * fall * lam;
    if (p.spot) e *= smoothstep(p.cosOuter, p.cosInner, -(dx * p.sx + dy * p.sy + dz * p.sz) / d);
    r += e * p.r; g += e * p.g; b += e * p.b;
  }
  out[0] = r; out[1] = g; out[2] = b;
}
