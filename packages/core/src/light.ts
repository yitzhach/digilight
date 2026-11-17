// light.ts — the light at a point (BUILD.md §5.3, §5.4). prepareLighting() does the
// per-document work once; lightingAt() is the per-pixel part. With relief maps the surface's
// normal, shadows (horizon table), hollows and sheen come in; without, rel = sh = 1.

import { DEG, dcos, dexp2, dpow, dsin } from './dmath.ts';
import { colour, type RGB } from './kelvin.ts';
import { K } from './relief/horizon.ts';
import { layerOf, ReliefSampler, type ReliefMaps } from './relief/sample.ts';
import type { Doc, Light } from './schema.ts';
import { openness, ROOM_ELEVATION, roomLight, wallLight, wallShare } from './tools/bounce.ts';
import { filtered } from './tools/gel.ts'; // tool:gel
import { lampBasis, patternFactor, sunBasis, type PatternBasis } from './tools/pattern.ts'; // tool:pattern

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
  pat: PatternBasis | null; // tool:pattern (§5.12.5): null for none
}
interface Relief {
  s: ReliefSampler | null; depth: number; shadows: number; ao: number; sheen: number; sharp: number;
  bounce: number;                         // tool:bounce (§5.12.1)
  roomSide: number; room: RGB | null;     // tool:roomside (§5.12.2): the side's direction, null when 0
}

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
 * Per channel factor f = kappa * 2^exposure / mix(1, Wc / luma(Wc), whiteAdapt) (§5.4, §5.9), folded into every
 * colour so the per-pixel sum is already E. `maps`: relief maps, used when relief is on (`true`:
 * relief on, its maps sampled elsewhere, as by the GPU preview; lightingAt then cannot run).
 */
