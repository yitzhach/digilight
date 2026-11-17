// tools/gel.ts — tool:gel, a colour filter on a light (BUILD.md §5.12.4, T3a). A filter only
// removes light: the light's colour is multiplied by mix(1, hue, gel) per channel, not renormalised.

import type { RGB } from '../kelvin.ts';

/** The filter's colour in linear RGB for a hue in degrees (0 red, 120 green, 240 blue). */
export function hue(h: number): RGB {
  const t = h / 60, k = (v: number) => Math.min(1, Math.max(0, v));
  return [k(Math.abs(t - 3) - 1), k(2 - Math.abs(t - 2)), k(2 - Math.abs(t - 4))];
}

/** `col` through a filter of strength `gel` and hue `gelHue`; `col` itself (unchanged) at gel 0. */
export function filtered(col: RGB, gel: number, gelHue: number): RGB {
  if (!(gel > 0)) return col;
  const f = hue(gelHue);
  return [col[0] * (1 + (f[0] - 1) * gel), col[1] * (1 + (f[1] - 1) * gel), col[2] * (1 + (f[2] - 1) * gel)];
}
