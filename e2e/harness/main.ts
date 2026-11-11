// The page the e2e specs drive: one preview on one canvas, bytes in and out as base64.
import type { Doc, Space } from 'core';
import { createPreview, type Preview, type View } from 'gl';

const toBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
function toB64(u: Uint8ClampedArray): string {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

const canvas = document.getElementById('c') as HTMLCanvasElement;
let preview: Preview | null = null;

const api = {
  init(photo: string, width: number, height: number, space: Space) {
    canvas.width = width; canvas.height = height;
    preview ??= createPreview(canvas);
    preview.setPhoto({ data: new Uint8ClampedArray(toBytes(photo).buffer), width, height }, space);
  },
  draw(doc: Doc, kappa: number, opts: { scale?: number; view?: Partial<View> } = {}) {
    const p = preview!;
    p.setDoc(doc, { kappa });
    p.setScale(opts.scale ?? 1);
    p.setView({ zoom: 1, pan: [0.5, 0.5], ...opts.view });
    const gl = canvas.getContext('webgl2')!;
    const out = toB64(p.readPixels().data);
    return { pixels: out, error: gl.getError() };
  },
};
(window as unknown as { harness: typeof api }).harness = api;
