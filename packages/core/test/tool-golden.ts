// The light tools' goldens (docs/light-tools.md rule 6): one SHA-256 per tool in
// tool-goldens.json, apart from goldens.json so that removing a tool removes one key.
// UPDATE_GOLDENS=1 rewrites the key.

import { readFileSync, writeFileSync } from 'node:fs';
import { expect } from 'vitest';
import type { Image } from '../src/index.ts';
import { sha256 } from '../scripts/jpeg.ts';

const file = new URL('tool-goldens.json', import.meta.url);

export function expectGolden(id: string, img: Image): void {
  const all = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
  const got = sha256(new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.length));
  if (process.env.UPDATE_GOLDENS) { all[id] = got; writeFileSync(file, `${JSON.stringify(all, null, 2)}\n`); }
  expect(got, `tool-goldens.json "${id}"`).toBe(all[id]);
}
