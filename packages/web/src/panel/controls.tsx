// controls.tsx — a slider, a switch and a select bound to a setting path. While a slider is held
// the picture shows the value live; letting go commits it with cmd.set (one undo step).

import { cmd, preview, run, shown } from '../state.ts';
import type { Doc } from 'core';

type Json = unknown;
/** `doc` with one setting replaced (paths as commands take them: lights.0.kelvin). */
export function withPath(doc: Doc, path: string, value: Json): Doc {
  const keys = path.split('.');
  const put = (o: Json, i: number): Json => {
    if (i === keys.length) return value;
    const k = keys[i]!, src = o as Record<string, Json>;
    const out = (Array.isArray(src) ? [...src] : { ...src }) as Record<string, Json>;
    out[k] = put(src[k], i + 1);
    return out;
  };
  return put(doc, 0) as Doc;
}
export function readPath(doc: Doc, path: string): Json {
  return path.split('.').reduce<Json>((o, k) => (o as Record<string, Json> | undefined)?.[k], doc);
}

interface SliderProps {
  path: string; label: string; help: string;
  /** Slider units (what the person sees) and the setting's value. */
  min: number; max: number; step: number;
  toValue?: (t: number) => number; fromValue?: (v: number) => number;
  format?: (t: number) => string;
}

export function Slider({ path, label, help, min, max, step, toValue = (t) => t, fromValue = (v) => v, format }: SliderProps) {
  const d = shown.value!;
  const t = Math.min(max, Math.max(min, fromValue(readPath(d, path) as number)));
  const value = (e: Event) => toValue(Number((e.target as HTMLInputElement).value));
  const id = `s-${path}`;
  return (
    <div class="control" title={help}>
      <label for={id}>{label}<output>{format ? format(t) : fmt(t, step)}</output></label>
      <input id={id} type="range" min={min} max={max} step={step} value={t}
        onInput={(e) => preview(withPath(shown.value!, path, value(e)))}
        onChange={(e) => run(() => cmd.set(path, value(e)))} />
    </div>
  );
}
const fmt = (t: number, step: number) => (step >= 1 ? String(Math.round(t)) : t.toFixed(Math.min(4, Math.max(0, -Math.floor(Math.log10(step))))));

export function Switch({ path, label, help }: { path: string; label: string; help: string }) {
  const v = readPath(shown.value!, path) === true;
  return (
    <label class="control switch" title={help}>
      <input type="checkbox" checked={v} onChange={() => run(() => cmd.set(path, !v))} />
      <span>{label}</span>
    </label>
  );
}

export function Select({ path, label, help, options, names = {} }: { path: string; label: string; help: string; options: readonly string[]; names?: Record<string, string> }) {
  const v = readPath(shown.value!, path) as string;
  return (
    <label class="control select" title={help}>
      <span>{label}</span>
      <select value={v} onChange={(e) => run(() => cmd.set(path, (e.target as HTMLSelectElement).value))}>
        {options.map((o) => <option key={o} value={o}>{names[o] ?? o}</option>)}
      </select>
    </label>
  );
}
