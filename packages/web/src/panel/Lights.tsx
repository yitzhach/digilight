// Lights.tsx — panel section 2 (§8): a chip per light and "+ Add light" (up to 4; 8 with expert
// controls), the selected light's Brightness, Warmth, Spread and Angle, then Room light.
// Simple sliders map to the document as §6 says.

import { cmd, expert, run, selected, shown } from '../state.ts';
import { Slider } from './controls.tsx';
import { ExpertFields } from './Expert.tsx';

const Z0 = 0.05, Z1 = 1.5;
/** Angle 0 (raking) to 100 (front) = pos.z 0.05 to 1.5 on a log scale. */
const angleToZ = (t: number) => Math.round(Z0 * (Z1 / Z0) ** (t / 100) * 1000) / 1000;
const zToAngle = (z: number) => (100 * Math.log(z / Z0)) / Math.log(Z1 / Z0);

export function Lights() {
  const d = shown.value!, i = d.lights.findIndex((l) => l.id === selected.value), l = d.lights[i];
  const max = expert.value ? 8 : 4, p = `lights.${i}.`;
  const add = () => {
    const next = run(() => cmd.addLight());
    if (next) selected.value = next.lights[next.lights.length - 1]!.id;
  };
  return (
    <section>
      <h2>Lights</h2>
      <div class="chips">
        {d.lights.map((k, j) => (
          <button key={k.id} class={`chip${k.id === selected.value ? ' current' : ''}${k.on ? '' : ' off'}`} onClick={() => (selected.value = k.id)}
            title={k.on ? 'Select this light' : 'Select this light (switched off)'}>Light {j + 1}</button>
        ))}
        {d.lights.length < max && <button class="chip add" onClick={add} title="Add a lamp above the picture">+ Add light</button>}
      </div>
      {l && (
        <div class="light">
          <Slider path={`${p}intensity`} label="Brightness" help="How much light this lamp adds" min={0} max={200} step={1}
            toValue={(t) => t / 100} fromValue={(v) => v * 100} format={(t) => `${Math.round(t)}%`} />
          <Slider path={`${p}kelvin`} label="Warmth" help="Warmer like a candle or tungsten bulb, or cooler like shade" min={0} max={100} step={1}
            toValue={(t) => Math.round(9000 - 70 * t)} fromValue={(v) => (9000 - v) / 70} format={(t) => String(Math.round(t))} />
          {l.kind === 'lamp' && <>
            <Slider path={`${p}cone`} label="Spread" help="Narrow for a spotlight, wide for a lamp that lights everything" min={0} max={100} step={1}
              toValue={(t) => Math.round((12 + 0.78 * t) * 10) / 10} fromValue={(v) => (v - 12) / 0.78} format={(t) => String(Math.round(t))} />
            <Slider path={`${p}pos.2`} label="Angle" help="Low rakes across the surface; high lights it from the front" min={0} max={100} step={1}
              toValue={angleToZ} fromValue={zToAngle} format={(t) => String(Math.round(t))} />
          </>}
          <div class="row">
            <button onClick={() => run(() => cmd.updateLight(l.id, { on: !l.on }))} title="Switch this light off or on">{l.on ? 'Switch off' : 'Switch on'}</button>
            <button onClick={() => run(() => cmd.removeLight(l.id))} title="Remove this light (Delete)">Remove</button>
          </div>
          <ExpertFields prefixes={[p]} />
        </div>
      )}
      <Slider path="ambient.level" label="Room light" help="How much of the light in the photo stays" min={0} max={200} step={1}
        toValue={(t) => t / 100} fromValue={(v) => v * 100} format={(t) => `${Math.round(t)}%`} />
      <ExpertFields prefixes={['ambient.', 'tone.']} />
    </section>
  );
}
