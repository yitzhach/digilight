// Node helpers for tests and scripts: fixture photos in and JPEGs out (jpeg-js, pure JS).

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import jpeg from 'jpeg-js';
import type { Image } from '../src/index.ts';

export const FIXTURES = new URL('../../../fixtures/', import.meta.url);

export interface Fixture extends Image { sha256: string }
const cache = new Map<string, Fixture>();

/** A photo from fixtures/ as RGBA8, with the file's SHA-256. */
export function loadFixture(name: string): Fixture {
  let f = cache.get(name);
  if (!f) {
    const buf = readFileSync(new URL(name, FIXTURES));
    const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
    f = { data: new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.length), width: img.width, height: img.height, sha256: sha256(buf) };
    cache.set(name, f);
  }
  return f;
}

/** A JPEG file anywhere on disk as RGBA8. */
export function loadImage(path: string): Image {
  const img = jpeg.decode(readFileSync(path), { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 2048 });
  return { data: new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.length), width: img.width, height: img.height };
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function encodeJpeg(img: Image, quality = 88): Buffer {
  return jpeg.encode({ data: Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length), width: img.width, height: img.height }, quality).data;
}
