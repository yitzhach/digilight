// commands.ts — the only way the document changes (BUILD.md §7). Each command validates with
// the schema, returns the new document and is one undo step. The app (window.digilight), the
// command line and the MCP server map to these one to one.
// export lives in the app (D-026).

import { guardKappa } from './guard.ts';
import type { Space } from './kelvin.ts';
import { LOOKS, withLook, type LookOptions } from './looks.ts';
import { metrics, type Metrics } from './metrics.ts';
import { measuredRelief, measureFromPhotos, reliefSize, type MeasuredHeight, type SidePhoto, type TrueRelief } from './relief/index.ts';
import { render as renderImage, type Image, type Region } from './render.ts';
import { settingsOf, withSettings, type Settings } from './settings.ts';
import { describe as describeDoc, neutralDoc, parseDoc, RELIEF, type Doc, type Light, type Setting } from './schema.ts';

export interface PhotoInput extends Image { space?: Space; sha256: string; widthMm?: number }
export interface Info { width: number; height: number; space: Space; sha256: string; looks: string[] }

/** Texture's settings when first switched on (§10 Phase 4, step 5). */
export const RELIEF_START = { depth: 0.003, shadows: 0.4 } as const;

/** "+ Add light" (§6): a lamp above centre, aimed at the centre. */
export const NEW_LIGHT = { pos: [0.5, -0.2, 0.8], aim: [0.5, 0.5], intensity: 0.8, kelvin: 4000, cone: 90 } as const;
const HISTORY = 200;
const MEASURED_FIRST = 'measured texture needs a side-lit photo first (measureRelief)';

type Json = unknown;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const same = (a: Json, b: Json) => JSON.stringify(a) === JSON.stringify(b);

function keysOf(path: string): string[] {
  if (typeof path !== 'string' || !/^[\w-]+(\.[\w-]+)*$/.test(path)) throw new Error(`"${path}" is not a setting path (e.g. lights.0.kelvin)`);
  const keys = path.split('.');
  if (keys[0] === 'version' || (keys[0] === 'photo' && path !== 'photo.widthMm')) throw new Error(`${path} belongs to the photo and cannot be set`);
  return keys;
}
function getIn(doc: Json, path: string): Json {
  let v: Json = doc;
  for (const k of keysOf(path)) {
    if (v === null || typeof v !== 'object' || !(k in v)) throw new Error(`no setting ${path}`);
    v = (v as Record<string, Json>)[k];
  }
  return v;
}
function setIn(doc: Json, keys: string[], value: Json, path: string): Json {
  if (keys.length === 0) return clone(value);
  if (doc === null || typeof doc !== 'object') throw new Error(`no setting ${path}`);
  const [k, ...rest] = keys as [string, ...string[]];
  const obj = doc as Record<string, Json>;
  if (!(k in obj) && rest.length > 0) throw new Error(`no setting ${path}`);
  if (Array.isArray(obj) && !(Number(k) < obj.length)) throw new Error(`no setting ${path}`);
  const out = (Array.isArray(obj) ? [...obj] : { ...obj }) as Record<string, Json>;
  out[k] = setIn(obj[k], rest, value, path);
  return out;
}

