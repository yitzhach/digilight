// light.ts — the light at a point (BUILD.md §5.3, §5.4). prepareLighting() does the
// per-document work once; lightingAt() is the per-pixel part. With relief maps the surface's
// normal, shadows (horizon table), hollows and sheen come in; without, rel = sh = 1.

import { DEG, dcos, dexp2, dpow, dsin } from './dmath.ts';
import { colour, type RGB } from './kelvin.ts';
import { layerOf, ReliefSampler, type ReliefMaps } from './relief/sample.ts';
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

/** A lamp or (with relief only) a sun, ready for lightingAt (picture widths; y down). */
interface Lamp {
  sun: boolean; size: number;
  Lx: number; Ly: number; Lz: number; r0: number; l0z: number; falloff: number;
  sx: number; sy: number; sz: number; spot: boolean; cosOuter: number; cosInner: number;
  intensity: number; r: number; g: number; b: number; // colour times the document's factor
  k0: number; kt: number; // a sun's horizon layer
}
interface Relief { s: ReliefSampler | null; depth: number; shadows: number; ao: number; sheen: number; sharp: number }

export interface Lighting {
  /** Ambient (and, without relief, every sun: constant over the picture), times the factor. */
  base: RGB;
  lamps: Lamp[];
  /** True when E is exactly (1, 1, 1) everywhere (§5.5 identity). */
  unit: boolean;
  relief: Relief | null;
}

/**
 * The document's light for a picture `a = H / W` high, `kappa` the guard's factor (§5.7).
 * Per channel factor f = kappa / mix(1, Wc / luma(Wc), whiteAdapt) (§5.4), folded into every
 * colour so the per-pixel sum is already E. `maps`: relief maps, used when relief is on (`true`:
 * relief on, its maps sampled elsewhere, as by the GPU preview; lightingAt then cannot run).
 */
export function prepareLighting(doc: Doc, a: number, kappa: number, maps?: ReliefMaps | true | null): Lighting {
  const space = doc.photo.space, R = doc.relief;
  const on = doc.lights.filter((l) => l.on);
  const amb = colour(doc.ambient.kelvin, space).map((c) => c * doc.ambient.level) as RGB;
  const Wc: RGB = [amb[0], amb[1], amb[2]];
  const cols = on.map((l) => colour(l.kelvin, space));
  on.forEach((l, i) => { for (let c = 0; c < 3; c++) Wc[c]! += l.intensity * cols[i]![c]!; });
  const wl = luma(Wc[0], Wc[1], Wc[2]), wa = doc.tone.whiteAdapt;
  const f = [0, 1, 2].map((c) => kappa / (wl > 0 ? 1 + (Wc[c]! / wl - 1) * wa : 1)) as RGB;

  const relief = R.mode !== 'off' && maps
    ? { s: maps === true ? null : new ReliefSampler(maps), depth: R.depth, shadows: R.shadows, ao: R.ao, sheen: R.sheen, sharp: dexp2(R.sheenSharpness) }
    : null;
  const base: RGB = [amb[0] * f[0], amb[1] * f[1], amb[2] * f[2]];
  const lamps: Lamp[] = [];
  on.forEach((l, i) => {
    const col = cols[i]!, fc: RGB = [col[0] * f[0], col[1] * f[1], col[2] * f[2]];
    if (l.kind === 'sun' && !relief) { // fall = lam = spot = rel = sh = 1: constant
      for (let c = 0; c < 3; c++) base[c]! += l.intensity * fc[c]!;
    } else if (l.intensity > 0) lamps.push(l.kind === 'sun' ? prepareSun(l, fc) : prepareLamp(l, a, fc));
  });
  const unit = !relief && lamps.length === 0 && base[0] === 1 && base[1] === 1 && base[2] === 1;
  return { base, lamps, unit, relief };
}

