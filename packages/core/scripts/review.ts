// A review round for Isaac (phase gates): every look on fixture photos, as a page where he
// marks each picture and types or speaks a note. Notes are kept in the artifact's database
// (collection "notes"), so the next session reads them with ArtifactData.
//   node scripts/review.ts [door-flat-crop.jpg lintel-flat-crop.jpg ...]   -> out/review/
// Publish out/review/index.html with files img/* and capabilities {db: {}, dictation: {}}.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createCommands, render } from '../src/index.ts';
import { encodeJpeg, loadFixture } from './jpeg.ts';

const ROUND = { id: 'phase1-looks', title: 'Looks review', about: 'Every one-tap look on your door and lintel photos, light only (no texture yet). Mark each picture and say what reads wrong.' };
const PIECE: Record<string, string> = { 'door-flat-crop.jpg': 'Door', 'lintel-flat-crop.jpg': 'Lintel' };
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PIECE);
const out = new URL('../out/review/', import.meta.url);
mkdirSync(new URL('img/', out), { recursive: true });

const items: { id: string; piece: string; look: string; src: string; note: string }[] = [];
for (const name of names) {
  const photo = loadFixture(name), c = createCommands(), piece = PIECE[name] ?? name.replace(/\.jpg$/, '');
  c.open(photo);
  for (const look of c.looks()) {
    c.applyLook(look.id);
    const t = performance.now();
    render(photo, c.getDoc());
    const ms = performance.now() - t;
    const { image, metrics: m } = c.render({ width: 1000 });
    const id = `${piece.toLowerCase()}--${look.id}`, src = `img/${id}.jpg`;
    writeFileSync(new URL(src, out), encodeJpeg(image, 82));
    const dim = m.kappa < 1 ? `, light dimmed to ${Math.round(m.kappa * 100)}% to keep whites` : '';
    items.push({ id, piece, look: look.label, src, note: `Median brightness ${m.photo.p50.toFixed(0)} → ${m.render.p50.toFixed(0)}${dim}` });
    console.log(`${id.padEnd(24)} kappa ${m.kappa.toFixed(2)}  ${ms.toFixed(0)} ms full size`);
  }
}
const page = readFileSync(new URL('review-page.html', import.meta.url), 'utf8')
  .replace('/*ROUND*/null', JSON.stringify({ ...ROUND, items }))
  .replace('<title>Looks review</title>', `<title>${ROUND.title}</title>`);
writeFileSync(new URL('index.html', out), page);
console.log(`wrote ${new URL('index.html', out).pathname} and ${items.length} pictures`);
