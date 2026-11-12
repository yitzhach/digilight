// Texture.tsx — panel section 3 (§8, Phase 4): switch Texture on (estimated relief, clearly
// labelled as a guess), its Depth and Shadows, and the expert relief settings. First switched on
// it starts at depth 0.003, shadows 0.4 (core RELIEF_START).

import { reliefShown } from '../relief.ts';
import { cmd, run, shown } from '../state.ts';
import { Slider } from './controls.tsx';
import { ExpertFields } from './Expert.tsx';

/** Depth 0 to 100 = relief.depth 0.02 (t / 100)^2 (§6). */
const toDepth = (t: number) => Math.round(0.02 * (t / 100) ** 2 * 1e6) / 1e6;
const fromDepth = (d: number) => 100 * Math.sqrt(d / 0.02);

export function Texture() {
  const r = shown.value!.relief, on = r.mode !== 'off';
  return (
    <section>
      <h2>Texture</h2>
      <label class="control switch" title="Let the light show the surface's relief">
        <input type="checkbox" checked={on} onChange={() => run(() => cmd.setRelief({ mode: on ? 'off' : 'estimated' }))} />
        <span>Texture (estimated)</span>
      </label>
      <p class="hint">Guessed from the photo's fine shading, so it can look embossed. Try it with a raking light.</p>
      {on && <>
        {!reliefShown.value && <p class="hint">Preparing the texture…</p>}
        <Slider path="relief.depth" label="Depth" help="How deep the relief is" min={0} max={100} step={1}
          toValue={toDepth} fromValue={fromDepth} format={(t) => String(Math.round(t))} />
        <Slider path="relief.shadows" label="Shadows" help="How strong the shadows the relief throws are" min={0} max={100} step={1}
          toValue={(t) => t / 100} fromValue={(v) => v * 100} format={(t) => String(Math.round(t))} />
        <ExpertFields prefixes={['relief.']} />
      </>}
    </section>
  );
}
