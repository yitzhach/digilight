// Stage.tsx — the picture: the WebGL preview filling its box, redrawn on demand (never per
// frame when nothing changes), and the handles over it (Handles.tsx).

import { effect, signal } from '@preact/signals';
import { neutralDoc } from 'core';
import { createPreview, type Preview } from 'gl';
import { useEffect, useRef } from 'preact/hooks';
import { before, kappa, live, photo, say, shown } from '../state.ts';
import { Handles } from './Handles.tsx';
import { createScale, SETTLE_MS } from './scale.ts';
import { previewZoom, type Geometry } from './view.ts';

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
    let p: Preview;
    try { p = createPreview(c); } catch (e) { say((e as Error).message, true); return; }
    stage.preview = p;
    let pending = 0;
    const frame = (t0: number) => {
      pending = 0;
      const held = live.value || settling;
      apply(p, held ? stage.scale.q : 1);
      p.draw();
      if (live.value) requestAnimationFrame((t1) => stage.scale.record(t1 - t0));
    };
    const request = () => { pending ||= requestAnimationFrame(frame); };

    const resize = () => {
      const r = el.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      c.width = Math.max(1, Math.round(r.width * dpr)); c.height = Math.max(1, Math.round(r.height * dpr));
      geo.value = { ...geo.value, w: r.width, h: r.height };
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let lastPhoto: unknown = null, wasLive = false;
    const stop = effect(() => {
      const ph = photo.value;
      if (ph && ph !== lastPhoto) {
        lastPhoto = ph;
        p.setPhoto(ph.image, ph.space);
        geo.value = { ...geo.value, aspect: ph.image.height / ph.image.width, zoom: 1, pan: [0.5, 0.5] };
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
    return () => { stop(); ro.disconnect(); cancelAnimationFrame(pending); };
  }, []);

  return (
    <div class="stage" ref={box}>
      <canvas ref={canvas} />
      {photo.value ? <Handles /> : <Empty />}
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
