// colour.ts — the photo's colour space, kept from the file to the export. Ported from v1
// src/colour.js (`spaceOf`, `iccWide`, `decodeHeif`, `canvas2d`, `imageData`).
//
// Phones save in Display P3 and many cameras in Adobe RGB. A photo whose profile is wider than
// sRGB is worked in Display P3 (its canvases, the WebGL textures and drawing buffer, the export,
// which carries a Display P3 profile); any other photo stays sRGB. The lighting works on the
// encoded values in either space, so a look is the same look.
//
// HEIC: Safari opens it; elsewhere libheif (vendor/libheif, WebAssembly, ~1.5 MB) decodes it,
// loaded only then.

import type { Space } from 'core';

type Ctx2D = CanvasRenderingContext2D;

/** A canvas of w x h and its 2D context, in `space`. */
export function canvas2d(w: number, h: number, space: Space, opts: CanvasRenderingContext2DSettings = {}): [HTMLCanvasElement, Ctx2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d', { ...opts, colorSpace: space })!];
}

/** ImageData in `space` holding `data` (RGBA8, w x h). */
export const imageData = (data: Uint8ClampedArray, w: number, h: number, space: Space): ImageData =>
  new ImageData(data as Uint8ClampedArray<ArrayBuffer>, w, h, { colorSpace: space });

/** The space to work a photo in, from its file's colour profile: 'display-p3' or 'srgb'. */
export async function spaceOf(blob: Blob): Promise<Space> {
  try {
    const u = new Uint8Array(await blob.slice(0, 1 << 20).arrayBuffer());
    const p = await profileOf(u);
    return p && (p.wide ?? iccWide(p.icc!)) ? 'display-p3' : 'srgb';
  } catch { return 'srgb'; }
}

interface Profile { icc?: Uint8Array; wide?: boolean }

// The colour profile in a JPEG, PNG, WebP or HEIC / AVIF: {icc} (bytes) or {wide} (an nclx box).
async function profileOf(u: Uint8Array): Promise<Profile | null> {
  const at = (i: number) => u[i] ?? 0;
  const be16 = (i: number) => (at(i) << 8) | at(i + 1), be32 = (i: number) => ((at(i) << 24) >>> 0) + (at(i + 1) << 16) + (at(i + 2) << 8) + at(i + 3);
  const str = (i: number, n: number) => String.fromCharCode(...u.subarray(i, i + n));
  if (at(0) === 0xff && at(1) === 0xd8) {
    // JPEG: APP2 "ICC_PROFILE" segments, in order, before the scan.
    const parts: Uint8Array[] = [];
    for (let i = 2; i + 4 < u.length && at(i) === 0xff;) {
      const m = at(i + 1), n = be16(i + 2);
      if (m === 0xda) break;
      if (m === 0xe2 && str(i + 4, 12) === 'ICC_PROFILE\0') parts.push(u.subarray(i + 18, i + 2 + n));
      i += 2 + n;
    }
    return parts.length ? { icc: concat(parts) } : null;
  }
  if (str(1, 3) === 'PNG') {
    // PNG: iCCP (name, 0, compression 0, zlib data), before the image data.
    for (let i = 8; i + 8 < u.length;) {
      const n = be32(i), t = str(i + 4, 4);
      if (t === 'IDAT') break;
      if (t === 'iCCP') { const d = u.subarray(i + 8, i + 8 + n), z = d.indexOf(0) + 2; return { icc: await inflate(d.subarray(z)) }; }
      i += 12 + n;
    }
    return null;
  }
  if (str(0, 4) === 'RIFF' && str(8, 4) === 'WEBP') {
    for (let i = 12; i + 8 < u.length;) {
      const t = str(i, 4), n = at(i + 4) | (at(i + 5) << 8) | (at(i + 6) << 16) | (at(i + 7) << 24);
      if (t === 'ICCP') return { icc: u.subarray(i + 8, i + 8 + n) };
      i += 8 + n + (n & 1);
    }
    return null;
  }
  if (str(4, 4) === 'ftyp') {
    // HEIC / AVIF: a 'colr' box, an ICC profile ('prof', 'rICC') or nclx primaries (1 sRGB / BT.709;
    // 9 BT.2020, 11 DCI-P3, 12 Display P3).
    for (let i = u.indexOf(0x63, 8); i > 4 && i + 8 < u.length; i = u.indexOf(0x63, i + 1)) {
      if (str(i, 4) !== 'colr') continue;
      const n = be32(i - 4), kind = str(i + 4, 4);
      if (kind === 'prof' || kind === 'rICC') return { icc: u.subarray(i + 8, i - 4 + n) };
      if (kind === 'nclx') return { wide: [9, 11, 12].includes(be16(i + 8)) };
    }
  }
  return null;
}

/** Whether an ICC profile's primaries reach past sRGB's (Display P3, Adobe RGB, ProPhoto...). */
export function iccWide(icc: Uint8Array): boolean {
  const v = new DataView(icc.buffer, icc.byteOffset, icc.byteLength), sig = (i: number) => String.fromCharCode(...icc.subarray(i, i + 4));
  const xyz: Record<string, number[]> = {};
  for (let k = 0, n = v.getUint32(128); k < n; k++) {
    const t = 132 + k * 12, name = sig(t), at = v.getUint32(t + 4);
    if ((name === 'rXYZ' || name === 'gXYZ') && sig(at) === 'XYZ ') xyz[name] = [0, 1, 2].map((j) => v.getInt32(at + 8 + 4 * j) / 65536);
  }
  const x = (c?: number[]) => (c ? c[0]! / (c[0]! + c[1]! + c[2]!) : NaN);
  // Chromaticity x of the primaries, adapted to D50 as ICC stores them: sRGB red 0.648, green
  // 0.321; Display P3 0.683, 0.284; Adobe RGB 0.648, 0.215.
  return x(xyz.rXYZ) > 0.66 || x(xyz.gXYZ) < 0.30;
}

const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
async function inflate(z: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([z as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

export const isHeif = (file: { name?: string; type: string }): boolean =>
  /\.(heic|heif)$/i.test(file.name ?? '') || /image\/hei[cf]/i.test(file.type);

interface HeifImage { get_width(): number; get_height(): number; display(d: ImageData, cb: (d: ImageData | null) => void): void; free?(): void }
interface HeifLib { HeifDecoder: new () => { decode(b: Uint8Array): HeifImage[] } }
let heif: Promise<HeifLib> | null = null;

/**
 * A HEIC / HEIF photo the browser cannot open, decoded by libheif: a canvas in `space` holding
 * its pixels as they are encoded (libheif applies no profile; the space says what they are).
 */
export async function decodeHeif(blob: Blob, space: Space): Promise<HTMLCanvasElement> {
  // @ts-expect-error: the vendored bundle has no types
  heif ??= import('../../vendor/libheif/libheif-bundle.mjs').then((m: { default: () => HeifLib }) => m.default());
  const lib = await heif;
  const images = new lib.HeifDecoder().decode(new Uint8Array(await blob.arrayBuffer()));
  if (!images?.length) throw new Error('No picture found in that HEIC file.');
  const im = images[0]!, w = im.get_width(), h = im.get_height();
  const [c, g] = canvas2d(w, h, space);
  const data = new ImageData(w, h, { colorSpace: space });
  await new Promise<void>((res, rej) => im.display(data, (d) => (d ? res() : rej(new Error('HEIC decoding failed.')))));
  g.putImageData(data, 0, 0);
  for (const x of images) x.free?.();
  return c;
}
