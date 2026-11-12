// A review round for Isaac (phase gates): pictures of fixture photos as a page where he
// marks each picture and types or speaks a note. Notes are kept in the artifact's database
// (collection "notes"), so the next session reads them with ArtifactData.
//   node scripts/review.ts [door-flat-crop.jpg lintel-flat-crop.jpg ...]   -> out/review/
// Publish out/review/index.html with files img/* and capabilities {db: {}, dictation: {}}.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createCommands, type Image } from '../src/index.ts';
import { encodeJpeg, loadFixture } from './jpeg.ts';

// Rounds 1 to 3 (phase1-looks-*): every look. Round 4 (phase4-1): the four looks retuned from
// Isaac's notes after Phase 3 (D-033), then Texture (estimated relief) with the raking looks at
// several Shadows and Depths on three photos (D-022), so he can judge it and pick strengths.
const ROUND = {
  id: 'phase4-1', title: 'Looks and Texture review',
  about: 'Part 1: Gallery, Spotlight and Dramatic are cooler now; Candlelight\'s lamp stands further below, so the bottom no longer blows out. Part 2: Texture, guessed from the photo itself, under the raking looks at a few strengths. For each: does it look like the real surface, or embossed and fake? If it is worse than no texture, say so: it then ships switched off and marked experimental.',
  generalHelp: 'Overall: is Texture worth having on? Which Shadows and Depth read most like the real piece?',
};
const LOOKS_RETUNED = ['gallery', 'spotlight', 'dramatic', 'candlelight'];
type Tex = { look: string; depth: number; shadows: number; label: string };
const T = (look: string, depth: number, shadows: number): Tex =>
  ({ look, depth, shadows, label: depth ? `Depth ${Math.round(100 * Math.sqrt(depth / 0.02))}, Shadows ${Math.round(shadows * 100)}` : 'Texture off' });
const TEXTURE: Tex[] = [T('raking-left', 0, 0), T('raking-left', 0.003, 0.3), T('raking-left', 0.003, 0.6), T('raking-left', 0.003, 1), T('raking-left', 0.006, 0.6), T('raking-top', 0.003, 0.6)];
// Earlier notes, if saved with ArtifactData list (out_dir out/notes): shown under each picture.
const prevDir = new URL('../out/notes/notes/', import.meta.url), prev: Record<string, string> = {};
if (existsSync(prevDir)) for (const f of readdirSync(prevDir)) {
  const d = JSON.parse(readFileSync(new URL(f, prevDir), 'utf8')) as { item?: string; note?: string; data?: { item?: string; note?: string } };
  const v = d.data ?? d;
  if (v.item && v.note) prev[v.item] = v.note.trim();
}
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const PIECE: Record<string, string> = { 'door-flat-crop.jpg': 'Door', 'lintel-flat-crop.jpg': 'Lintel', 'closeup-flat.jpg': 'Close-up' };
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PIECE);
const LOOK_PIECES = ['door-flat-crop.jpg', 'lintel-flat-crop.jpg'];
const out = new URL('../out/review/', import.meta.url);
mkdirSync(new URL('img/', out), { recursive: true });

const items: { id: string; piece: string; look: string; src: string; note: string }[] = [];
const add = (id: string, piece: string, look: string, image: Image, note: string) => {
  const src = `img/${id}.jpg`;
  writeFileSync(new URL(src, out), encodeJpeg(image, 85));
  const before = prev[id] ? `<br>Last round: “${esc(prev[id])}”` : '';
  items.push({ id, piece, look, src, note: note + before });
};
for (const name of names) {
  const photo = loadFixture(name), c = createCommands(), piece = PIECE[name] ?? name.replace(/\.jpg$/, '');
  c.open(photo);
  if (LOOK_PIECES.includes(name)) for (const id of LOOKS_RETUNED) {
    c.applyLook(id);
    const { image, metrics: m } = c.render({ width: 1000 }), label = c.looks().find((l) => l.id === id)!.label;
    add(`${piece.toLowerCase()}--${id}`, piece, label, image, `Retuned look. Median brightness ${m.photo.p50.toFixed(0)} → ${m.render.p50.toFixed(0)}`);
    console.log(`${piece} ${id}: kappa ${m.kappa.toFixed(2)}`);
  }
  for (const t of TEXTURE) {
    c.reset(); c.applyLook(t.look);
    if (t.depth) c.setRelief({ mode: 'estimated', depth: t.depth, shadows: t.shadows });
    const { image } = c.render({ width: 1200 }), label = c.looks().find((l) => l.id === t.look)!.label;
    add(`${piece.toLowerCase()}--tex-${t.look}-${t.depth}-${t.shadows}`, piece, `${label} · ${t.label}`, image, t.depth ? 'Texture on (estimated from the photo)' : 'For comparison: the same light, no texture');
    console.log(`${piece} ${t.look} ${t.label}`);
  }
}
const page = readFileSync(new URL('review-page.html', import.meta.url), 'utf8')
  .replace('/*ROUND*/null', JSON.stringify({ ...ROUND, items }))
  .replace('<title>Looks review</title>', `<title>${ROUND.title}</title>`);
writeFileSync(new URL('index.html', out), page);
console.log(`wrote ${new URL('index.html', out).pathname} and ${items.length} pictures`);
