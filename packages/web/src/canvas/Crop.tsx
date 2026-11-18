// Crop.tsx — Crop and straighten (Phase 6b item 1): the whole photo file with four corner
// handles, starting at the frame's corners (or the crop there is). Drag each onto a corner of
// the piece; while a corner moves, a loupe shows the photo's own pixels there. Done makes the
// crop (core's `crop`, one undo step); the picture is then made by the workers (state.ts).

import { signal } from '@preact/signals';
import { cropProblem, thumbnail, type Corners, type Image } from 'core';
import { useEffect, useRef, useState } from 'preact/hooks';
import { cmd, doc, photo, run } from '../state.ts';

/** The corners being placed, or null when not cropping. */
export const cropping = signal<Corners | null>(null);

const MARGIN = 28, LOUPE = 64, R = 9;
const HIT = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 22 : 13;
const LOST = 'Changing the crop turns off the measured texture: it was measured on the picture as it is. Use the side-lit photo again afterwards. Crop anyway?';

export function startCrop(): void {
  const d = doc.value, p = photo.value;
  if (!d || !p) return;
  const { width: w, height: h } = p.file;
  cropping.value = d.photo.crop?.corners.map(([x, y]) => [x, y]) as Corners ?? [[0, 0], [w, 0], [w, h], [0, h]];
}
export function finishCrop(): void {
  const c = cropping.value, d = doc.value;
  if (!c || !d) return;
  const same = JSON.stringify(c) === JSON.stringify(d.photo.crop?.corners ?? null);
  if (!same && d.relief.mode === 'measured' && !window.confirm(LOST)) return;
  cropping.value = null;
  if (!same) run(() => cmd.crop(c));
}

let shownFile: Image | null = null, small: Image | null = null;
/** The file at up to 1600 px for the screen, made once per photo. */
function smallOf(file: Image): Image {
  if (shownFile !== file) { small = thumbnail(file, 1600); shownFile = file; }
  return small!;
}

export function Crop() {
  const box = useRef<HTMLDivElement>(null), view = useRef<HTMLCanvasElement>(null), loupe = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 1, h: 1 }); // 1 x 1 until measured: no handles yet
  const [held, setHeld] = useState<number | null>(null);
  const c = cropping.value, p = photo.value;
  const file = p?.file;

  useEffect(() => {
    const el = box.current!, ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); setSize({ w: r.width, h: r.height }); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!file || !view.current) return;
    const s = smallOf(file), cv = view.current;
    cv.width = s.width; cv.height = s.height;
    cv.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(s.data), s.width, s.height), 0, 0);
  }, [file]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') cropping.value = null; else if (e.key === 'Enter') finishCrop(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  // The loupe: the file's own pixels round the held corner, three screen pixels each.
  useEffect(() => {
    if (held === null || !c || !file || !loupe.current) return;
    const [cx, cy] = c[held]!, n = LOUPE, x0 = Math.round(cx) - n / 2, y0 = Math.round(cy) - n / 2;
    const px = new Uint8ClampedArray(n * n * 4);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = x0 + i, y = y0 + j, q = (j * n + i) * 4;
      if (x < 0 || y < 0 || x >= file.width || y >= file.height) { px[q + 3] = 255; continue; }
      const s = (y * file.width + x) * 4;
      px[q] = file.data[s]!; px[q + 1] = file.data[s + 1]!; px[q + 2] = file.data[s + 2]!; px[q + 3] = 255;
    }
    loupe.current.getContext('2d')!.putImageData(new ImageData(px, n, n), 0, 0);
  });

  if (!c || !file) return null;
  const W = file.width, H = file.height;
  const sc = Math.max(1e-6, Math.min((size.w - 2 * MARGIN) / W, (size.h - 2 * MARGIN) / H));
  const ox = (size.w - W * sc) / 2, oy = (size.h - H * sc) / 2;
  const at = ([x, y]: [number, number]) => [ox + x * sc, oy + y * sc] as const;
  const why = cropProblem(c, W, H);

  const move = (e: PointerEvent) => {
    const i = held;
    if (i === null) return;
    const r = box.current!.getBoundingClientRect();
    const x = Math.min(W, Math.max(0, (e.clientX - r.left - ox) / sc)), y = Math.min(H, Math.max(0, (e.clientY - r.top - oy) / sc));
    const next = c.map((q) => [...q]) as Corners;
    next[i] = [Math.round(x * 2) / 2, Math.round(y * 2) / 2]; // half pixels: plain numbers in the document
    cropping.value = next;
  };
  const pts = c.map(at), poly = pts.map((q) => q.join(',')).join(' ');
  return (
    <div class="crop">
      <div class="crop-area" ref={box} onPointerMove={move} onPointerUp={() => setHeld(null)} onPointerCancel={() => setHeld(null)}>
      <canvas ref={view} class="crop-photo" style={{ left: `${ox}px`, top: `${oy}px`, width: `${W * sc}px`, height: `${H * sc}px` }} />
      {size.w > 1 && <svg class="crop-marks" width={size.w} height={size.h}>
        <path class="shade" fill-rule="evenodd" d={`M${ox},${oy}h${W * sc}v${H * sc}h${-W * sc}z M${poly.replace(/ /g, ' L')}z`} />
        <polygon class={why ? 'bad' : ''} points={poly} />
        {pts.map(([x, y], i) => (
          <g key={i} class="crop-corner" transform={`translate(${x},${y})`}
            onPointerDown={(e) => { e.preventDefault(); box.current!.setPointerCapture(e.pointerId); setHeld(i); }}>
            <circle class="hit" r={HIT} />
            <circle r={R} />
          </g>
        ))}
      </svg>}
      {held !== null && <div class={`loupe${pts[held]![0] < size.w / 2 ? ' right' : ''}`} aria-hidden="true"><canvas ref={loupe} width={LOUPE} height={LOUPE} /></div>}
      </div>
      <div class="crop-bar">
        <span class={why ? 'error' : ''}>{why ? `${why[0]!.toUpperCase()}${why.slice(1)}.` : 'Drag the four corners onto the corners of the piece.'}</span>
        <button onClick={() => (cropping.value = [[0, 0], [W, 0], [W, H], [0, H]])} title="Put the corners back on the photo's corners">Whole photo</button>
        <button onClick={() => (cropping.value = null)} title="Leave the crop as it was (Esc)">Cancel</button>
        <button class="primary" disabled={!!why} onClick={finishCrop} title="Crop and straighten the photo (Enter)">Done</button>
      </div>
    </div>
  );
}
