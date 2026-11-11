// schema.ts — the document (BUILD.md §6). Every setting is declared once in the field tables
// below, with its tier, label, range and default; the Zod schema and describe() are built
// from them, so the expert panel and an AI agent's menu can never drift from validation.

import { z } from 'zod';

export type Tier = 'simple' | 'expert';
interface Base { tier: Tier; label: string; help: string }
export interface NumField extends Base { type: 'number'; min: number; max: number; step: number; default: number }
export interface BoolField extends Base { type: 'boolean'; default: boolean }
export interface EnumField extends Base { type: 'enum'; options: readonly string[]; default: string }
export interface CurveField extends Base { type: 'curve'; min: 0; max: 1; default: null }
export type Field = NumField | BoolField | EnumField | CurveField;
interface TupleField { type: 'tuple'; items: NumField[] }
type Spec = Record<string, Field | TupleField>;

const num = (min: number, max: number, step: number, def: number, tier: Tier, label: string, help: string): NumField =>
  ({ type: 'number', min, max, step, default: def, tier, label, help });
const bool = (def: boolean, tier: Tier, label: string, help: string): BoolField => ({ type: 'boolean', default: def, tier, label, help });
const choice = (options: readonly string[], def: string, tier: Tier, label: string, help: string): EnumField =>
  ({ type: 'enum', options, default: def, tier, label, help });

export const AMBIENT = {
  level: num(0, 2, 0.01, 1, 'simple', 'Room light', 'How much of the light in the photo stays'),
  kelvin: num(1500, 12000, 100, 6500, 'expert', 'Room light colour', 'Lower is warmer, higher is cooler; 6500 leaves it as photographed'),
} satisfies Spec;

export const LIGHT = {
  on: bool(true, 'simple', 'On', 'Switch this light on or off'),
  kind: choice(['lamp', 'sun'], 'lamp', 'expert', 'Kind', 'A lamp near the picture, or sunlight from far away'),
  pos: { type: 'tuple', items: [
    num(-2, 3, 0.01, 0.5, 'simple', 'Across', 'Where the lamp is, left to right (0 left edge, 1 right edge)'),
    num(-2, 3, 0.01, -0.2, 'simple', 'Up and down', 'Where the lamp is, top to bottom (0 top edge, 1 bottom edge)'),
    num(0.03, 3, 0.01, 0.8, 'simple', 'Angle', 'How far the lamp stands out from the wall: low rakes, high lights from the front'),
  ] },
  aim: { type: 'tuple', items: [
    num(-2, 3, 0.01, 0.5, 'simple', 'Aim across', 'Where the lamp points, left to right'),
    num(-2, 3, 0.01, 0.5, 'simple', 'Aim up and down', 'Where the lamp points, top to bottom'),
  ] },
  azimuth: num(0, 360, 1, 135, 'expert', 'Sun direction', 'Where sunlight comes from: 0 right, 90 top, 180 left, 270 bottom'),
  elevation: num(1, 90, 1, 30, 'expert', 'Sun height', 'Degrees above the wall: low rakes, 90 is straight on'),
  intensity: num(0, 4, 0.01, 1, 'simple', 'Brightness', 'Light added where the lamp points, as a multiple of the photo\'s own light'),
  kelvin: num(1500, 12000, 100, 4000, 'simple', 'Warmth', 'Lower is warmer (candle, tungsten), higher is cooler (shade)'),
  cone: num(5, 90, 0.5, 90, 'simple', 'Spread', 'Narrow for a spotlight, 90 for a lamp that lights everything'),
  edge: num(0, 1, 0.01, 0.6, 'expert', 'Spot edge', 'How soft the edge of the spot is'),
  falloff: num(0, 1, 0.01, 1, 'expert', 'Falloff', 'How much the light fades with distance (1 is natural)'),
  size: num(0, 1, 0.01, 0.05, 'expert', 'Softness', 'Size of the light: bigger gives softer shadows'),
} satisfies Spec;

export const RELIEF = {
  mode: choice(['off', 'estimated', 'measured'], 'off', 'simple', 'Texture', 'Let the light show the surface\'s relief'),
  depth: num(0, 0.03, 0.0001, 0.004, 'simple', 'Depth', 'How deep the relief is'),
  shadows: num(0, 1, 0.01, 0.6, 'simple', 'Shadows', 'How strong the shadows the relief throws are'),
  ao: num(0, 1, 0.01, 0.3, 'expert', 'Hollows', 'How much less light reaches into hollows'),
  sheen: num(0, 1, 0.01, 0, 'expert', 'Sheen', 'A glossy highlight on raised parts'),
  sheenSharpness: num(2, 8, 0.1, 5, 'expert', 'Sheen sharpness', 'Higher gives a smaller, sharper highlight'),
} satisfies Spec;

export const TONE = {
  protectWhites: bool(true, 'expert', 'Protect whites', 'Dim all the light a little if it would blow out the whites'),
  highlightProtect: num(0, 1, 0.01, 1, 'expert', 'Soft highlights', 'Bright parts approach white without losing detail'),
  whiteAdapt: num(0, 1, 0.01, 0.3, 'expert', 'Camera white balance', 'Like a camera adjusting to the lamps\' colour'),
} satisfies Spec;

