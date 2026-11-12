// measure.worker.ts — True Relief in the app (BUILD.md Phase 5): side-lit photos lined up onto
// the photo at relief size, the light's axis read, two small previews (one measurement at long
// side 512 and its height turned over), then the measurement at relief size. The same core
// functions as measureFromPhotos, so the height is the one Node measures from the same photos.

import {
  flipped, measuredRelief, measureRelief, neutralDoc, parseDoc, prepareSideLit, quantise, reliefFlat, render, resampleRegion, thumbnail,
  type Image, type MeasuredHeight, type ShotLight, type SideLit,
} from 'core';

/** How a photo's light is taken: sunlight from a direction, or a lamp placed in cm (tripod shot). */
export type ShotSpec = { from: number; elevation: number } | { lamp: { left: number; above: number; out: number } };

export type MeasureRequest =
  | { type: 'flat'; data: Uint8ClampedArray; width: number; height: number }
  | { type: 'add'; id: number; data: Uint8ClampedArray; width: number; height: number }
  | { type: 'clear' }
  | { type: 'preview'; id: number; shots: ShotSpec[]; widthCm?: number; light: number }
  | { type: 'measure'; id: number; shots: ShotSpec[]; widthCm?: number };

export type MeasureReply =
  | { type: 'added'; id: number; axis: number; coherence: number }
  | { type: 'previews'; id: number; width: number; height: number; a: Uint8ClampedArray; b: Uint8ClampedArray | null }
  | { type: 'progress'; id: number; text: string }
  | { type: 'measured'; id: number; height: MeasuredHeight; depth: number; check: number[] | null }
  | { type: 'error'; id: number; message: string };

/** Long side of the two previews (§10 Phase 5: one measurement, about 1 s). */
const PREVIEW = 512;

let flat: Image | null = null;
/** Each side-lit photo as given, and lined up (handheld) or resized (tripod, for a lamp). */
let photos: { image: Image; handheld: SideLit; tripod?: Uint8ClampedArray }[] = [];
let small: { flat: Image; lined: Uint8ClampedArray[]; key: string } | null = null;

const post = (m: MeasureReply, transfer: Transferable[] = []) => self.postMessage(m, { transfer });

const lightOf = (s: ShotSpec): ShotLight => ('lamp' in s ? s.lamp : { sun: { azimuthDeg: s.from, elevationDeg: s.elevation } });

/** Each shot's pixels on the flat photo at relief size. */
function shotsOf(specs: ShotSpec[]): Uint8ClampedArray[] {
  if (specs.length !== photos.length) throw new Error('one setting per side-lit photo');
  return specs.map((s, k) => {
    const p = photos[k]!;
    if (!('lamp' in s)) return p.handheld.lined;
    p.tripod ??= prepareSideLit(flat!, p.image, true).lined;
    return p.tripod;
  });
}

function preview(id: number, specs: ShotSpec[], widthCm: number | undefined, light: number): void {
  const lined = shotsOf(specs), key = specs.map((s) => ('lamp' in s ? 'L' : 'S')).join('');
  if (!small || small.key !== key) {
    const f = thumbnail(flat!, PREVIEW);
    small = { flat: f, key, lined: lined.map((l) => resampleRegion({ data: l, width: flat!.width, height: flat!.height }, f.width, f.height, 0, 0, f.width, f.height).data) };
  }
  const { flat: f } = small;
  const m = measureRelief({ even: f.data, w: f.width, h: f.height, shots: small.lined.map((rgba, k) => ({ rgba, light: lightOf(specs[k]!) })), ...(widthCm ? { widthCm } : {}) });
  const q = quantise(m);
  // Both previews under the same light: the height as measured, and turned over (the other end).
  const base = neutralDoc({ width: f.width, height: f.height, space: 'srgb', sha256: '0'.repeat(64) }); // a preview, not a photo file
  const doc = parseDoc({
    ...base, ambient: { level: 0.15, kelvin: 6500 },
    lights: [{ id: 'sun', kind: 'sun', azimuth: light, elevation: 25, intensity: 1, kelvin: 6500, size: 0.01 }],
    relief: { ...base.relief, mode: 'measured', depth: Math.min(0.03, q.depth), shadows: 1 },
  });
  const a = render(f, doc, { relief: measuredRelief(q.height) }).data;
  // A lamp's place says which way the light came from: nothing to choose.
  const b = specs.every((s) => 'lamp' in s) ? null : render(f, doc, { relief: measuredRelief(flipped(q.height)) }).data;
  post({ type: 'previews', id, width: f.width, height: f.height, a, b }, b ? [a.buffer, b.buffer] : [a.buffer]);
}

function measure(id: number, specs: ShotSpec[], widthCm: number | undefined): void {
  const lined = shotsOf(specs);
  const m = measureRelief({
    even: flat!.data, w: flat!.width, h: flat!.height, shots: lined.map((rgba, k) => ({ rgba, light: lightOf(specs[k]!) })),
    ...(widthCm ? { widthCm } : {}), onProgress: (text) => post({ type: 'progress', id, text }),
  });
  const q = quantise(m);
  post({ type: 'measured', id, height: q.height, depth: q.depth, check: m.check }, [q.height.data.buffer]);
}

self.onmessage = (e: MessageEvent<MeasureRequest>) => {
  const m = e.data, id = 'id' in m ? m.id : -1;
  try {
    switch (m.type) {
      case 'flat': flat = reliefFlat({ data: m.data, width: m.width, height: m.height }); photos = []; small = null; break;
      case 'clear': photos = []; small = null; break;
      case 'add': {
        if (!flat) throw new Error('open a photo first');
        if (photos.length >= 3) throw new Error('True Relief takes one to three side-lit photos');
        const image = { data: m.data, width: m.width, height: m.height }, handheld = prepareSideLit(flat, image);
        photos.push({ image, handheld });
        small = null;
        post({ type: 'added', id, axis: handheld.axis.axisDeg, coherence: handheld.axis.coherence });
        break;
      }
      case 'preview': preview(id, m.shots, m.widthCm, m.light); break;
      case 'measure': measure(id, m.shots, m.widthCm); break;
    }
  } catch (err) {
    post({ type: 'error', id, message: err instanceof Error ? err.message : String(err) });
  }
};
