// open.ts — a photo file to pixels: RGBA8 in the photo's working space, and the file's SHA-256
// (D-014). JPEG, PNG and WebP by the browser; HEIC by the browser where it can (Safari),
// otherwise by libheif.

import type { Image, Space } from 'core';
import { canvas2d, decodeHeif, isHeif, spaceOf } from './colour.ts';

/** `image`: the picture the document lights; `file`: the file's own pixels (the same image until
 *  a crop, Phase 6b); `crop`: which crop `image` is (cropKey). */
export interface Photo { image: Image; file: Image; crop: string; space: Space; sha256: string; name: string; blob: Blob }

/** Which crop a document's picture is, comparable with Photo.crop. */
export const cropKey = (d: { photo: { crop?: { corners: unknown } } }): string => JSON.stringify(d.photo.crop?.corners ?? null);

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');
export const sha256 = async (bytes: BufferSource): Promise<string> => hex(await crypto.subtle.digest('SHA-256', bytes));

const KINDS = /^image\/(jpeg|png|webp|hei[cf])$/i;

export async function decodePhoto(blob: Blob, name = (blob as File).name ?? 'photo'): Promise<Photo> {
  const heif = isHeif({ name, type: blob.type });
  if (!heif && blob.type && !KINDS.test(blob.type) && !/\.(jpe?g|png|webp)$/i.test(name))
    throw new Error(`"${name}" is not a photo DigiLight opens. Use a JPEG, PNG, WebP or HEIC file.`);
  // The file's hash runs while the photo decodes.
  const digest = blob.arrayBuffer().then(sha256);
  const space = await spaceOf(blob);
  let source: CanvasImageSource & { width: number; height: number };
  try {
    source = await createImageBitmap(blob); // the browser converts from the file's profile
  } catch (e) {
    if (!heif) throw new Error(`Could not read "${name}". Is it a whole, undamaged photo file?`, { cause: e });
    source = await decodeHeif(blob, space);
  }
  const { width, height } = source;
  const [, g] = canvas2d(width, height, space, { willReadFrequently: true });
  g.drawImage(source, 0, 0);
  if ('close' in source) source.close();
  const data = g.getImageData(0, 0, width, height, { colorSpace: space }).data;
  // Opaque: DigiLight lights artwork, and the renderer treats every pixel as opaque. A photo
  // that decodes to nothing (every pixel black) was too big for this device's canvas.
  let blank = true;
  for (let p = 0; p < data.length; p += 4) { data[p + 3] = 255; if (blank && (data[p]! | data[p + 1]! | data[p + 2]!)) blank = false; }
  if (blank) throw new Error(`"${name}" came out empty: this photo is too large for this phone. Export a smaller copy (under 16 megapixels) and open that.`);
  const image = { data, width, height };
  return { image, file: image, crop: cropKey({ photo: {} }), space, sha256: await digest, name, blob };
}