export function createCommands() {
  let photo: Image | null = null;
  let doc: Doc | null = null;
  let past: Doc[] = [], future: Doc[] = [];
  /** True Relief's height for this photo, once measured (beside the document, §6). */
  let measured: MeasuredHeight | null = null;

  const current = (): Doc => {
    if (!doc) throw new Error('open a photo first');
    return doc;
  };
  const check = (next: Json, against: Doc['photo'], height: MeasuredHeight | null): Doc => {
    const d = parseDoc(next);
    if (d.photo.width !== against.width || d.photo.height !== against.height || d.photo.sha256 !== against.sha256 || d.photo.space !== against.space)
      throw new Error('the document is for a different photo');
    if (d.relief.mode === 'measured' && !height) throw new Error(MEASURED_FIRST);
    return d;
  };
  const commit = (next: Json): Doc => {
    const cur = current(), d = check(next, cur.photo, measured);
    if (same(d, cur)) return cur;
    past.push(cur);
    if (past.length > HISTORY) past.shift();
    future = [];
    doc = d;
    return d;
  };
  const lightIndex = (id: string): number => {
    const i = current().lights.findIndex((l) => l.id === id);
    if (i < 0) throw new Error(`no light "${id}"; the lights are ${current().lights.map((l) => l.id).join(', ') || 'none'}`);
    return i;
  };

  /** Takes a measured height (from measureRelief elsewhere, or a project file) and switches
   *  Texture to it; `depth` (picture widths) sets Depth. */
  const setMeasured = (height: MeasuredHeight, depth?: number): Doc => {
    const d = current(), size = reliefSize(d.photo);
    if (height.width !== size.width || height.height !== size.height || height.data.length !== size.width * size.height)
      throw new Error(`the measured height must be ${size.width} x ${size.height} for this photo`);
    measured = height;
    const dep = depth === undefined ? d.relief.depth : Math.min(RELIEF.depth.max, Math.max(0, Math.round(depth * 1e5) / 1e5));
    return clone(commit({ ...d, relief: { ...d.relief, mode: 'measured', depth: dep } }));
  };

  return {
    /** Starts a neutral document for a photo. */
    open(p: PhotoInput): Info {
      if (!(p.data instanceof Uint8ClampedArray) || p.data.length !== p.width * p.height * 4) throw new Error('photo must be RGBA8: width * height * 4 bytes');
      const d = neutralDoc({ width: p.width, height: p.height, space: p.space ?? 'srgb', sha256: p.sha256, ...(p.widthMm ? { widthMm: p.widthMm } : {}) });
      photo = { data: p.data, width: p.width, height: p.height };
      doc = d; past = []; future = []; measured = null;
      return { width: d.photo.width, height: d.photo.height, space: d.photo.space, sha256: d.photo.sha256, looks: LOOKS.map((l) => l.id) };
    },
    getDoc: (): Doc => clone(current()),
    /** Puts back a saved document (autosave, a project) and its measured height, with no undo
     *  step and a fresh history. Throws, changing nothing, if the schema refuses it, it is for
     *  another photo, or it says measured with no height. */
    load(d: Doc, height: MeasuredHeight | null = null): Doc {
      const cur = current(), size = reliefSize(cur.photo);
      if (height && (height.width !== size.width || height.height !== size.height || height.data.length !== size.width * size.height))
        throw new Error(`the measured height must be ${size.width} x ${size.height} for this photo`);
      const next = check(d, cur.photo, height);
      doc = next; measured = height; past = []; future = [];
      return clone(next);
    },
    setDoc: (d: Doc): Doc => clone(commit(d)),
    get: (path: string): Json => clone(getIn(current(), path)),
    /** set('lights.0.kelvin', 3000) or set({ 'lights.0.kelvin': 3000, 'ambient.level': 0.5 }): one step. */
    set(pathOrMany: string | Record<string, Json>, value?: Json): Doc {
      const many = typeof pathOrMany === 'string' ? { [pathOrMany]: value } : pathOrMany;
      let next: Json = current();
      for (const [path, v] of Object.entries(many)) next = setIn(next, keysOf(path), v, path);
      return clone(commit(next));
    },
    describe: (): Setting[] => describeDoc(current()),
    /** Everything but the photo (Copy settings; `relief: false` for a preset). */
    getSettings: (opts?: { relief?: boolean }): Settings => settingsOf(current(), opts),
    /** Settings (or a document, or their JSON) onto this photo, one step; Texture comes on only
     *  where this photo has its own measured height (Paste settings, a preset). */
    applySettings: (input: unknown): Doc => clone(commit(withSettings(current(), input, measured !== null))),
    looks: () => LOOKS.map((l) => ({ id: l.id, label: l.label })),
    applyLook: (id: string, opts?: LookOptions): Doc => clone(commit(withLook(current(), id, opts))),
    addLight(partial: Partial<Omit<Light, 'id'>> = {}): Doc {
      const d = current(), ids = new Set(d.lights.map((l) => l.id));
      let n = 1;
      while (ids.has(`light-${n}`)) n++;
      return clone(commit({ ...d, lights: [...d.lights, { ...clone(NEW_LIGHT), ...partial, id: `light-${n}` }] }));
    },
    updateLight(id: string, partial: Partial<Omit<Light, 'id'>>): Doc {
      const i = lightIndex(id), d = current();
      const lights = d.lights.map((l, j) => (j === i ? { ...l, ...partial, id } : l));
      return clone(commit({ ...d, lights }));
    },
    /** Texture: setRelief({ mode: 'estimated' }), setRelief({ depth: 0.005 }). Switched on with
     *  Depth and Shadows never set, they start at RELIEF_START. */
    setRelief(partial: Partial<Doc['relief']>): Doc {
      const d = current(), r = { ...d.relief, ...partial };
      if (d.relief.mode === 'off' && r.mode !== 'off' && d.relief.depth === RELIEF.depth.default && d.relief.shadows === RELIEF.shadows.default) {
        if (partial.depth === undefined) r.depth = RELIEF_START.depth;
        if (partial.shadows === undefined) r.shadows = RELIEF_START.shadows;
      }
      return clone(commit({ ...d, relief: r }));
    },
    /** True Relief (Phase 5): measures the surface from one to three side-lit photos and
     *  switches Texture to it; Depth starts from the measurement. `from`: where a photo's light
     *  came from (0 right, 90 top); left out, the axis read from the pair, upper end. */
    measureRelief(opts: { photos: SidePhoto[]; widthCm?: number; onProgress?: (text: string) => void }): TrueRelief & { doc: Doc } {
      const mm = current().photo.widthMm, widthCm = opts.widthCm ?? (mm ? mm / 10 : undefined);
      const t = measureFromPhotos(photo!, opts.photos, { ...(widthCm ? { widthCm } : {}), ...(opts.onProgress ? { onProgress: opts.onProgress } : {}) });
      return { ...t, doc: setMeasured(t.height, t.depth) };
    },
    setMeasured,
    getMeasured: (): MeasuredHeight | null => measured,
    removeLight(id: string): Doc {
      const i = lightIndex(id), d = current();
      return clone(commit({ ...d, lights: d.lights.filter((_, j) => j !== i) }));
    },
    /** A picture from the reference renderer, with its metrics against the photo. */
    render(opts: { width?: number; region?: Region } = {}): { image: Image; metrics: Metrics } {
      const d = current();
      const kappa = guardKappa(photo!, d);
      const image = renderImage(photo!, d, { ...opts, kappa, ...(d.relief.mode === 'measured' && measured ? { relief: measuredRelief(measured) } : {}) });
      const base = renderImage(photo!, neutralDoc(d.photo), opts);
      return { image, metrics: metrics(image, base, kappa) };
    },
    undo(): Doc {
      const prev = past.pop();
      if (prev) { future.push(current()); doc = prev; }
      return clone(current());
    },
    redo(): Doc {
      const next = future.pop();
      if (next) { past.push(current()); doc = next; }
      return clone(current());
    },
    reset: (): Doc => clone(commit(neutralDoc(current().photo))),
  };
}

export type Commands = ReturnType<typeof createCommands>;
