// Panel.tsx — the 320 px panel (§8): Looks, Lights, Export, and the Expert controls switch. On a
// phone it is a sheet at the bottom with one tab per section. Texture (section 3) arrives in
// Phase 4 and Finish (section 4) in Phase 6.

import { signal } from '@preact/signals';
import { expert, photo } from '../state.ts';
import { ExportPanel } from './ExportPanel.tsx';
import { Lights } from './Lights.tsx';
import { Looks } from './Looks.tsx';

const TABS = [['looks', 'Looks', Looks], ['lights', 'Lights', Lights], ['export', 'Export', ExportPanel]] as const;
const tab = signal<(typeof TABS)[number][0]>('looks');

export function Panel() {
  if (!photo.value) return <aside class="panel" />;
  return (
    <aside class="panel">
      <nav class="tabs">
        {TABS.map(([id, label]) => (
          <button key={id} class={tab.value === id ? 'current' : ''} onClick={() => (tab.value = id)}>{label}</button>
        ))}
      </nav>
      {TABS.map(([id, , Section]) => <div key={id} class={`tab${tab.value === id ? ' current' : ''}`}><Section /></div>)}
      <label class="control switch expert-switch" title="Show every setting (mainly for fine control and AI agents)">
        <input type="checkbox" checked={expert.value} onChange={() => (expert.value = !expert.value)} />
        <span>Expert controls</span>
      </label>
    </aside>
  );
}
