// Versions.tsx — the strip under the picture (BUILD.md Phase 6b item 2): Keep this version, and
// a thumbnail of each kept version. Tap one to go back to it (one undo step); press and hold to
// see it on the picture until released (nothing changes). The version the picture is now has a
// frame and a × beside it to remove it.

import { useRef } from 'preact/hooks';
import { Thumb } from '../panel/Looks.tsx';
import { busy, photo, versions, type Version } from '../state.ts';
import { currentVersion, keepVersion, removeVersion, startCompare, stopCompare, switchTo, versionThumbs } from '../versions.ts';
import { cropping } from './Crop.tsx';

/** How long a press is before it compares instead of switching. */
const HOLD_MS = 250;

function Item({ v, n }: { v: Version; n: number }) {
  const s = useRef({ timer: 0, held: false, x: 0, y: 0 }).current;
  const cur = currentVersion.value === v.id;
  const end = () => { clearTimeout(s.timer); if (s.held) stopCompare(); };
  return (
    <div class={`version-item${cur ? ' current' : ''}`}>
      <button class="version-thumb" data-version={n} aria-label={`Version ${n}`}
        title="Tap to go back to this version; press and hold to compare it with the picture now"
        onPointerDown={(e) => {
          s.held = false; s.x = e.clientX; s.y = e.clientY; clearTimeout(s.timer);
          s.timer = window.setTimeout(() => { s.held = true; startCompare(v); }, HOLD_MS);
        }}
        // Scrolling the strip is not a hold.
        onPointerMove={(e) => { if (!s.held && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 8) clearTimeout(s.timer); }}
        onPointerUp={end} onPointerLeave={end} onPointerCancel={end} onContextMenu={(e) => e.preventDefault()}
        onClick={() => { if (s.held) s.held = false; else switchTo(v); }}>
        <Thumb img={versionThumbs.value[v.id]} />
        <span>{n}</span>
      </button>
      {cur && <button class="version-remove" onClick={() => removeVersion(v.id)} aria-label={`Remove version ${n}`} title="Remove this version from the strip (the picture stays as it is)">×</button>}
    </div>
  );
}

export function Versions() {
  if (!photo.value || cropping.value) return null;
  const list = versions.value;
  return (
    <div class="versions" role="toolbar" aria-label="Versions">
      <button class="keep" onClick={keepVersion} disabled={busy.value !== null} title="Keep the lighting as it is now, to come back to it or compare with it">Keep this version</button>
      {list.length === 0
        ? <span class="hint">Kept versions show here: tap one to go back to it, hold it to compare.</span>
        : list.map((v, i) => <Item key={v.id} v={v} n={i + 1} />)}
    </div>
  );
}
