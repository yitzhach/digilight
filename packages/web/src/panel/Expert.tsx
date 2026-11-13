// Expert.tsx — the expert settings of one part of the document, generated from describe()
// (§3, §8): a slider, a switch or a select by type. Nothing here is written per setting.

import { describe } from 'core';
import { expert, shown } from '../state.ts';
import { Select, Slider, Switch } from './controls.tsx';

const WORDS: Record<string, string> = { lamp: 'Lamp', sun: 'Sunlight', off: 'Off', estimated: 'Estimated', measured: 'Measured' };

// Settings that mean nothing for a light of the other kind (§6: azimuth and elevation are sun only).
const NOT_FOR = { lamp: /^lights\.\d+\.(azimuth|elevation)$/, sun: /^lights\.\d+\.(cone|edge|falloff)$/ };

/** Every expert setting whose path starts with one of `prefixes`. */
export function ExpertFields({ prefixes }: { prefixes: string[] }) {
  if (!expert.value) return null;
  const d = shown.value!;
  const kindOf = (path: string) => d.lights[Number(path.split('.')[1])]?.kind;
  const list = describe(d).filter((s) => s.tier === 'expert' && prefixes.some((p) => s.path.startsWith(p))
    && !(s.path.startsWith('lights.') && NOT_FOR[kindOf(s.path) ?? 'lamp'].test(s.path)));
  if (!list.length) return null;
  return (
    <div class="expert">
      {list.map((s) => {
        if (s.type === 'number') return <Slider key={s.path} path={s.path} label={s.label} help={s.help} min={s.min!} max={s.max!} step={s.step!} />;
        if (s.type === 'boolean') return <Switch key={s.path} path={s.path} label={s.label} help={s.help} />;
        if (s.type === 'enum') return <Select key={s.path} path={s.path} label={s.label} help={s.help} options={s.options!} names={WORDS} />;
        return null; // the curve: set by agents and presets, no editor (D-049, §8)
      })}
    </div>
  );
}
