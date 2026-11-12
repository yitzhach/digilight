// relief-gate.ts — Phase 5's gate (BUILD.md §10), on Isaac's fixture photos:
//   1. door and lintel: relief measured from the one sunlit photo, relit by a sun-like light,
//      scored against that real photo (shade corr, mid and broad; relief-score.ts);
//   2. the same with the light's axis read by the app (axis.ts) and the right end picked;
//   3. DSC_8382's three lamp shots: each predicted from the other two.
//
//     node bench/relief-gate.ts            (about two minutes; exits 1 if a row fails)

import { axisDistance, measuredRelief, measureFromPhotos, neutralDoc, parseDoc, render, type Image, type SidePhoto } from '../packages/core/src/index.ts';
import { loadFixture } from '../packages/core/scripts/jpeg.ts';
import { reference, score } from './relief-score.ts';

const IN = 2.54;
const PIECES = [
  { name: 'door', flat: 'door-flat-crop.jpg', sun: 'door-sun.jpg', lined: 'door-sun-lined.jpg', az: 135, el: 30 },
  { name: 'lintel', flat: 'lintel-flat-crop.jpg', sun: 'lintel-sun.jpg', lined: 'lintel-sun-lined.jpg', az: 47, el: 10.3 },
];
const rows: { what: string; result: string; need: string; ok: boolean }[] = [];
const f2 = (v: number) => v.toFixed(2);

/** The photo relit by a sun from (az, el) on the measured relief: the reference renderer. */
function sunlit(photo: Image & { sha256: string }, m: ReturnType<typeof measureFromPhotos>, az: number, el: number): Image {
  const base = neutralDoc({ width: photo.width, height: photo.height, space: 'srgb', sha256: photo.sha256 });
  const doc = parseDoc({
    ...base, ambient: { level: 0.1, kelvin: 6500 },
    lights: [{ id: 'sun', kind: 'sun', azimuth: az, elevation: el, intensity: 1, kelvin: 6500, size: 0.01 }],
    relief: { ...base.relief, mode: 'measured', depth: Math.min(0.03, m.depth), shadows: 1 },
  });
  return render(photo, doc, { relief: measuredRelief(m.height) });
}

for (const p of PIECES) {
  const flat = loadFixture(p.flat), sun = loadFixture(p.sun), ref = reference(flat, loadFixture(p.lined));
  const run = (label: string, side: SidePhoto, az: number, el: number, mid: number, broad: number) => {
    const t = Date.now(), m = measureFromPhotos(flat, [side]), s = score(ref, sunlit(flat, m, az, el)).shadeCorr;
    rows.push({ what: `${p.name}: ${label}`, result: `mid ${f2(s[1]!)}, broad ${f2(s[2]!)}  (fine ${f2(s[0]!)}, forms ${f2(s[3]!)}; depth ${(m.depth * 100).toFixed(2)}% of the width; ${((Date.now() - t) / 1000).toFixed(0)} s)`, need: `${f2(mid)} / ${f2(broad)}`, ok: s[1]! >= mid && s[2]! >= broad });
    return m;
  };
  // 1. The documented direction; the app lines the raw handheld photo up itself.
  run(`sun ${p.az} / ${p.el} as documented`, { image: sun, from: p.az, elevation: p.el }, p.az, p.el, 0.45, 0.5);
  // 2. The app's own axis (default elevation), the end nearer the truth picked, lit as measured.
  const guess = measureFromPhotos(flat, [{ image: sun }]).photos[0]!.axis.axisDeg;
  const end = axisDistance(guess, p.az) === Math.abs(guess - p.az) % 360 || Math.abs(guess - p.az) < 90 ? guess : guess + 180;
  rows.push({ what: `${p.name}: light's axis read from the pair`, result: `${guess.toFixed(1)} (true ${p.az}; ${axisDistance(guess, p.az).toFixed(1)} off)`, need: 'within 20', ok: axisDistance(guess, p.az) <= 20 });
  run(`app's own axis ${end.toFixed(0)} / 20, right end`, { image: sun, from: end }, p.az, p.el, 0.4, 0.45);
}

{
  const even = loadFixture('dsc8382/DSC_8382.jpg'), lamps = [[9.39, 9, 6.5], [-2.8, 9.75, 5.75], [22.41, 9.5, 6]] as const;
  const photos = ['DSC_8379', 'DSC_8380', 'DSC_8381'].map((n, i): SidePhoto => ({ image: loadFixture(`dsc8382/${n}.jpg`), lamp: { left: lamps[i]![0] * IN, above: lamps[i]![1] * IN, out: lamps[i]![2] * IN } }));
  const m = measureFromPhotos(even, photos, { widthCm: 48.26 });
  rows.push({ what: 'DSC_8382: each lamp shot predicted from the other two', result: m.check!.map(f2).join(', '), need: '0.70 each', ok: m.check!.every((c) => c >= 0.7) });
  const truth = [90, 123, 55];
  m.photos.forEach((ph, i) => rows.push({ what: `DSC_8382 shot ${i + 1}: light's axis read from the pair`, result: `${ph.axis.axisDeg.toFixed(1)} (true ${truth[i]}; ${axisDistance(ph.axis.axisDeg, truth[i]!).toFixed(1)} off)`, need: 'within 20', ok: axisDistance(ph.axis.axisDeg, truth[i]!) <= 20 }));
}

const w = Math.max(...rows.map((r) => r.what.length));
console.log(`${'check'.padEnd(w)} | needs       | result`);
for (const r of rows) console.log(`${r.what.padEnd(w)} | ${r.need.padEnd(11)} | ${r.result}  ${r.ok ? 'ok' : 'FAIL'}`);
process.exit(rows.every((r) => r.ok) ? 0 : 1);
