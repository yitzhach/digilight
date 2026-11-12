// Texture.tsx — panel section 3 (§8): switch Texture on, its Depth and Shadows, the expert relief
// settings, and True Relief (Phase 5). With a measured height the switch uses it; without, the
// estimate (experimental after review round 4, D-047). First switched on it starts at depth
// 0.003, shadows 0.4 (core RELIEF_START); a measurement sets Depth from itself.

import { reliefShown } from '../relief.ts';
import { cmd, run, shown } from '../state.ts';
import { Slider } from './controls.tsx';
import { ExpertFields } from './Expert.tsx';
import { TrueRelief } from './TrueRelief.tsx';

/** Depth 0 to 100 = relief.depth 0.02 (t / 100)^2 (§6). */
const toDepth = (t: number) => Math.round(0.02 * (t / 100) ** 2 * 1e6) / 1e6;
const fromDepth = (d: number) => 100 * Math.sqrt(d / 0.02);

export function Texture() {
  const r = shown.value!.relief, on = r.mode !== 'off', measured = cmd.getMeasured() !== null;
  return (
    <section>
      <h2>Texture</h2>
      <label class="control switch" title="Let the light show the surface's relief">
        <input type="checkbox" checked={on} onChange={() => run(() => cmd.setRelief({ mode: on ? 'off' : measured ? 'measured' : 'estimated' }))} />
        <span>Texture</span>
      </label>
      <p class="hint" data-texture-status>
        {r.mode === 'measured' ? 'Measured from your side-lit photo.'
          : measured ? 'Measured from your side-lit photo (switched off).'
          : 'Estimated from this photo (experimental): it can look gritty. A side-lit photo gives the real surface.'}
      </p>
      {on && <>
        {!reliefShown.value && <p class="hint">Preparing the texture…</p>}
        <Slider path="relief.depth" label="Depth" help="How deep the relief is" min={0} max={100} step={1}
          toValue={toDepth} fromValue={fromDepth} format={(t) => String(Math.round(t))} />
        <Slider path="relief.shadows" label="Shadows" help="How strong the shadows the relief throws are" min={0} max={100} step={1}
          toValue={(t) => t / 100} fromValue={(v) => v * 100} format={(t) => String(Math.round(t))} />
        <ExpertFields prefixes={['relief.']} />
      </>}
      <TrueRelief />
    </section>
  );
}
