// image-io.ts — photo files to pixels and pictures to files, in Node with sharp (BUILD.md Phase 7).
// The pixels are the ones the app decodes: turned upright by EXIF; a photo whose profile is
// wider than sRGB is worked in Display P3, any other in sRGB (D-016); the stored values are
// kept when the profile is that space's own, converted otherwise; opaque. Pictures are written
// as PNG or JPEG, a Display P3 one with its profile, which this file writes in itself: sharp's
// own way of adding a profile also converts the pixels.

import { createHash } from 'node:crypto';
import { crc32, deflateSync } from 'node:zlib';
import { iccKind, type Image, type Space } from 'core';
import sharp from 'sharp';

export interface Decoded {
  image: Image; space: Space; name: string;
  /** SHA-256 of the file, and of its decoded RGBA pixels (a record's photo.pixelsSha256). */
  sha256: string; pixelsSha256: string;
}

export const sha256 = (b: Uint8Array | Uint8ClampedArray): string => createHash('sha256').update(b).digest('hex');

/** A photo file's pixels as the app reads them. */
export async function decodePhoto(bytes: Uint8Array, name: string): Promise<Decoded> {
  let meta: sharp.Metadata;
  try { meta = await sharp(bytes).metadata(); } catch {
    throw new Error(`Could not read "${name}": use a whole JPEG, PNG, WebP or TIFF photo file.`);
  }
  const kind = meta.icc ? iccKind(new Uint8Array(meta.icc)) : 'srgb';
  const space: Space = kind === 'display-p3' || kind === 'wide' ? 'display-p3' : 'srgb';
  const keep = kind === 'srgb' || kind === 'display-p3'; // the stored values are already in `space`
  let s = sharp(bytes, { autoOrient: true, ignoreIcc: keep });
  if (!keep) s = s.withIccProfile(space === 'display-p3' ? 'p3' : 'srgb');
  if (meta.channels !== undefined && meta.channels < 3) s = s.toColourspace('srgb'); // grey to RGB
  const heic = /\.(heic|heif)$/i.test(name) || meta.format === 'heif';
  const { data, info } = await s.ensureAlpha().raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true }).catch(() => {
    throw new Error(heic ? `"${name}" is a HEIC photo, which this computer's DigiLight cannot read: open it in the app, or save it as JPEG or PNG first.`
      : `Could not read "${name}": use a whole JPEG, PNG, WebP or TIFF photo file.`);
  });
  if (info.channels !== 4) throw new Error(`"${name}" decoded to ${info.channels} channels, not RGBA.`);
  const px = new Uint8ClampedArray(data.buffer, data.byteOffset, data.length);
  for (let p = 3; p < px.length; p += 4) px[p] = 255; // DigiLight lights artwork: every pixel opaque
  return { image: { data: px, width: info.width, height: info.height }, space, name, sha256: sha256(bytes), pixelsSha256: sha256(px) };
}

let p3: Promise<Buffer> | null = null;
/** sharp's Display P3 profile, taken from a one-pixel picture it writes with it. */
function p3Profile(): Promise<Buffer> {
  p3 ??= sharp({ create: { width: 1, height: 1, channels: 3, background: '#000' } }).withIccProfile('p3').png().toBuffer()
    .then(async (b) => (await sharp(b).metadata()).icc ?? Promise.reject(new Error('no Display P3 profile in sharp')));
  return p3;
}

/** RGBA8 pixels to a PNG or JPEG file; a Display P3 picture carries that profile. */
export async function encodePicture(img: Image, space: Space, format: 'jpeg' | 'png', quality = 0.92): Promise<Buffer> {
  const s = sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length), { raw: { width: img.width, height: img.height, channels: 4 } }).removeAlpha();
  const file = format === 'png' ? await s.png().toBuffer() : await s.jpeg({ quality: Math.round(quality * 100) }).toBuffer();
  if (space !== 'display-p3') return file;
  return format === 'png' ? pngWithProfile(file, await p3Profile()) : jpegWithProfile(file, await p3Profile());
}

/** An iCCP chunk after IHDR (the signature, then IHDR's 25 bytes). */
function pngWithProfile(png: Buffer, icc: Buffer): Buffer {
  const at = 8 + 25, data = Buffer.concat([Buffer.from('Display P3\0\0', 'latin1'), deflateSync(icc)]); // name, its end, method 0
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0); chunk.write('iCCP', 4, 'latin1'); data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)) >>> 0, 8 + data.length);
  return Buffer.concat([png.subarray(0, at), chunk, png.subarray(at)]);
}

/** An APP2 ICC_PROFILE segment (one part) after SOI and APP0, as cameras write it. */
function jpegWithProfile(jpg: Buffer, icc: Buffer): Buffer {
  const head = Buffer.from('ICC_PROFILE\0', 'latin1'), len = 2 + head.length + 2 + icc.length;
  if (len > 0xffff) throw new Error('profile too large for one JPEG segment');
  const seg = Buffer.alloc(2 + len);
  seg[0] = 0xff; seg[1] = 0xe2; seg.writeUInt16BE(len, 2); head.copy(seg, 4);
  seg[4 + head.length] = 1; seg[5 + head.length] = 1; icc.copy(seg, 6 + head.length);
  const at = jpg[2] === 0xff && jpg[3] === 0xe0 ? 4 + jpg.readUInt16BE(4) : 2;
  return Buffer.concat([jpg.subarray(0, at), seg, jpg.subarray(at)]);
}

/** A small picture for an agent to look at: JPEG (quality 85) unless PNG is asked for. */
export async function previewFile(img: Image, space: Space, format: 'jpeg' | 'png' = 'jpeg'): Promise<{ data: Buffer; mimeType: string }> {
  return { data: await encodePicture(img, space, format, 0.85), mimeType: format === 'png' ? 'image/png' : 'image/jpeg' };
}
