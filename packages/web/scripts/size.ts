// size.ts — the JavaScript shipped, gzip, without the HEIC decoder, against BUILD.md §9's budget
// (Phase 5b item 11). Run after `pnpm build`; CI fails over budget. Each file counted once.

import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const BUDGET = 250 * 1024, DIR = new URL('../dist/assets/', import.meta.url);
const files = readdirSync(DIR).filter((f) => f.endsWith('.js') && !f.startsWith('libheif'));
if (!files.length) throw new Error('no built JavaScript: run pnpm build first');
let total = 0;
for (const f of files.sort()) {
  const n = gzipSync(readFileSync(new URL(f, DIR))).length;
  total += n;
  console.log(`${(n / 1024).toFixed(1).padStart(7)} KB  ${f}`);
}
console.log(`${(total / 1024).toFixed(1).padStart(7)} KB  total (budget ${BUDGET / 1024} KB)`);
if (total > BUDGET) { console.error('Over the JavaScript budget (BUILD.md §9).'); process.exit(1); }
