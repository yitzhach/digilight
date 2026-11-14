// projects.ts — Save project and Open project (BUILD.md Phase 6b items 3 and 6): the open photo,
// its document and its measured height to a `.digilight` file and back, and the recent list.

import { signal } from '@preact/signals';
import { offerFile } from './io/offer.ts';
import { isProject, packProject, unpackProject } from './io/project.ts';
import { addRecent, heightFromPng, heightPng, loadRecent, type Recent } from './io/store.ts';
import { busy, cmd, openFile, photo, say } from './state.ts';

export const recent = signal<Recent[]>([]);
void loadRecent().then((r) => { recent.value = r; });

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const remember = async (name: string, file: Blob) => { recent.value = await addRecent({ name, when: new Date().toISOString(), file }); };

/** The open photo as a project file (also kept in the recent list). */
export async function projectFile(): Promise<File> {
  const p = photo.value;
  if (!p) throw new Error('Open a photo first.');
  const m = cmd.getMeasured(), doc = cmd.getDoc();
  const height = m ? { png: new Uint8Array(await (await heightPng(m)).arrayBuffer()), width: m.width, height: m.height, lo: m.lo, hi: m.hi } : null;
  const blob = packProject({ doc, photo: { name: p.name, bytes: new Uint8Array(await p.blob.arrayBuffer()) }, height });
  const name = `${p.name.replace(/\.[^.]*$/, '') || 'picture'}.digilight`;
  return new File([blob], name, { type: 'application/zip' });
}

export async function saveProject(): Promise<void> {
  try {
    const f = await projectFile();
    await remember(f.name, f);
    void navigator.storage?.persist?.().catch(() => false); // ask the browser to keep the recent list
    await offerFile(f);
    say(`Saved ${f.name}: open it with Open project (or the Open button) to carry on where you left off.`);
  } catch (e) { say(`Could not save the project: ${errorText(e)}`, true); }
}

/** Opens a `.digilight` file: its photo, settings and measured texture. */
export async function openProject(f: Blob, name = (f as File).name ?? 'project.digilight'): Promise<boolean> {
  busy.value = 'Opening the project…';
  try {
    const pr = await unpackProject(new Uint8Array(await f.arrayBuffer()));
    const measured = pr.height ? await heightFromPng({ ...pr.height, png: new Blob([pr.height.png as Uint8Array<ArrayBuffer>], { type: 'image/png' }) }) : null;
    await openFile(new File([pr.photo.bytes as Uint8Array<ArrayBuffer>], pr.photo.name), pr.photo.name, pr.doc, measured, true);
    if (photo.value?.sha256 !== pr.doc.photo.sha256) return false; // openFile said why
    await remember(name, f);
    say(`Opened ${name}.`);
    return true;
  } catch (e) {
    say(`Could not open ${name}: ${errorText(e)}`, true);
    return false;
  } finally { if (busy.value === 'Opening the project…') busy.value = null; }
}

/** The Open button, a drop or a paste: a project or a photo. */
export async function openAny(f: Blob): Promise<void> {
  if (await isProject(f)) await openProject(f);
  else await openFile(f);
}
