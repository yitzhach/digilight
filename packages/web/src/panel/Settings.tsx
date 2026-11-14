// Settings.tsx — the Settings window, opened from the Export section (BUILD.md Phase 6a item 4;
// Phase 6b adds projects and Apply to more photos, Projects.tsx):
// Copy settings and Paste settings (everything but the photo, onto another photo as one undo
// step), Save settings as a named preset, the presets to apply in one tap, and the presets
// saved to or loaded from a file (the browser's list is a convenience: Safari forgets it).

import { signal } from '@preact/signals';
import { useRef } from 'preact/hooks';
import { copied, copySettings, deletePreset, loadPresetsFile, presets, savePreset, savePresetsFile } from '../io/presets.ts';
import { cmd, notice, progress, run, say } from '../state.ts';
import { Projects } from './Projects.tsx';

export const settingsOpen = signal(false);
const name = signal('');
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function paste(): Promise<void> {
  let s: unknown = copied.value;
  if (!s) { // nothing copied here: an agent may have put settings on the clipboard
    try { s = await navigator.clipboard?.readText(); } catch { s = null; }
  }
  if (!s) { say('Nothing to paste yet: open a photo you like, tap Copy settings, then come back here.', true); return; }
  if (run(() => cmd.applySettings(s))) { settingsOpen.value = false; say('Settings pasted. Undo takes them off.'); }
}

/** Opens the window with no old message showing in it. */
export function openSettings(): void { notice.value = null; settingsOpen.value = true; }

export function SettingsWindow() {
  const file = useRef<HTMLInputElement>(null);
  if (!settingsOpen.value) return null;
  const close = () => { settingsOpen.value = false; };
  const save = async () => {
    try { await savePreset(name.value, cmd.getSettings({ relief: false })); say(`Saved "${name.value.trim()}".`); name.value = ''; }
    catch (e) { say(errorText(e), true); }
  };
  const apply = (n: string, s: unknown) => { if (run(() => cmd.applySettings(s))) { close(); say(`"${n}" applied. Undo takes it off.`); } };
  const load = async (f: File) => {
    try { const n = await loadPresetsFile(f); say(`Loaded ${n} preset${n === 1 ? '' : 's'} from ${f.name}.`); }
    catch (e) { say(errorText(e), true); }
  };
  return (
    <div class="overlay" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div class="window" role="dialog" aria-modal="true" aria-label="Settings">
        <header><h2>Settings</h2><button onClick={close} aria-label="Close" title="Close">×</button></header>
        {notice.value && <p class={`said${notice.value.error ? ' error' : ''}`} role={notice.value.error ? 'alert' : 'status'}>{notice.value.text}</p>}
        <p class="hint">Light several pieces alike: copy this photo's settings and paste them onto another, or save them as a preset.</p>
        <div class="row">
          <button onClick={() => { void copySettings(cmd.getSettings()); say('Settings copied. Open another photo, then Paste settings.'); }}
            title="Room light, lights, texture settings, tone and finish (also as text on the clipboard, for an AI agent)">Copy settings</button>
          <button onClick={() => void paste()} title="Put the copied settings on this photo (one undo step)">Paste settings</button>
        </div>
        <h3>Presets</h3>
        <form class="row" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <input type="text" placeholder="Name, e.g. Studio wall" value={name.value} aria-label="Preset name"
            onInput={(e) => (name.value = (e.target as HTMLInputElement).value)} />
          <button type="submit" class="primary" disabled={!name.value.trim()} title="Save room light, lights, tone and finish under this name">Save settings</button>
        </form>
        {presets.value.length === 0 ? <p class="hint">No presets yet.</p> : (
          <ul class="presets">
            {presets.value.map((p) => (
              <li key={p.name}>
                <button class="apply" onClick={() => apply(p.name, p.settings)} title="Apply this preset (one undo step)">{p.name}</button>
                <button onClick={() => void deletePreset(p.name)} aria-label={`Delete ${p.name}`} title="Delete this preset">×</button>
              </li>
            ))}
          </ul>
        )}
        <div class="row">
          <button onClick={() => void savePresetsFile()} disabled={presets.value.length === 0} title="Keep your presets in a file: the browser may forget them">Save presets to a file</button>
          <button onClick={() => file.current!.click()} title="Add the presets from a file you saved">Load presets from a file</button>
          <input ref={file} type="file" accept=".json,application/json" hidden data-input="presets"
            onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void load(f); (e.target as HTMLInputElement).value = ''; }} />
        </div>
        <Projects close={close} />
        {progress.value !== null && <p class="said" role="status">Working… {Math.round(100 * progress.value)}%</p>}
        <p class="hint">This browser keeps presets and recent projects only as long as it likes (Safari forgets them after a week without a visit); saved files keep them for good.</p>
      </div>
    </div>
  );
}
