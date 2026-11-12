// fields.ts — the document's settings (BUILD.md §6): each declared once, with its tier, label,
// range and default, and the document's types. No validation library here, so the workers, which
// only read documents, stay small (D-052); schema.ts builds the Zod schema and describe() from these.

export type Tier = 'simple' | 'expert';
interface Base { tier: Tier; label: string; help: string }
export interface NumField extends Base { type: 'number'; min: number; max: number; step: number; default: number }
export interface BoolField extends Base { type: 'boolean'; default: boolean }
export interface EnumField extends Base { type: 'enum'; options: readonly string[]; default: string }
export interface CurveField extends Base { type: 'curve'; min: 0; max: 1; default: null }
export type Field = NumField | BoolField | EnumField | CurveField;
export interface TupleField { type: 'tuple'; items: NumField[] }
export type Spec = Record<string, Field | TupleField>;

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

function defaultsOf<T>(spec: Spec): T {
  return Object.fromEntries(Object.entries(spec).filter(([, f]) => f.type !== 'curve')
    .map(([k, f]) => [k, f.type === 'tuple' ? f.items.map((i) => i.default) : f.default])) as T;
}

/** A light with every setting not given at its default (as the schema fills it in). */
export function defaultLight(part: Partial<Light> & { id: string }): Light {
  return { ...defaultsOf<Omit<Light, 'id'>>(LIGHT), ...part, id: part.id };
}

/** The neutral document for a photo, unvalidated (schema.ts `neutralDoc` validates; equal to it). */
export function defaultDoc(photo: PhotoInfo): Doc {
  return {
    version: 2, photo: { ...photo },
    ambient: defaultsOf(AMBIENT), lights: [], relief: defaultsOf(RELIEF), tone: defaultsOf(TONE), finish: defaultsOf(FINISH),
  };
}
