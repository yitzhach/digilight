// Projects.tsx — the Settings window's project part (BUILD.md Phase 6b items 3, 5 and 6): Save
// project, Open project, the recent projects, and Apply to more photos.

import { useRef } from 'preact/hooks';
import { applyToMoreNow } from '../batch.ts';
import { offerFile } from '../io/offer.ts';
import { openProject, recent, saveProject } from '../projects.ts';
import { busy, say } from '../state.ts';

export function Projects({ close }: { close: () => void }) {
  const proj = useRef<HTMLInputElement>(null), many = useRef<HTMLInputElement>(null), b = busy.value !== null;
  const open = async (f: Blob, name?: string) => { if (await openProject(f, name)) close(); };
  return (
    <>
      <h3>Project</h3>
      <p class="hint">A project file keeps this photo with everything done to it, measured texture included. Open it later to carry on.</p>
      <div class="row">
        <button disabled={b} onClick={() => void saveProject()} title="Save the photo and its settings as a .digilight file">Save project</button>
        <button disabled={b} onClick={() => proj.current!.click()} title="Open a .digilight file">Open project</button>
        <input ref={proj} type="file" hidden data-input="project"
          onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void open(f); (e.target as HTMLInputElement).value = ''; }} />
      </div>
      {recent.value.length > 0 && (
        <ul class="presets" aria-label="Recent projects">
          {recent.value.map((r) => (
            <li key={r.name}><button class="apply" disabled={b} onClick={() => void open(r.file, r.name)} title={`Saved or opened ${new Date(r.when).toLocaleString()}`}>{r.name}</button></li>
          ))}
        </ul>
      )}
      <h3>Apply to more photos</h3>
      <p class="hint">Choose photos of other pieces: each gets this photo's lights and finish (not its texture) at full size, saved together as one zip.</p>
      <div class="row">
        <button disabled={b} onClick={() => many.current!.click()} title="Choose several photos to light like this one">Choose photos…</button>
        <input ref={many} type="file" multiple hidden data-input="many" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          onChange={(e) => {
            const fs = Array.from((e.target as HTMLInputElement).files ?? []);
            (e.target as HTMLInputElement).value = '';
            if (fs.length) void applyToMoreNow(fs, offerFile, say);
          }} />
      </div>
    </>
  );
}
