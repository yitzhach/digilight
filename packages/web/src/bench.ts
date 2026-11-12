// bench.ts — the ?bench page (§9): runs the speed budgets on the loaded photo and prints a table
// to paste back.

import { withLook } from 'core';
import { stage } from './canvas/Stage.tsx';
import { exportPicture } from './io/export.ts';
import { thumbsReady } from './panel/Looks.tsx';
import { reliefShown, reliefTiming } from './relief.ts';
import { cmd, doc, openFile, photo, preview, run } from './state.ts';
import { kappaFor } from './workers/pool.ts';

const frame = () => new Promise<number>((r) => requestAnimationFrame(r));
const ms = (t: number) => `${Math.round(t)} ms`;

interface Row { moment: string; budget: string; result: string; ok: boolean | null }

/** Moves a light round a circle for 120 frames; frames a second over the last 100. */
async function drag(id: string): Promise<number> {
  const base = doc.value!, N = 120, times: number[] = [];
  let last = await frame();
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    preview({ ...base, lights: base.lights.map((l) => (l.id === id ? { ...l, pos: [0.5 + 0.6 * Math.cos(a), 0.5 + 0.6 * Math.sin(a), l.pos[2]] } : l)) });
    const now = await frame();
    times.push(now - last); last = now;
  }
  const steady = times.slice(20);
  return 1000 / (steady.reduce((s, x) => s + x, 0) / steady.length);
}

async function measure(log: (s: string) => void): Promise<Row[]> {
  const p = photo.value;
  if (!p) throw new Error('Open a photo first (a 24-megapixel one for the real budgets).');
  const rows: Row[] = [];
  log('Opening the photo again…');
  let t = performance.now();
  await openFile(p.blob, p.name);
  stage.drawSync(1);
  const open = performance.now() - t;
  rows.push({ moment: 'photo opened to first sharp picture', budget: '1.5 s', result: ms(open), ok: open <= 1500 });
  t = performance.now();
  await thumbsReady;
  const th = performance.now() - t;
  rows.push({ moment: 'look thumbnails filled', budget: '1 s more', result: ms(th), ok: th <= 1000 });

  log('Dragging a light…');
  run(() => cmd.setDoc(withLook(doc.value!, 'gallery')));
  const id = doc.value!.lights[0]!.id;
  const fps = await drag(id);
  rows.push({ moment: 'dragging a light, texture off', budget: '30 fps', result: `${fps.toFixed(0)} fps (scale ${stage.scale.q})`, ok: fps >= 30 });

  t = performance.now();
  run(() => cmd.updateLight(id, { pos: [0.3, -0.3, doc.value!.lights[0]!.pos[2]] }));
  stage.drawSync(1);
  const rel = performance.now() - t;
  rows.push({ moment: 'pointer released to full-resolution frame', budget: '150 ms', result: ms(rel), ok: rel <= 150 });
  t = performance.now();
  await kappaFor(doc.value!);
  rows.push({ moment: '  then protect whites updated (in a worker)', budget: '', result: ms(performance.now() - t), ok: null });

  log('Exporting at full size…');
  t = performance.now();
  await exportPicture(photo.value!, doc.value!, { format: 'jpeg' });
  const ex = performance.now() - t;
  rows.push({ moment: 'export at full size, lights only', budget: '8 s', result: ms(ex), ok: ex <= 8000 });

  log('Switching Texture on…');
  run(() => cmd.applyLook('raking-left'));
  t = performance.now();
  run(() => cmd.setRelief({ mode: 'estimated' }));
  let longest = 0, last = await frame();
  while (!reliefShown.value) { const now = await frame(); longest = Math.max(longest, now - last); last = now; }
  const on = performance.now() - t;
  rows.push({ moment: 'texture switched on to maps ready', budget: '3 s', result: ms(on), ok: on <= 3000 });
  rows.push({ moment: '  of which estimate and pyramid (workers)', budget: '', result: ms(reliefTiming.value?.height ?? 0), ok: null });
  rows.push({ moment: '  longest frame meanwhile', budget: '100 ms', result: ms(longest), ok: longest <= 100 });

  log('Dragging a light with Texture on…');
  const fpsT = await drag(doc.value!.lights[0]!.id);
  rows.push({ moment: 'dragging a light, texture on', budget: '20 fps', result: `${fpsT.toFixed(0)} fps (scale ${stage.scale.q})`, ok: fpsT >= 20 });

  log('Exporting with Texture…');
  t = performance.now();
  await exportPicture(photo.value!, doc.value!, { format: 'jpeg' });
  const exT = performance.now() - t;
  rows.push({ moment: 'export at full size, with texture', budget: '20 s', result: ms(exT), ok: exT <= 20000 });
  const cpu = reliefTiming.value?.cpu;
  rows.push({ moment: '  of which the export\'s maps (workers, from switch-on)', budget: '', result: cpu ? ms(cpu) : '?', ok: null });

  // The built app's scripts (in /assets/), compressed size as sent (not what the cache says);
  // the dev server serves no such files.
  // Each script once: the render workers all load the same file.
  const seen = new Map<string, number>();
  for (const e of performance.getEntriesByType('resource') as PerformanceResourceTiming[])
    if (/\/assets\/.*\.js$/.test(e.name) && !/libheif/.test(e.name)) seen.set(e.name, Math.max(seen.get(e.name) ?? 0, e.encodedBodySize));
  const js = [...seen.values()].reduce((s, v) => s + v, 0);
  rows.push({ moment: 'JavaScript shipped (compressed, without HEIC)', budget: '250 KB', result: js ? `${Math.round(js / 1024)} KB` : 'built app only', ok: js ? js <= 250 * 1024 : null });
  return rows;
}

function device(): string {
  const c = document.createElement('canvas').getContext('webgl2');
  const ext = c?.getExtension('WEBGL_debug_renderer_info');
  const gpu = c && ext ? String(c.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown GPU';
  const p = photo.value?.image;
  return `${navigator.userAgent}\nGPU: ${gpu}; ${navigator.hardwareConcurrency} cores; workers shared: ${globalThis.crossOriginIsolated}\n`
    + `Photo: ${p ? `${p.width} x ${p.height} (${((p.width * p.height) / 1e6).toFixed(1)} MP)` : 'none'}; screen ${screen.width} x ${screen.height} @${devicePixelRatio}x`;
}

export function mountBench(): void {
  const box = document.createElement('div');
  box.className = 'bench';
  box.innerHTML = '<strong>Bench</strong> <button>Run</button><pre>Open a photo, then Run. Copy the table into the chat.</pre>';
  document.body.append(box);
  const pre = box.querySelector('pre')!, btn = box.querySelector('button')!;
  btn.onclick = async () => {
    btn.disabled = true;
    try {
      const rows = await measure((s) => (pre.textContent = s));
      const w = Math.max(...rows.map((r) => r.moment.length));
      pre.textContent = `${device()}\n\n${'moment'.padEnd(w)} | budget   | result\n${rows.map((r) =>
        `${r.moment.padEnd(w)} | ${r.budget.padEnd(8)} | ${r.result}${r.ok === null ? '' : r.ok ? '  ok' : '  OVER'}`).join('\n')}`;
    } catch (e) { pre.textContent = (e as Error).message; }
    btn.disabled = false;
  };
}
