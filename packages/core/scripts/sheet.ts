// Contact sheet of every look on fixture photos (Phase 1 gate), as one HTML page each:
//   node scripts/sheet.ts [door-flat-crop.jpg lintel-flat-crop.jpg ...]   -> out/sheet-<name>.html

import { mkdirSync, writeFileSync } from 'node:fs';
import { createCommands, render } from '../src/index.ts';
import { encodeJpeg, loadFixture } from './jpeg.ts';

const names = process.argv.slice(2).length ? process.argv.slice(2) : ['door-flat-crop.jpg', 'lintel-flat-crop.jpg'];
const outDir = new URL('../out/', import.meta.url);
mkdirSync(outDir, { recursive: true });

for (const name of names) {
  const photo = loadFixture(name), c = createCommands();
  c.open(photo);
  const tiles: string[] = [];
  for (const look of c.looks()) {
    c.applyLook(look.id);
    const t = performance.now();
    render(photo, c.getDoc());                  // full size, guard included: timed
    const ms = performance.now() - t;
    const { image, metrics: m } = c.render({ width: 600 });
    const src = `data:image/jpeg;base64,${encodeJpeg(image).toString('base64')}`;
    const note = `kappa ${m.kappa.toFixed(2)} · median ${m.photo.p50.toFixed(0)} → ${m.render.p50.toFixed(0)} · full size ${ms.toFixed(0)} ms`;
    tiles.push(`<figure><img src="${src}" alt="${look.label}"><figcaption><b>${look.label}</b><br>${note}${m.warnings.length ? `<br><i>${m.warnings.join('<br>')}</i>` : ''}</figcaption></figure>`);
    console.log(`${name} ${look.id.padEnd(14)} ${note}`);
  }
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DigiLight 2 looks: ${name}</title>
<style>:root{color-scheme:light dark}body{font:14px system-ui,sans-serif;margin:16px;background:#f4f4f2;color:#222}
@media (prefers-color-scheme:dark){body{background:#1c1c1c;color:#ddd}}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}figure{margin:0}
img{width:100%;display:block;border-radius:4px}figcaption{padding:6px 0;line-height:1.4}i{color:#b35c00}</style>
<h1>Every look on ${name}</h1><p>Reference renderer (Phase 1), light only, no texture. Shown at 600 px wide.</p>
<main>${tiles.join('\n')}</main>`;
  const file = new URL(`sheet-${name.replace(/\.jpg$/, '')}.html`, outDir);
  writeFileSync(file, html);
  console.log(`wrote ${file.pathname}`);
}
