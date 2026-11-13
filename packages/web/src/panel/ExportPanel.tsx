// ExportPanel.tsx — panel section 5 (§8): size (Full, 3000, 2000 px), JPEG or PNG, Download.
// On a phone (where the share sheet takes files) the button says Export, and the finished picture
// is offered in one line under the top bar with a single "Save or share" button: the share sheet
// saves it to Photos or Files, so there is no separate download there (D-030, D-059).

import { signal } from '@preact/signals';
import { canShare, canShareFiles, download, exportPicture, share, type Exported, type ExportOptions } from '../io/export.ts';
import { busy, doc, notice, photo, progress, say } from '../state.ts';

/** A finished picture waiting for the person to tap "Save or share". */
export const ready = signal<Exported | null>(null);

export const exportChoice = signal<{ size: 'full' | 3000 | 2000; format: 'jpeg' | 'png' }>({ size: 'full', format: 'jpeg' });

/** Exports with the panel's choices and downloads the picture and its record. */
export async function exportNow(over: ExportOptions = {}) {
  const p = photo.value, d = doc.value;
  if (!p || !d) { say('Open a photo first.', true); return null; }
  const c = exportChoice.value;
  ready.value = null; // a new export replaces the last one's button
  busy.value = 'Exporting…';
  try {
    const e = await exportPicture(p, d, { width: c.size === 'full' ? undefined : Math.min(c.size, p.image.width), format: c.format, ...over },
      (f) => { progress.value = f; });
    if (canShare(e)) {
      ready.value = e; // its line under the top bar says so
      notice.value = null;
    } else {
      download(e);
      say(`Saved ${e.name} (${e.record.picture.width} x ${e.record.picture.height}) and its record to your downloads.`);
    }
    return e;
  } catch (err) {
    say(`Export failed: ${(err as Error).message}`, true);
    return null;
  } finally { busy.value = null; progress.value = null; }
}

export function ExportPanel() {
  const c = exportChoice.value, w = photo.value!.image.width;
  const sizes = (['full', 3000, 2000] as const).filter((s) => s === 'full' || s < w);
  return (
    <section>
      <h2>Export</h2>
      <div class="row" role="radiogroup" aria-label="Size" title="Width of the saved picture">
        {sizes.map((s) => (
          <button key={s} class={`chip${c.size === s ? ' current' : ''}`} onClick={() => (exportChoice.value = { ...c, size: s })}>
            {s === 'full' ? `Full (${w} px)` : `${s} px`}
          </button>
        ))}
      </div>
      <div class="row" role="radiogroup" aria-label="Format" title="JPEG for sharing, PNG for the most exact copy">
        {(['jpeg', 'png'] as const).map((f) => (
          <button key={f} class={`chip${c.format === f ? ' current' : ''}`} data-format={f} onClick={() => (exportChoice.value = { ...c, format: f })}>{f.toUpperCase()}</button>
        ))}
      </div>
      <button class="primary" data-action="download" disabled={busy.value !== null} onClick={() => void exportNow()}>{canShareFiles() ? 'Export' : 'Download'}</button>
    </section>
  );
}

/** On a phone, once the picture is ready: one line under the top bar with "Save or share". */
export function ReadyLine() {
  const e = ready.value;
  if (!e) return null;
  const go = async () => {
    try {
      if ((await share(e)) === 'shared') { ready.value = null; say('Done.'); }
    } catch (err) {
      download(e); ready.value = null;
      say(`Sharing did not work (${(err as Error).message}); the picture was downloaded instead.`, true);
    }
  };
  return (
    <div class="ready" role="status">
      <span>Your picture is ready. Save Image puts it in Photos; Save to Files keeps it as a file.</span>
      <button class="primary" onClick={() => void go()} title="Open the share sheet">Save or share</button>
      <button onClick={() => (ready.value = null)} title="Close" aria-label="Close">×</button>
    </div>
  );
}
