// presets.ts — the Settings window's state (Phase 6a item 4): copied settings and saved presets.
// Copy keeps the settings here (and in localStorage, so a reload or another photo still has them)
// and puts their JSON on the clipboard for an AI agent. Presets live in IndexedDB and in a file.

import { signal } from '@preact/signals';
import { readSettings, type Settings } from 'core';
import { canShareFiles } from './export.ts';
import { loadPresets, savePresets, type Preset } from './store.ts';

export type { Preset };
const COPIED = 'digilight-copied';
const read = (): Settings | null => { try { const t = localStorage.getItem(COPIED); return t ? (JSON.parse(t) as Settings) : null; } catch { return null; } };

export const copied = signal<Settings | null>(read());
export const presets = signal<Preset[]>([]);
void loadPresets().then((p) => { presets.value = p; });

/** Keeps the settings for Paste, and their JSON on the clipboard where the browser allows it. */
export async function copySettings(s: Settings): Promise<void> {
  copied.value = s;
  const text = JSON.stringify(s, null, 2);
  try { localStorage.setItem(COPIED, text); } catch { /* private window: kept for this visit */ }
  try { await navigator.clipboard?.writeText(text); } catch { /* not allowed: Paste still has it */ }
}

const byName = (a: Preset, b: Preset) => a.name.localeCompare(b.name);
async function keep(list: Preset[]): Promise<void> {
  presets.value = [...list].sort(byName);
  await savePresets(presets.value).catch(() => {});
}

/** Saves the settings as a preset (Texture left out); the same name replaces the old one. */
export function savePreset(name: string, s: Settings): Promise<void> {
  const n = name.trim();
  if (!n) throw new Error('Give the preset a name first.');
  const { relief: _texture, ...settings } = s;
  return keep([...presets.value.filter((p) => p.name !== n), { name: n, settings }]);
}
export const deletePreset = (name: string) => keep(presets.value.filter((p) => p.name !== name));

const FILE_APP = 'DigiLight presets';
/** The presets as a file to keep (on a phone the share sheet saves it to Files). */
export async function savePresetsFile(): Promise<void> {
  const text = JSON.stringify({ app: FILE_APP, version: 1, presets: presets.value }, null, 2);
  const file = new File([text], 'digilight-presets.json', { type: 'application/json' });
  if (canShareFiles() && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch (e) { if ((e as Error).name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = file.name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** Adds the presets in a file (a name already here is replaced); returns how many. */
export async function loadPresetsFile(f: Blob): Promise<number> {
  let o: { app?: string; presets?: unknown };
  try { o = JSON.parse(await f.text()); } catch { throw new Error('That file is not a DigiLight presets file.'); }
  if (o.app !== FILE_APP || !Array.isArray(o.presets)) throw new Error('That file is not a DigiLight presets file.');
  const got = o.presets.map((p: { name?: unknown; settings?: unknown }) => {
    if (typeof p?.name !== 'string' || !p.name.trim()) throw new Error('A preset in that file has no name.');
    const { relief: _texture, ...settings } = readSettings(p.settings) as Settings;
    return { name: p.name.trim(), settings: settings as Settings };
  });
  const names = new Set(got.map((p) => p.name));
  await keep([...presets.value.filter((p) => !names.has(p.name)), ...got]);
  return got.length;
}