function prepareLamp(l: Light, a: number, col: RGB): Lamp {
  const Lx = l.pos[0], Ly = l.pos[1] * a, Lz = l.pos[2];
  const Ax = l.aim[0], Ay = l.aim[1] * a;
  const ex = Lx - Ax, ey = Ly - Ay;
  const r0 = Math.sqrt(ex * ex + ey * ey + Lz * Lz);
  const spot = l.cone < 89.5;
  return {
    sun: false, size: l.size, Lx, Ly, Lz, r0, l0z: Lz / r0, falloff: l.falloff,
    sx: (Ax - Lx) / r0, sy: (Ay - Ly) / r0, sz: -Lz / r0,
    spot, cosOuter: spot ? dcos(l.cone * DEG) : 0, cosInner: spot ? dcos(l.cone * (1 - l.edge) * DEG) : 0,
    intensity: l.intensity, r: col[0], g: col[1], b: col[2], k0: 0, kt: 0,
  };
}

function prepareSun(l: Light, col: RGB): Lamp {
  const [x, y, z] = direction(l.azimuth, l.elevation), [k0, kt] = layerOf(x, y);
  return {
    sun: true, size: l.size, Lx: x, Ly: y, Lz: z, r0: 1, l0z: 1, falloff: 0, sx: 0, sy: 0, sz: 0,
    spot: false, cosOuter: 0, cosInner: 0, intensity: l.intensity, r: col[0], g: col[1], b: col[2], k0, kt,
  };
}

/** E at picture point (x, y) into out[0..2]; with relief, sheen (added light) into spec[0..2]. */
export function lightingAt(L: Lighting, x: number, y: number, out: Float64Array, spec?: Float64Array): void {
  let r = L.base[0], g = L.base[1], b = L.base[2];
  const R = L.relief as (Relief & { s: ReliefSampler }) | null;
  let nx = 0, ny = 0, nz = 1, sr = 0, sg = 0, sb = 0;
  if (R) {
    R.s.set(x, y);
    const a = 1 - R.ao * R.s.occl(R.depth);
    r *= a; g *= a; b *= a;
    const px = -R.depth * R.s.p, py = -R.depth * R.s.q, inv = 1 / Math.sqrt(px * px + py * py + 1);
    nx = px * inv; ny = py * inv; nz = inv;
  }
  for (const p of L.lamps) {
    let lx: number, ly: number, lz: number, e: number, omega: number, lam = 1;
    if (p.sun) {
      lx = p.Lx; ly = p.Ly; lz = p.Lz; e = p.intensity; omega = p.size;
    } else { // the Light layer's arithmetic, in its order (goldens)
      const dx = p.Lx - x, dy = p.Ly - y, dz = p.Lz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const q = p.r0 / d;
      const fall = 1 + (q * q - 1) * p.falloff;
      lam = Math.min(dz / d / p.l0z, 8);
      e = p.intensity * fall * lam;
      if (p.spot) e *= smoothstep(p.cosOuter, p.cosInner, -(dx * p.sx + dy * p.sy + dz * p.sz) / d);
      lx = dx / d; ly = dy / d; lz = dz / d; omega = p.size / d;
    }
    if (R) {
      const w = Math.min(omega, 0.5);
      const rel = Math.min(4, Math.max(0, nx * lx + ny * ly + nz * lz + w) / (lz + w));
      const tanE = lz / Math.max(Math.sqrt(lx * lx + ly * ly), 1e-6);
      const T = R.depth * (p.sun ? R.s.horizonAt(p.k0, p.kt) : R.s.horizon(lx, ly));
      const pw = Math.max(omega, 0.004) * (1 + tanE * tanE);
      const sh = 1 - R.shadows * (1 - smoothstep(-pw, pw, tanE - T));
      if (R.sheen > 0) { // intensity * fall * spot is e / lam
        const hx = lx, hy = ly, hz = lz + 1, hl = Math.sqrt(hx * hx + hy * hy + hz * hz);
        const c = Math.max((nx * hx + ny * hy + nz * hz) / hl, 0);
        const s = c > 0 && lam > 0 ? R.sheen * (e / lam) * sh * dpow(c, R.sharp) : 0;
        sr += s * p.r; sg += s * p.g; sb += s * p.b;
      }
      e *= rel * sh;
    }
    r += e * p.r; g += e * p.g; b += e * p.b;
  }
  out[0] = r; out[1] = g; out[2] = b;
  if (spec) { spec[0] = sr; spec[1] = sg; spec[2] = sb; }
}
