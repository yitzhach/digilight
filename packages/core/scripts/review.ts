// A review round for Isaac (phase gates): pictures of fixture photos as a page where he
// marks each picture and types or speaks a note. Notes are kept in the artifact's database
// (collection "notes"), so the next session reads them with ArtifactData.
//   node scripts/review.ts [door-flat-crop.jpg lintel-flat-crop.jpg ...]   -> out/review/
// Publish out/review/index.html with files img/* and capabilities {db: {}, dictation: {}}.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createCommands, type Image } from '../src/index.ts';
import { encodeJpeg, loadFixture } from './jpeg.ts';

// Rounds 1 to 3 (phase1-looks-*): every look. Round 4 (phase4-1): looks after D-033 and Texture.
// Round 6a-1 (phase6a-1): Phase 6a item 2, from D-047: Spotlight less flat on the lintel, Dramatic
// more contrast, by lights only (lower room light, a brighter, narrower lamp). Each as it is now,
// then two candidates; his pick goes into BUILD.md §6 and the goldens.
const ROUND = {
  id: 'phase6a-1', title: 'Spotlight and Dramatic review',
  about: 'You said Spotlight looks a little muted and flat on the lintel, and Dramatic wants more contrast. Each is shown as it is now, then A (a step darker room, a brighter, narrower lamp) and B (a further step). Pick one for each, or say what is still wrong.',
  generalHelp: 'Overall: which Spotlight and which Dramatic? Anything else about the looks?',
};
type Cand = { look: string; tag: string; amb?: number; lamp?: Record<string, number>; note: string };
const CANDS: Cand[] = [
  { look: 'spotlight', tag: 'now', note: 'As it is now: room light 0.35, lamp 0.6, cone 32°' },
  { look: 'spotlight', tag: 'A', amb: 0.25, lamp: { intensity: 0.75, cone: 28 }, note: 'A: room light 0.25, lamp 0.75, cone 28°' },
  { look: 'spotlight', tag: 'B', amb: 0.2, lamp: { intensity: 0.8, cone: 26 }, note: 'B: room light 0.2, lamp 0.8, cone 26°' },
  { look: 'dramatic', tag: 'now', note: 'As it is now: room light 0.25, lamp 0.55, cone 30°' },
  { look: 'dramatic', tag: 'A', amb: 0.1, lamp: { intensity: 0.8, cone: 24 }, note: 'A: room light 0.1, lamp 0.8, cone 24°' },
  { look: 'dramatic', tag: 'B', amb: 0.06, lamp: { intensity: 0.9, cone: 22 }, note: 'B: room light 0.06, lamp 0.9, cone 22°' },
];
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
const add = (id: string, piece: string, look: string, image: Image, note: string) => {
  const src = `img/${id}.jpg`;
  writeFileSync(new URL(src, out), encodeJpeg(image, 85));
  const before = prev[id] ? `<br>Last round: “${esc(prev[id])}”` : '';
  items.push({ id, piece, look, src, note: note + before });
};
for (const name of names) {
  const photo = loadFixture(name), c = createCommands(), piece = PIECE[name] ?? name.replace(/\.jpg$/, '');
  c.open(photo);
  for (const k of CANDS) {
    c.applyLook(k.look);
    if (k.amb !== undefined) c.set('ambient.level', k.amb);
    if (k.lamp) c.updateLight('light-1', k.lamp);
    const { image, metrics: m } = c.render({ width: 1000 }), label = c.looks().find((l) => l.id === k.look)!.label;
    add(`${piece.toLowerCase()}--${k.look}-${k.tag}`, piece, `${label} ${k.tag === 'now' ? '(now)' : k.tag}`, image, `${k.note}. Median brightness ${m.photo.p50.toFixed(0)} → ${m.render.p50.toFixed(0)}`);
    console.log(`${piece} ${k.look} ${k.tag}: kappa ${m.kappa.toFixed(2)}`);
  }
}
const page = readFileSync(new URL('review-page.html', import.meta.url), 'utf8')
  .replace('/*ROUND*/null', JSON.stringify({ ...ROUND, items }))
  .replace('<title>Looks review</title>', `<title>${ROUND.title}</title>`);
writeFileSync(new URL('index.html', out), page);
console.log(`wrote ${new URL('index.html', out).pathname} and ${items.length} pictures`);
