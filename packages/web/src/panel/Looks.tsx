// Looks.tsx — panel section 1 (§8): a live thumbnail of this photo under each look (the
// reference renderer at 160 px, in a worker), tap to apply; Strength and Flip.

import { computed, effect, signal } from '@preact/signals';
import { LOOKS, withLook, type Image } from 'core';
import { useEffect, useRef } from 'preact/hooks';
import { imageData } from '../io/colour.ts';
import { cmd, doc, look, photo, preview, run } from '../state.ts';
import { lookThumbs } from '../workers/pool.ts';

export const THUMB = 160;
export const thumbs = signal<Record<string, Image>>({});
/** Resolves when every thumbnail of the latest request is in (for the bench page). */
export let thumbsReady: Promise<unknown> = Promise.resolve();

let generation = 0;
const flipped = computed(() => look.value.flip);
// The photo, once the document is for it: changes only when a photo is opened.
const opened = computed(() => { const p = photo.value, d = doc.value; return p && d && d.photo.sha256 === p.sha256 ? p : null; });
effect(() => {
  const p = opened.value, flip = flipped.value, d = doc.peek();
  if (!p || !d) return;
  const gen = ++generation;
  thumbs.value = {};
  thumbsReady = lookThumbs(d, THUMB, flip, (id, img) => {
    if (gen === generation) thumbs.value = { ...thumbs.value, [id]: img };
  });
});

function Thumb({ img }: { img?: Image }) {
  const c = useRef<HTMLCanvasElement>(null);
  const space = photo.value?.space ?? 'srgb';
  useEffect(() => {
    if (!img || !c.current) return;
    c.current.width = img.width; c.current.height = img.height;
    c.current.getContext('2d', { colorSpace: space })!.putImageData(imageData(new Uint8ClampedArray(img.data), img.width, img.height, space), 0, 0);
  }, [img, space]);
  return <canvas ref={c} class={img ? '' : 'loading'} />;
}

export function Looks() {
  const l = look.value;
  const apply = (id: string, strength = l.strength, flip = l.flip) => {
    look.value = { id, strength, flip };
    run(() => cmd.applyLook(id, { strength, flip }));
  };
  return (
    <section>
      <h2>Looks</h2>
      <div class="looks">
        {LOOKS.map((k) => (
          <button key={k.id} class={`look${k.id === l.id ? ' current' : ''}`} data-look={k.id} onClick={() => apply(k.id)} title={`Light it as ${k.label.toLowerCase()}`}>
            <Thumb img={thumbs.value[k.id]} />
            <span>{k.label}</span>
          </button>
        ))}
      </div>
      <div class="control" title="How strongly the look replaces the photo's own light">
        <label for="look-strength">Strength<output>{Math.round(l.strength * 100)}%</output></label>
        <input id="look-strength" type="range" min={0} max={100} step={1} value={Math.round(l.strength * 100)}
          onInput={(e) => preview(withLook(doc.value!, l.id, { strength: Number((e.target as HTMLInputElement).value) / 100, flip: l.flip }))}
          onChange={(e) => apply(l.id, Number((e.target as HTMLInputElement).value) / 100)} />
      </div>
      <label class="control switch" title="Mirror the lights left to right">
        <input type="checkbox" checked={l.flip} onChange={() => apply(l.id, l.strength, !l.flip)} />
        <span>Flip</span>
      </label>
    </section>
  );
}
