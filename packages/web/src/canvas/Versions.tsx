// Versions.tsx — the strip under the picture (BUILD.md Phase 6b item 2): "Keep this version",
// then a thumbnail per kept version. Tap switches to it (one undo step); press and hold shows it
// on the picture until let go, as Before shows the photo; × removes it.

import { useRef } from 'preact/hooks';
import { Thumb } from '../panel/Looks.tsx';
import { busy, photo, say } from '../state.ts';
import { compareVersion, comparing, currentVersion, endCompare, keepVersion, removeVersion, useVersion, versions } from '../versions.ts';
import { cropping } from './Crop.tsx';

const HOLD_MS = 300;

function VersionButton({ i }: { i: number }) {
  const v = versions.value[i]!, t = useRef({ timer: 0, held: false });
  const down = () => { t.current.held = false; clearTimeout(t.current.timer); t.current.timer = window.setTimeout(() => { t.current.held = true; compareVersion(i); }, HOLD_MS); };
  const stop = () => { clearTimeout(t.current.timer); t.current.timer = 0; if (t.current.held) endCompare(); };
  const up = () => { const tap = t.current.timer !== 0 && !t.current.held; stop(); t.current.held = false; if (tap) useVersion(i); };
  const leave = () => { stop(); t.current.held = false; };
  const held = comparing.value?.i === i;
  return (
    <div class={`version-item${i === currentVersion.value ? ' current' : ''}${held ? ' held' : ''}`}>
      <button class="version-thumb" data-version={i} title="Tap to switch to this version; press and hold to compare it with the picture now"
        onPointerDown={down} onPointerUp={up} onPointerLeave={leave} onPointerCancel={leave} onContextMenu={(e) => e.preventDefault()}
        onClick={(e) => { if (e.detail === 0) useVersion(i); }} aria-label={`Version ${i + 1}`}>
        <Thumb img={v.thumb} />
        <span>{i + 1}</span>
      </button>
      <button class="version-remove" onClick={() => removeVersion(i)} title="Remove this version" aria-label={`Remove version ${i + 1}`}>×</button>
    </div>
  );
}

export function Versions() {
  if (!photo.value || cropping.value) return null;
  const list = versions.value, kept = currentVersion.value >= 0;
  const keep = () => void keepVersion().catch((e: Error) => say(e.message, true));
  return (
    <div class="versions" role="group" aria-label="Versions">
      <button class="version-keep" disabled={busy.value !== null || kept} onClick={keep}
        title={kept ? 'This version is kept' : 'Keep the picture as it is now, to come back to or compare with'}>
        {kept ? 'Kept' : 'Keep this version'}
      </button>
      {list.map((_, i) => <VersionButton key={i} i={i} />)}
      {list.length === 0 && <span class="hint">Keep versions to compare them: tap one to switch, press and hold to compare.</span>}
    </div>
  );
}
