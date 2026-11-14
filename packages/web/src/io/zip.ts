// zip.ts — a zip file without compression (BUILD.md Phase 6b item 3): a `.digilight` project and
// "Apply to more photos" download. Photos are compressed already, so storing them costs nothing
// and keeps this small; no dependency. The reader takes stored entries only (what this writes).

export interface Entry { name: string; data: Uint8Array }

const TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
export function crc32(d: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < d.length; i++) c = TABLE[(c ^ d[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A zip of the entries, stored (UTF-8 names, no time: the same entries give the same bytes). */
export function writeZip(entries: Entry[]): Blob {
  const enc = new TextEncoder(), parts: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name), crc = crc32(e.data), size = e.data.length;
    if (size >= 0xffffffff || offset >= 0xffffffff) throw new Error('This file is too large to save (over 4 GB).');
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true); local.setUint16(10, 0, true); local.setUint16(12, 0x21, true); // 1980-01-01
    local.setUint32(14, crc, true); local.setUint32(18, size, true); local.setUint32(22, size, true);
    local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
    const head = new DataView(new ArrayBuffer(46));
    head.setUint32(0, 0x02014b50, true); head.setUint16(4, 20, true); head.setUint16(6, 20, true); head.setUint16(8, 0x0800, true);
    head.setUint16(10, 0, true); head.setUint16(12, 0, true); head.setUint16(14, 0x21, true);
    head.setUint32(16, crc, true); head.setUint32(20, size, true); head.setUint32(24, size, true);
    head.setUint16(28, name.length, true); head.setUint32(42, offset, true);
    parts.push(new Uint8Array(local.buffer), name, e.data);
    central.push(new Uint8Array(head.buffer), name);
    offset += 30 + name.length + size;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[], { type: 'application/zip' });
}

/** The entries of a zip this app wrote (stored, CRC checked); a plain message for anything else. */
export function readZip(bytes: Uint8Array): Map<string, Uint8Array> {
  try { return entries(bytes); } catch (e) {
    if (e instanceof RangeError) throw bad(); // an offset past the end: a damaged file
    throw e;
  }
}
const bad = () => new Error('That file is not a DigiLight file, or it is damaged.');
function entries(bytes: Uint8Array): Map<string, Uint8Array> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let e = bytes.length - 22;
  while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw bad();
  const n = v.getUint16(e + 10, true), out = new Map<string, Uint8Array>(), dec = new TextDecoder();
  let p = v.getUint32(e + 16, true);
  for (let i = 0; i < n; i++) {
    if (p + 46 > bytes.length || v.getUint32(p, true) !== 0x02014b50) throw bad();
    const method = v.getUint16(p + 10, true), crc = v.getUint32(p + 16, true), size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true), extra = v.getUint16(p + 30, true), note = v.getUint16(p + 32, true), at = v.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    if (method !== 0) throw new Error('That file was compressed by another program; DigiLight opens the files it saves.');
    const start = at + 30 + v.getUint16(at + 26, true) + v.getUint16(at + 28, true), data = bytes.subarray(start, start + size);
    if (data.length !== size || crc32(data) !== crc) throw bad();
    out.set(name, data);
    p += 46 + nameLen + extra + note;
  }
  return out;
}
