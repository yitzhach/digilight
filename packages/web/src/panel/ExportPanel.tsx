// ExportPanel.tsx — panel section 5 (§8): size (Full, 3000, 2000 px), JPEG or PNG, Download.

import { signal } from '@preact/signals';
import { download, exportPicture, type ExportOptions } from '../io/export.ts';
import { busy, doc, photo, say } from '../state.ts';

export const exportChoice = signal<{ size: 'full' | 3000 | 2000; format: 'jpeg' | 'png' }>({ size: 'full', format: 'jpeg' });

/** Exports with the panel's choices and downloads the picture and its record. */
export async function exportNow(over: ExportOptions = {}) {
  const p = photo.value, d = doc.value;
  if (!p || !d) { say('Open a photo first.', true); return null; }
  const c = exportChoice.value;
  busy.value = 'Exporting…';
  try {
    const e = await exportPicture(p, d, { width: c.size === 'full' ? undefined : c.size, format: c.format, ...over });
    download(e);
    say(`Saved ${e.name} (${e.record.picture.width} x ${e.record.picture.height}) and its record.`);
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
