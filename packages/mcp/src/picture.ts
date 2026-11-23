// picture.ts — what open_image takes and what export_image gives (BUILD.md §7, Phase 7): a photo
// file or a .digilight project in; the picture at full size (or a width) out, made as the app
// makes it (the reference renderer, the guard's factor, the texture's maps, the wall), with its
// .json record: the document, the photo file's SHA-256 and its decoded pixels', the picture's
// pixels' and file's. The decoded pixels' hash lets `verify` tell a decoder from a renderer.

import { readFile, writeFile } from 'node:fs/promises';
import { guardKappa, measuredRelief, render, renderWithWall, unpackHeight, type Doc, type Image, type MeasuredHeight } from 'core';
import sharp from 'sharp';
import { unpackProject } from '../../web/src/io/project.ts';
import { decodePhoto, encodePicture, sha256, type Decoded } from './image-io.ts';

export interface ExportRecord {
  app: 'DigiLight 2'; exported: string; document: Doc;
  photo: { name: string; sha256: string; pixelsSha256: string; width: number; height: number; space: string };
  picture: { width: number; height: number; format: 'jpeg' | 'png'; quality?: number; pixelsSha256: string; fileSha256: string };
}

/** A photo, or a project's photo with its document and measured height. */
export interface Source { photo: Decoded; doc: Doc | null; height: MeasuredHeight | null; project: boolean }

const base = (path: string) => path.split(/[\\/]/).pop() ?? path;

export async function openSource(path: string): Promise<Source> {
  let bytes: Uint8Array;
  try { bytes = new Uint8Array(await readFile(path)); } catch { throw new Error(`No file at ${path}`); }
  const name = base(path);
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4; // a project is a zip
  if (!zip && !/\.digilight$/i.test(name)) return { photo: await decodePhoto(bytes, name), doc: null, height: null, project: false };
  const p = await unpackProject(bytes);
  let height: MeasuredHeight | null = null;
  if (p.height) {
    const { data } = await sharp(p.height.png, { ignoreIcc: true }).ensureAlpha().raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true });
    height = unpackHeight(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), p.height.width, p.height.height, p.height.lo, p.height.hi);
  }
  return { photo: await decodePhoto(p.photo.bytes, p.photo.name), doc: p.doc, height, project: true };
}

/** The picture as the app's export renders it (`width`: the piece's, as there). */
export function renderPicture(picture: Image, doc: Doc, height: MeasuredHeight | null, width?: number): Image {
  const kappa = guardKappa(picture, doc);
  const relief = doc.relief.mode === 'measured' && height ? measuredRelief(height) : undefined;
  return (doc.wall.on ? renderWithWall : render)(picture, doc, { ...(width === undefined ? {} : { width }), kappa, ...(relief ? { relief } : {}) }); // tool:wall
}

export interface ExportOptions { width?: number; format?: 'jpeg' | 'png'; quality?: number }

/** The encoded picture and its record. */
export async function exportPicture(photo: Decoded, picture: Image, doc: Doc, height: MeasuredHeight | null, opts: ExportOptions = {}): Promise<{ file: Buffer; record: ExportRecord }> {
  const format = opts.format ?? 'jpeg', quality = opts.quality ?? 0.92;
  if (format !== 'jpeg' && format !== 'png') throw new Error('format must be "jpeg" or "png"');
  if (!(quality > 0 && quality <= 1)) throw new Error('quality must be over 0 and at most 1');
  const img = renderPicture(picture, doc, height, opts.width);
  const file = await encodePicture(img, photo.space, format, quality);
  return {
    file,
    record: {
      app: 'DigiLight 2', exported: new Date().toISOString(), document: doc,
      photo: { name: photo.name, sha256: photo.sha256, pixelsSha256: photo.pixelsSha256, width: doc.photo.width, height: doc.photo.height, space: photo.space },
      picture: { width: img.width, height: img.height, format, ...(format === 'jpeg' ? { quality } : {}), pixelsSha256: sha256(img.data as Uint8ClampedArray), fileSha256: sha256(file) },
    },
  };
}

/** Writes the picture at `path` and its record beside it (the same name, .json). */
export async function writeExport(path: string, file: Buffer, record: ExportRecord): Promise<string> {
  const json = path.replace(/\.[^./\\]*$/, '') + '.json';
  await writeFile(path, file);
  await writeFile(json, `${JSON.stringify(record, null, 2)}\n`);
  return json;
}
