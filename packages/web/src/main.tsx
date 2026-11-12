// main.tsx — the one screen (§8): top bar, the picture, the panel. Open by drop, paste or picker;
// keys B (Before, held), Z / Shift+Z (undo / redo, also with Cmd or Ctrl), Delete (remove the selected light).

import { render } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { installApi } from './api.ts';
import { Stage } from './canvas/Stage.tsx';
import { exportNow, ShareButton } from './panel/ExportPanel.tsx';
import { Panel } from './panel/Panel.tsx';
import { before, busy, cmd, notice, openFile, photo, restore, run, say, selected } from './state.ts';
import './style.css';

const editable = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) && (t as HTMLInputElement).type !== 'range' && (t as HTMLInputElement).type !== 'checkbox');

function App() {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      // Cmd or Ctrl only with Z (undo / redo, as Z alone); other shortcuts stay the browser's.
      if (editable(e.target) || e.altKey || !photo.value || ((e.metaKey || e.ctrlKey) && k !== 'z')) return;
      if (k === 'b') { if (e.type === 'keydown') before.value = true; else before.value = false; return; }
      if (e.type !== 'keydown') return;
      if (k === 'z') run(() => (e.shiftKey ? cmd.redo() : cmd.undo()));
      else if ((k === 'delete' || k === 'backspace') && selected.value) { const id = selected.value; run(() => cmd.removeLight(id)); }
      else return;
      e.preventDefault();
    };
    const drop = (e: DragEvent) => { e.preventDefault(); const f = e.dataTransfer?.files[0]; if (f) void openFile(f); };
    const over = (e: DragEvent) => e.preventDefault();
    const paste = (e: ClipboardEvent) => { const f = e.clipboardData?.files[0]; if (f) { e.preventDefault(); void openFile(f); } };
    window.addEventListener('keydown', key); window.addEventListener('keyup', key);
    window.addEventListener('drop', drop); window.addEventListener('dragover', over);
    window.addEventListener('paste', paste);
    return () => {
      window.removeEventListener('keydown', key); window.removeEventListener('keyup', key);
      window.removeEventListener('drop', drop); window.removeEventListener('dragover', over);
      window.removeEventListener('paste', paste);
    };
  }, []);
  const has = photo.value !== null, n = notice.value;
  return (
    <div class="app">
      <header class="bar">
        <strong class="brand">DigiLight</strong>
        <button onClick={() => input.current!.click()} title="Open a photo (or drop or paste one)">Open</button>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" hidden
          onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void openFile(f); (e.target as HTMLInputElement).value = ''; }} />
        <button disabled={!has} onClick={() => run(() => cmd.undo())} title="Undo (Z)">Undo</button>
        <button disabled={!has} onClick={() => run(() => cmd.redo())} title="Redo (Shift+Z)">Redo</button>
        <button disabled={!has} class={before.value ? 'current' : ''} title="Press and hold to see the photo as it was (B)"
          onPointerDown={() => (before.value = true)} onPointerUp={() => (before.value = false)} onPointerLeave={() => (before.value = false)}
          onPointerCancel={() => (before.value = false)} onContextMenu={(e) => e.preventDefault()}>Before</button>
        <ShareButton />
        <span class="grow">{busy.value}</span>
        <button disabled={!has || busy.value !== null} onClick={() => void exportNow()} title="Save the picture with the Export choices">Export</button>
      </header>
      {n && <div class={`notice${n.error ? ' error' : ''}`} role={n.error ? 'alert' : 'status'} onClick={() => (notice.value = null)} title="Tap to close">{n.text}</div>}
      <main>
        <Stage />
        <Panel />
      </main>
    </div>
  );
}

// An error nothing caught still reaches the person, as a message.
window.addEventListener('error', (e) => say(`Something went wrong: ${e.message || 'an unknown error'}. If the picture looks wrong, reload the page.`, true));
window.addEventListener('unhandledrejection', (e) => say(`Something went wrong: ${(e.reason as Error)?.message ?? String(e.reason)}. If the picture looks wrong, reload the page.`, true));
installApi();
render(<App />, document.getElementById('app')!);
if (new URLSearchParams(location.search).has('bench')) void import('./bench.ts').then((b) => b.mountBench());
void restore();