export const FINISH = {
  exposure: num(-2, 2, 0.01, 0, 'simple', 'Brightness', 'Brighter or darker overall, in stops'),
  contrast: num(-1, 1, 0.01, 0, 'simple', 'Contrast', 'More or less difference between light and dark'),
  warmth: num(-1, 1, 0.01, 0, 'simple', 'Warmth', 'Warmer or cooler overall'),
  saturation: num(-1, 1, 0.01, 0, 'simple', 'Saturation', 'More or less colour'),
  vignette: num(0, 1, 0.01, 0, 'simple', 'Vignette', 'Darken the corners'),
  grain: num(0, 1, 0.01, 0, 'expert', 'Grain', 'Film grain'),
  curve: { type: 'curve', min: 0, max: 1, default: null, tier: 'expert', label: 'Curve', help: 'A tone curve: 256 output values, 0 to 1' } as CurveField,
} satisfies Spec;

// ---------------------------------------------------------------- Zod, from the tables

function zodOf(f: Field | TupleField): z.ZodType {
  switch (f.type) {
    case 'number': return z.number().min(f.min).max(f.max).default(f.default);
    case 'boolean': return z.boolean().default(f.default);
    case 'enum': return z.enum(f.options as [string, ...string[]]).default(f.default);
    case 'curve': return z.array(z.number().min(0).max(1)).length(256).optional();
    case 'tuple': {
      const items = f.items.map((i) => z.number().min(i.min).max(i.max)) as [z.ZodNumber, ...z.ZodNumber[]];
      return z.tuple(items).default(f.items.map((i) => i.default) as never);
    }
  }
}
function group<S extends Spec>(spec: S) {
  return z.strictObject(Object.fromEntries(Object.entries(spec).map(([k, f]) => [k, zodOf(f)])));
}

const lightSchema = group(LIGHT).extend({ id: z.string().regex(/^[\w-]{1,32}$/, 'a light id is 1 to 32 letters, digits, - or _') });

export const docSchema = z.strictObject({
  version: z.literal(2),
  photo: z.strictObject({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    space: z.enum(['srgb', 'display-p3']),
    sha256: z.string().regex(/^[0-9a-f]{64}$/, 'the SHA-256 of the photo file, 64 hex digits'),
    widthMm: z.number().positive().optional(),
  }),
  ambient: group(AMBIENT).prefault({}),
  lights: z.array(lightSchema).max(8).default([]),
  relief: group(RELIEF).prefault({}),
  tone: group(TONE).prefault({}),
  finish: group(FINISH).prefault({}),
}).superRefine((d, ctx) => {
  const ids = d.lights.map((l) => l.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', path: ['lights'], message: 'light ids must be different' });
});

type Num3 = [number, number, number];
export interface Light {
  id: string; on: boolean; kind: 'lamp' | 'sun'; pos: Num3; aim: [number, number];
  azimuth: number; elevation: number; intensity: number; kelvin: number;
  cone: number; edge: number; falloff: number; size: number;
}
export interface Doc {
  version: 2;
  photo: { width: number; height: number; space: 'srgb' | 'display-p3'; sha256: string; widthMm?: number };
  ambient: { level: number; kelvin: number };
  lights: Light[];
  relief: { mode: 'off' | 'estimated' | 'measured'; depth: number; shadows: number; ao: number; sheen: number; sheenSharpness: number };
  tone: { protectWhites: boolean; highlightProtect: number; whiteAdapt: number };
  finish: { exposure: number; contrast: number; warmth: number; saturation: number; vignette: number; grain: number; curve?: number[] };
}
export type PhotoInfo = Doc['photo'];

/** A valid document (defaults filled in), or an Error that says what is wrong and where. */
export function parseDoc(input: unknown): Doc {
  const r = docSchema.safeParse(input);
  if (r.success) return r.data as unknown as Doc;
  const msg = r.error.issues.map((i) => `${i.path.join('.') || 'document'}: ${i.message}`).join('; ');
  throw new Error(`Invalid document: ${msg}`);
}

/** A neutral document for a photo: room light 1, no lights, texture off, finish neutral. */
export function neutralDoc(photo: PhotoInfo): Doc {
  return parseDoc({ version: 2, photo });
}

// ---------------------------------------------------------------- describe()

export interface Setting {
  path: string; label: string; help: string; tier: Tier; type: Field['type'];
  min?: number; max?: number; step?: number; options?: readonly string[];
  default: number | boolean | string | null; value: unknown;
}

function entries(prefix: string, spec: Spec, value: Record<string, unknown>, out: Setting[]): void {
  for (const [k, f] of Object.entries(spec)) {
    const v = value[k];
    if (f.type === 'tuple') {
      f.items.forEach((item, i) => out.push(setting(`${prefix}${k}.${i}`, item, (v as number[])[i])));
    } else out.push(setting(prefix + k, f, v ?? null));
  }
}
function setting(path: string, f: Field, value: unknown): Setting {
  const s: Setting = { path, label: f.label, help: f.help, tier: f.tier, type: f.type, default: f.default, value };
  if (f.type === 'number' || f.type === 'curve') { s.min = f.min; s.max = f.max; }
  if (f.type === 'number') s.step = f.step;
  if (f.type === 'enum') s.options = f.options;
  return s;
}

/** Every setting of a document: path, label, tier, range, default and current value. */
export function describe(doc: Doc): Setting[] {
  const out: Setting[] = [];
  entries('ambient.', AMBIENT, doc.ambient, out);
  doc.lights.forEach((l, i) => entries(`lights.${i}.`, LIGHT, l as unknown as Record<string, unknown>, out));
  entries('relief.', RELIEF, doc.relief, out);
  entries('tone.', TONE, doc.tone, out);
  entries('finish.', FINISH, doc.finish, out);
  return out;
}
