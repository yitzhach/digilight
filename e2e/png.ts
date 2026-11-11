// png.ts — a plain RGBA8 PNG encoder for tests (Node zlib): a lossless photo the browser decodes
// to exactly these pixels, so the app and the reference start from the same bytes.
import { crc32, deflateSync } from 'node:zlib';
import type { Image } from 'core';

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)) >>> 0, 8 + data.length);
  return out;
}

export function encodePng(img: Image): Buffer {
  const head = Buffer.alloc(13);
  head.writeUInt32BE(img.width, 0); head.writeUInt32BE(img.height, 4);
  head[8] = 8; head[9] = 6; // 8 bits, RGBA
  const row = img.width * 4, raw = Buffer.alloc((row + 1) * img.height);
  for (let y = 0; y < img.height; y++) raw.set(img.data.subarray(y * row, (y + 1) * row), y * (row + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
