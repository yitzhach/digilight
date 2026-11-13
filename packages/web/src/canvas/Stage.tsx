// Stage.tsx — the picture: the WebGL preview filling its box, redrawn on demand (never per
// frame when nothing changes), and the handles over it (Handles.tsx).

import { effect, signal } from '@preact/signals';
import { neutralDoc } from 'core';
import { createPreview, type Preview } from 'gl';
import { useEffect, useRef } from 'preact/hooks';
import { gpuReady, reliefInput } from '../relief.ts';
import { before, kappa, live, photo, say, shown } from '../state.ts';
import { Handles } from './Handles.tsx';
import { createScale, SETTLE_MS } from './scale.ts';
import { clampPan, minZoom, previewZoom, type Geometry } from './view.ts';
import { Zoom } from './Zoom.tsx';

export const geo = signal<Geometry>({ w: 1, h: 1, aspect: 1, zoom: 1, pan: [0.5, 0.5] });

/** For the bench page: the preview and a way to draw now and wait for the GPU. */
export const stage = {
  preview: null as Preview | null,
  scale: createScale(),
  /** Draws the current state at scale q and waits until the GPU has finished it. */
  drawSync(q = 1): void {
    const p = stage.preview;
    if (!p) return;
    apply(p, q);
    p.draw();
    p.sync();
  },
};

let settling = false, settleTimer = 0;

function apply(p: Preview, q: number): void {
  const d = shown.value, g = geo.value;
  if (!d) return;
  p.setDoc(before.value ? neutralDoc(d.photo) : d, { kappa: before.value ? 1 : kappa.value });
  p.setView({ zoom: previewZoom(g), pan: g.pan });
  p.setScale(q);
}

export function Stage() {
  const box = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvas.current!, el = box.current!;
    let p: Preview | null = null, pending = 0, lastPhoto: unknown = null, shownPhoto: unknown = null, lastInput: unknown = null, wasLive = false;
    /** Bumped when a lost WebGL context comes back: the photo and maps go up again. */
    const restored = signal(0);
    try { p = stage.preview = createPreview(c); } catch (e) { say((e as Error).message, true); return; }
    const frame = (t0: number) => {
      pending = 0;
      if (!p) return;
      const held = live.value || settling;
      apply(p, held ? stage.scale.q : 1);
      p.draw();
      if (live.value) requestAnimationFrame((t1) => stage.scale.record(t1 - t0));
    };
    const request = () => { if (p) pending ||= requestAnimationFrame(frame); };

    const resize = () => {
      const r = el.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      c.width = Math.max(1, Math.round(r.width * dpr)); c.height = Math.max(1, Math.round(r.height * dpr));
      const g = { ...geo.value, w: r.width, h: r.height };
      geo.value = clampPan({ ...g, zoom: Math.max(g.zoom, minZoom(g)) });
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    // A phone can take the GPU away from a sleeping tab: rebuild the preview when it comes back.
    const lost = (e: Event) => { e.preventDefault(); p = stage.preview = null; cancelAnimationFrame(pending); pending = 0; };
    const back = () => {
      try { p = stage.preview = createPreview(c); } catch (e) { say(`The picture could not be redrawn: ${(e as Error).message}. Reload the page.`, true); return; }
      lastPhoto = null; lastInput = null;
      restored.value++;
    };
    c.addEventListener('webglcontextlost', lost);
    c.addEventListener('webglcontextrestored', back);

    const stop = effect(() => {
      void restored.value;
      const ph = photo.value;
      if (p && ph && ph !== lastPhoto) {
        // A new photo starts fitted; the same photo after a lost context keeps its zoom.
        if (ph !== shownPhoto) geo.value = { ...geo.peek(), aspect: ph.image.height / ph.image.width, zoom: 1, pan: [0.5, 0.5] };
        lastPhoto = shownPhoto = ph;
        p.setPhoto(ph.image, ph.space);
      }
      // Read every signal the picture depends on, so any change redraws it.
      void shown.value; void before.value; void kappa.value; void geo.value;
      const isLive = live.value;
      if (wasLive && !isLive) {
        settling = true;
        clearTimeout(settleTimer);
        settleTimer = window.setTimeout(() => { settling = false; request(); }, SETTLE_MS);
      }
      wasLive = isLive;
      if (ph) request();
    });
    // Texture's maps on the GPU, two directions a frame, then shown (§9: no frame over 100 ms).
    const stopRelief = effect(() => {
      void restored.value;
      const r = reliefInput.value, q = p;
      if (!q || r === lastInput) return;
      lastInput = r;
      if (!r) { q.setRelief(null); return; }
      void q.buildRelief(r.height, r.inp, () => new Promise((res) => requestAnimationFrame(res)), () => r.tmax)
        .then((ok) => { if (ok && q === p) { gpuReady(); request(); } })
        .catch((e: Error) => { if (q === p) say(`Texture could not be shown: ${e.message}`, true); });
    });
    return () => {
      stop(); stopRelief(); ro.disconnect(); cancelAnimationFrame(pending);
      c.removeEventListener('webglcontextlost', lost); c.removeEventListener('webglcontextrestored', back);
    };
  }, []);

  return (
    <div class="stage" ref={box}>
      <canvas ref={canvas} />
      {photo.value ? <><Handles /><Zoom /></> : <Empty />}
    </div>
  );
}

function Empty() {
  return (
    <div class="empty">
      <p><strong>Open a photo of your artwork</strong></p>
      <p>Drop it here, paste it, or use Open. JPEG, PNG, WebP or HEIC, taken straight on in flat light.</p>
    </div>
  );
}
