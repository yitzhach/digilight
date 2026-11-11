// A review round for Isaac (phase gates): every look on fixture photos, as a page where he
// marks each picture and types or speaks a note. Notes are kept in the artifact's database
// (collection "notes"), so the next session reads them with ArtifactData.
//   node scripts/review.ts [door-flat-crop.jpg lintel-flat-crop.jpg ...]   -> out/review/
// Publish out/review/index.html with files img/* and capabilities {db: {}, dictation: {}}.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createCommands, guardKappa, render } from '../src/index.ts';
import { encodeJpeg, loadFixture } from './jpeg.ts';

// Round 1 (phase1-looks): every look as first written. Round 2: looks retuned from Isaac's notes, and
// where it changes the picture a "B" with a stricter whites guard (counting from 240, not 250).
const ROUND = { id: 'phase1-looks-3', title: 'Looks review', about: 'Round 3: Dramatic and Raking from the top no longer blow out the corner or edge nearest the lamp; Warm evening is less orange, Candlelight less muddy, Soft window a touch warmer. Your round 2 note is under each picture it applied to. If a look reads right now, tap Looks right.' };
const VARIANT_B = 0; // 0: no "stricter whites" pictures (Isaac chose the normal guard in round 2)
// Earlier notes, if saved with ArtifactData list (out_dir out/notes): shown under each picture.
const prevDir = new URL('../out/notes/notes/', import.meta.url), prev: Record<string, string> = {};
if (existsSync(prevDir)) for (const f of readdirSync(prevDir)) {
  const d = JSON.parse(readFileSync(new URL(f, prevDir), 'utf8')) as { item?: string; note?: string; data?: { item?: string; note?: string } };
  const v = d.data ?? d;
  if (v.item && v.note) prev[v.item] = v.note.trim();
}
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
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
    const before = prev[id] ? `<br>Last round: “${esc(prev[id])}”` : '';
    items.push({ id, piece, look: look.label, src, note: `Median brightness ${m.photo.p50.toFixed(0)} → ${m.render.p50.toFixed(0)}${before}` });
    console.log(`${id.padEnd(24)} kappa ${m.kappa.toFixed(2)}  ${ms.toFixed(0)} ms full size`);
    const kb = VARIANT_B ? guardKappa(photo, c.getDoc(), VARIANT_B) : 1;
    if (VARIANT_B && kb < m.kappa - 0.08) { // only where the difference is visible
      const bImg = render(photo, c.getDoc(), { width: 1000, kappa: kb });
      const bid = `${id}--b`, bsrc = `img/${bid}.jpg`;
      writeFileSync(new URL(bsrc, out), encodeJpeg(bImg, 82));
      items.push({ id: bid, piece, look: `${look.label} · stricter whites`, src: bsrc, note: `Same look, light dimmed to ${Math.round(kb * 100)}%` });
      console.log(`${bid.padEnd(24)} kappa ${kb.toFixed(2)}`);
    }
  }
}
const page = readFileSync(new URL('review-page.html', import.meta.url), 'utf8')
  .replace('/*ROUND*/null', JSON.stringify({ ...ROUND, items }))
  .replace('<title>Looks review</title>', `<title>${ROUND.title}</title>`);
writeFileSync(new URL('index.html', out), page);
console.log(`wrote ${new URL('index.html', out).pathname} and ${items.length} pictures`);
