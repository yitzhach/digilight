// Finish.tsx — panel section 4 (§8, §5.9): Brightness, Contrast, Warmth, Saturation, Vignette,
// then the expert finish settings (Grain; the curve is set by agents and presets only, D-049).
// Each slider shows -100 to 100 (Vignette 0 to 100); Brightness is ±2 stops.

import { Slider } from './controls.tsx';
import { ExpertFields } from './Expert.tsx';

const signed = (t: number) => (t > 0 ? `+${Math.round(t)}` : String(Math.round(t)));
const R = { min: -100, max: 100, step: 1, toValue: (t: number) => t / 100, fromValue: (v: number) => v * 100, format: signed };

export function Finish() {
  return (
    <section>
      <h2>Finish</h2>
      <Slider path="finish.exposure" label="Brightness" help="Brighter or darker overall; the whites stay protected" {...R}
        toValue={(t) => t / 50} fromValue={(v) => v * 50} />
      <Slider path="finish.contrast" label="Contrast" help="More or less difference between light and dark" {...R} />
      <Slider path="finish.warmth" label="Warmth" help="Warmer or cooler overall" {...R} />
      <Slider path="finish.saturation" label="Saturation" help="More or less colour" {...R} />
      <Slider path="finish.vignette" label="Vignette" help="Darken the corners" {...R} min={0} format={(t) => String(Math.round(t))} />
      <ExpertFields prefixes={['finish.']} />
    </section>
  );
}
