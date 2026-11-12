// TrueRelief.tsx — "Use a side-lit photo for real texture" (§8 section 3, BUILD.md Phase 5): one
// to three side-lit photos, lined up with progress shown; two previews, "Which looks right?";
// a dial per photo for its light's axis (re-measures the previews); Expert: elevation, or a
// lamp's place in cm and the piece's width.

import { useEffect, useRef } from 'preact/hooks';
import { expert } from '../state.ts';
import {
  addSidePhotos, choose, closeFlow, elevation, flowError, flowOpen, previews, progress, refreshPreviews, shots, widthCm, type Shot,
} from '../truerelief.ts';

function Picture({ data, width, height }: { data: Uint8ClampedArray; width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    c.width = width; c.height = height;
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
  }, [data, width, height]);
  return <canvas ref={ref} />;
}

const LAMP_START = { left: 30, above: 30, out: 60 };
const setShot = (k: number, s: Partial<Shot>) => { shots.value = shots.peek().map((x, j) => (j === k ? { ...x, ...s } : x)); void refreshPreviews(); };
const num = (e: Event) => Number((e.target as HTMLInputElement).value);

function ShotControls({ s, k, many }: { s: Shot; k: number; many: boolean }) {
  return (
    <div class="shot">
      {many && <p class="hint">{s.name}</p>}
      {!s.lamp && (
        <div class="control" title="Turn until the light's line in the previews matches the photo's">
          <label for={`dial-${k}`}>Light's direction<output>{Math.round(s.dial)}°</output></label>
          <input id={`dial-${k}`} type="range" min={0} max={180} step={1} value={s.dial} data-dial={k}
            onChange={(e) => setShot(k, { dial: num(e) })} />
        </div>
      )}
      {expert.value && <>
        <label class="control switch" title="The photo was taken from the tripod spot of the photo of the piece, lit by a lamp you measured">
          <input type="checkbox" checked={!!s.lamp} onChange={() => setShot(k, { lamp: s.lamp ? null : LAMP_START })} />
          <span>Lamp on a stand, placed in cm</span>
        </label>
        {s.lamp && (['left', 'above', 'out'] as const).map((key) => (
          <label key={key} class="control select" title={{ left: 'How far left of the left edge', above: 'How far above the top edge', out: 'How far out from the wall' }[key]}>
            <span>{{ left: 'Left of the piece (cm)', above: 'Above the piece (cm)', out: 'Out from the wall (cm)' }[key]}</span>
            <input type="number" step="any" value={s.lamp![key]} onChange={(e) => setShot(k, { lamp: { ...s.lamp!, [key]: num(e) } })} />
          </label>
        ))}
      </>}
    </div>
  );
}

export function TrueRelief() {
  const input = useRef<HTMLInputElement>(null);
  const pick = () => input.current!.click();
  const files = (
    <input ref={input} type="file" multiple hidden data-side-lit accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
      onChange={(e) => { const f = [...((e.target as HTMLInputElement).files ?? [])]; (e.target as HTMLInputElement).value = ''; if (f.length) void addSidePhotos(f); }} />
  );
  if (!flowOpen.value) return (
    <div class="true-relief">
      <button class="wide" onClick={pick} title="Measure the real surface from a photo of the piece lit from one side (sun or a lamp)">
        Use a side-lit photo for real texture
      </button>
      <p class="hint">One to three photos of the piece in light from one side. Handheld is fine.</p>
      {files}
    </div>
  );
  const pr = progress.value, pv = previews.value, err = flowError.value, list = shots.value, busy = pr !== null;
  const anyLamp = list.some((s) => s.lamp);
  return (
    <div class="true-relief open">
      {files}
      {pr && <div class="progress"><span>{pr.text}</span><progress max={1} value={pr.frac} /></div>}
      {err && <p class="error">{err}</p>}
      {pv && !busy && <>
        <p><strong>{pv.b ? 'Which looks right?' : 'Does this look right?'}</strong></p>
        <p class="hint">Pick the one where raised parts look raised.</p>
        <div class="choices">
          <button class="choice" data-choice="a" onClick={() => void choose('a')} title="Use this one"><Picture data={pv.a} width={pv.width} height={pv.height} /></button>
          {pv.b && <button class="choice" data-choice="b" onClick={() => void choose('b')} title="Use this one"><Picture data={pv.b} width={pv.width} height={pv.height} /></button>}
        </div>
      </>}
      {list.length > 0 && !busy && <>
        {list.map((s, k) => <ShotControls key={k} s={s} k={k} many={list.length > 1} />)}
        {expert.value && <>
          <div class="control" title="How high the sun (or the light) stood above the piece's face">
            <label for="tr-elevation">Light's height<output>{elevation.value}°</output></label>
            <input id="tr-elevation" type="range" min={3} max={60} step={1} value={elevation.value}
              onChange={(e) => { elevation.value = num(e); void refreshPreviews(); }} />
          </div>
          {anyLamp && (
            <label class="control select" title="The piece's width, for a lamp placed in cm">
              <span>Width of the piece (cm)</span>
              <input type="number" step="any" min={1} value={widthCm.value ?? ''} onChange={(e) => { widthCm.value = num(e) || null; void refreshPreviews(); }} />
            </label>
          )}
        </>}
      </>}
      {!busy && (
        <div class="row">
          {list.length > 0 && list.length < 3 && <button onClick={pick} title="Another photo lit from another side measures the surface better">Add another</button>}
          <button onClick={closeFlow}>Cancel</button>
        </div>
      )}
    </div>
  );
}