export function prepareLighting(doc: Doc, a: number, kappa: number, maps?: ReliefMaps | true | null): Lighting {
  const space = doc.photo.space, R = doc.relief;
  const on = doc.lights.filter((l) => l.on);
  const amb = colour(doc.ambient.kelvin, space).map((c) => c * doc.ambient.level) as RGB;
  const Wc: RGB = [amb[0], amb[1], amb[2]];
  const cols = on.map((l) => filtered(colour(l.kelvin, space), l.gel, l.gelHue)); // tool:gel (§5.12.4)
  on.forEach((l, i) => { for (let c = 0; c < 3; c++) Wc[c]! += l.intensity * cols[i]![c]!; });
  const wl = luma(Wc[0], Wc[1], Wc[2]), wa = doc.tone.whiteAdapt;
  // Finish's Brightness is light (§5.9): it scales E, and sheen with it, as kappa does.
  const k = doc.finish.exposure === 0 ? kappa : kappa * dexp2(doc.finish.exposure);
  const f = [0, 1, 2].map((c) => k / (wl > 0 ? 1 + (Wc[c]! / wl - 1) * wa : 1)) as RGB;

  const relief = R.mode !== 'off' && maps
    ? {
      s: maps === true ? null : new ReliefSampler(maps), depth: R.depth, shadows: R.shadows, ao: R.ao, sheen: R.sheen, sharp: dexp2(R.sheenSharpness),
      bounce: R.bounce, roomSide: R.roomSide, room: R.roomSide > 0 ? direction(R.roomFrom, ROOM_ELEVATION) : null, // tool:bounce, tool:roomside
    }
    : null;
  const base: RGB = [amb[0] * f[0], amb[1] * f[1], amb[2] * f[2]];
  const lamps: Lamp[] = [];
  on.forEach((l, i) => {
    const col = cols[i]!, fc: RGB = [col[0] * f[0], col[1] * f[1], col[2] * f[2]];
    if (l.kind === 'sun' && !relief && l.pattern === 'none') { // fall = lam = spot = rel = sh = 1: constant (tool:pattern: a pattern is not)
      for (let c = 0; c < 3; c++) base[c]! += l.intensity * fc[c]!;
    } else if (l.intensity > 0) lamps.push(l.kind === 'sun' ? prepareSun(l, a, fc) : prepareLamp(l, a, fc));
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
  const sx = (Ax - Lx) / r0, sy = (Ay - Ly) / r0, sz = -Lz / r0;
  return {
    sun: false, size: l.size, Lx, Ly, Lz, r0, l0z: Lz / r0, falloff: l.falloff,
    sx, sy, sz,
    spot, cosOuter: spot ? dcos(l.cone * DEG) : 0, cosInner: spot ? dcos(l.cone * (1 - l.edge) * DEG) : 0,
    intensity: l.intensity, r: col[0], g: col[1], b: col[2], k0: 0, kt: 0,
    pat: l.pattern === 'none' ? null : lampBasis(l.pattern, l.patternSize, l.patternSoft, l.patternTurn, [sx, sy, sz]), // tool:pattern
  };
}

function prepareSun(l: Light, a: number, col: RGB): Lamp {
  const [x, y, z] = direction(l.azimuth, l.elevation), [k0, kt] = layerOf(x, y);
  return {
    sun: true, size: l.size, Lx: x, Ly: y, Lz: z, r0: 1, l0z: 1, falloff: 0, sx: 0, sy: 0, sz: 0,
    spot: false, cosOuter: 0, cosInner: 0, intensity: l.intensity, r: col[0], g: col[1], b: col[2], k0, kt,
    pat: l.pattern === 'none' ? null : sunBasis(l.pattern, l.patternSize, l.patternSoft, l.patternTurn, a), // tool:pattern
  };
}

/** E at picture point (x, y) into out[0..2]; with relief, sheen (added light) into spec[0..2].
 *  `c`: the photo's linear colour there, which Bounce light needs (tool:bounce). */
export function lightingAt(L: Lighting, x: number, y: number, out: Float64Array, spec?: Float64Array, c?: ArrayLike<number>): void {
  let r = L.base[0], g = L.base[1], b = L.base[2];
  const R = L.relief as (Relief & { s: ReliefSampler }) | null;
  let nx = 0, ny = 0, nz = 1, sr = 0, sg = 0, sb = 0;
  const bounce = R && c && R.bounce > 0 ? R.bounce : 0; // tool:bounce
  if (R) {
    R.s.set(x, y);
    const a = 1 - R.ao * R.s.occl(R.depth);
    const px = -R.depth * R.s.p, py = -R.depth * R.s.q, inv = 1 / Math.sqrt(px * px + py * py + 1);
    nx = px * inv; ny = py * inv; nz = inv;
    let ar = a, ag = a, ab = a;
    if (bounce > 0) { ar = openness(a, c![0]!, bounce); ag = openness(a, c![1]!, bounce); ab = openness(a, c![2]!, bounce); } // tool:bounce
    if (R.room) { const k = 1 + (roomLight(nx, ny, nz, R.room) - 1) * R.roomSide; ar *= k; ag *= k; ab *= k; } // tool:roomside
    r *= ar; g *= ag; b *= ab;
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
    if (p.pat) e *= patternFactor(p.pat, p.sun, x, y, p.Lx, p.Ly, p.Lz, p.r0, p.sx, p.sy, p.sz); // tool:pattern
    if (R) {
      const w = Math.min(omega, 0.5);
      const rel = Math.min(4, Math.max(0, nx * lx + ny * ly + nz * lz + w) / (lz + w));
      const tanE = lz / Math.max(Math.sqrt(lx * lx + ly * ly), 1e-6);
      let k0 = p.k0, kt = p.kt; // the light's layer in the horizon table (a sun's is worked out once)
      if (!p.sun) { const lay = layerOf(lx, ly); k0 = lay[0]; kt = lay[1]; }
      const T = R.depth * R.s.horizonAt(k0, kt);
      const pw = Math.max(omega, 0.004) * (1 + tanE * tanE);
      const sh = 1 - R.shadows * (1 - smoothstep(-pw, pw, tanE - T));
      if (bounce > 0) { // tool:bounce: the far side's wall, lit, throws light back (e is still the flat ground's)
        const Topp = R.depth * R.s.horizonAt((k0 + K / 2) % K, kt);
        const eb = bounce * wallShare(Topp) * wallLight(Math.sqrt(lx * lx + ly * ly), lz, w) * e;
        r += eb * p.r * c![0]!; g += eb * p.g * c![1]!; b += eb * p.b * c![2]!;
      }
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
