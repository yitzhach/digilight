// offer.ts — hands a file to the person: the share sheet where the browser can share it (a phone:
// Save to Files, or Save Image for a picture), else a download.

import { canShareFiles } from './export.ts';

export async function offerFile(file: File): Promise<void> {
  if (canShareFiles()) {
    let ok = false;
    try { ok = navigator.canShare?.({ files: [file] }) === true; } catch { ok = false; }
    if (ok) {
      try { await navigator.share({ files: [file] }); return; } catch (e) { if ((e as Error).name === 'AbortError') return; }
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = file.name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}
