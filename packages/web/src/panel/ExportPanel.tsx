// ExportPanel.tsx — panel section 5 (§8): size (Full, 3000, 2000 px), JPEG or PNG, Download.
// On a phone (where the share sheet takes files) the finished picture is offered with a "Save or
// share" button instead of a download, so it can go straight to Photos (D-030).

import { signal } from '@preact/signals';
import { canShare, download, exportPicture, share, type Exported, type ExportOptions } from '../io/export.ts';
import { busy, doc, photo, say } from '../state.ts';

/** A finished picture waiting for the person to tap "Save or share". */
export const ready = signal<Exported | null>(null);

export const exportChoice = signal<{ size: 'full' | 3000 | 2000; format: 'jpeg' | 'png' }>({ size: 'full', format: 'jpeg' });

/** Exports with the panel's choices and downloads the picture and its record. */
export async function exportNow(over: ExportOptions = {}) {
  const p = photo.value, d = doc.value;
  if (!p || !d) { say('Open a photo first.', true); return null; }
  const c = exportChoice.value;
  busy.value = 'Exporting…';
  try {
    const e = await exportPicture(p, d, { width: c.size === 'full' ? undefined : c.size, format: c.format, ...over });
    if (canShare(e)) {
      ready.value = e;
      say('Your picture is ready: tap Save or share, then Save Image to put it in Photos.');
    } else {
      download(e);
      say(`Saved ${e.name} (${e.record.picture.width} x ${e.record.picture.height}) and its record to your downloads.`);
    }
    return e;
  } catch (err) {
    say(`Export failed: ${(err as Error).message}`, true);
    return null;
  } finally { busy.value = null; }
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
      <button class="primary" data-action="download" disabled={busy.value !== null} onClick={() => void exportNow()}>Download</button>
    </section>
  );
}

/** The "Save or share" button for a finished picture (shown in the top bar). */
export function ShareButton() {
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
    <span class="share">
      <button class="primary" onClick={() => void go()} title="Open the share sheet: Save Image puts it in Photos">Save or share</button>
      <button onClick={() => { download(e); ready.value = null; }} title="Download the picture and its record (.json) instead">Download</button>
      <button onClick={() => (ready.value = null)} title="Close" aria-label="Close">×</button>
    </span>
  );
}
