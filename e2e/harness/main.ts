// The page the e2e specs drive: one preview on one canvas, bytes in and out as base64.
import { buildHorizon, estimateHeight, horizonInput, type Doc, type Image, type Space } from 'core';
import { createPreview, type Preview, type View } from 'gl';

const toBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
function toB64(u: Uint8ClampedArray): string {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

const canvas = document.getElementById('c') as HTMLCanvasElement;
let preview: Preview | null = null, img: Image | null = null;

const api = {
  init(photo: string, width: number, height: number, space: Space) {
    canvas.width = width; canvas.height = height;
    preview ??= createPreview(canvas);
    img = { data: new Uint8ClampedArray(toBytes(photo).buffer), width, height };
    preview.setPhoto(img, space);
  },
  /** Estimated relief maps of the photo made here by core (the same bits as in Node), uploaded. */
  reliefCPU() {
    const h = estimateHeight(img!), m = buildHorizon(horizonInput(h.h, h.width, h.height, true));
    preview!.setRelief({ ...h, ...m });
    return { width: h.width, height: h.height, tmax: m.tmax };
  },
  /** The table built on the GPU against core's: shares of entries within 1 and 2 bytes. */
  async reliefGPU() {
    const h = estimateHeight(img!), inp = horizonInput(h.h, h.width, h.height, true), cpu = buildHorizon(inp);
    const t = performance.now();
    let frames = 0;
    await preview!.buildRelief(h, inp, () => { frames++; return new Promise((r) => requestAnimationFrame(r)); }, () => Promise.resolve(cpu.tmax));
    const ms = performance.now() - t, gpu = preview!.readRelief()!;
    const cmp = (a: Uint8Array, b: Uint8Array) => {
      let w1 = 0, w2 = 0, max = 0;
      for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i]! - b[i]!); if (d <= 1) w1++; if (d <= 2) w2++; if (d > max) max = d; }
      return { within1: w1 / a.length, within2: w2 / a.length, max };
    };
    return { width: h.width, height: h.height, frames, ms, tmax: [gpu.tmax, cpu.tmax], table: cmp(gpu.table, cpu.table), ao: cmp(gpu.ao, cpu.ao) };
  },
  /** `glow` (tool:glow): Glow's maps as made in Node (floats as base64), so the preview adds the reference's own. */
  /** `size` (tool:wall): the canvas's size for this draw, when it is not the photo's. */
  draw(doc: Doc, kappa: number, opts: { scale?: number; view?: Partial<View>; glow?: { width: number; height: number; near: string; far: string }; size?: [number, number] } = {}) {
    canvas.width = opts.size?.[0] ?? img!.width; canvas.height = opts.size?.[1] ?? img!.height; // tool:wall
    const p = preview!, g = opts.glow, f32 = (b: string) => new Float32Array(toBytes(b).buffer);
    p.setDoc(doc, { kappa, ...(g ? { glow: { width: g.width, height: g.height, near: f32(g.near), far: f32(g.far), key: '' } } : {}) });
    p.setScale(opts.scale ?? 1);
    p.setView({ zoom: 1, pan: [0.5, 0.5], ...opts.view });
    const gl = canvas.getContext('webgl2')!;
    const out = toB64(p.readPixels().data);
    return { pixels: out, error: gl.getError() };
  },
};
(window as unknown as { harness: typeof api }).harness = api;
