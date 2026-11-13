// settings.ts — a document's settings without its photo (BUILD.md Phase 6a item 4): what Copy
// settings puts on the clipboard, what a saved preset keeps, and how either goes onto another
// photo. Paste carries Texture's settings too, but its mode becomes off unless that photo has its
// own measured height (the maps belong to the photo they were made from). A preset keeps room
// light, lights, tone and finish only, so applying one leaves the photo's Texture as it is.

import type { Doc } from './fields.ts';
import { parseDoc } from './schema.ts';

export const SETTINGS_APP = 'DigiLight settings';
export interface Settings {
  app: typeof SETTINGS_APP; version: 2;
  ambient: Doc['ambient']; lights: Doc['lights']; tone: Doc['tone']; finish: Doc['finish'];
  relief?: Doc['relief'];
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** The settings of a document: everything but the photo (`relief: false` leaves Texture out, as a preset does). */
export function settingsOf(doc: Doc, opts: { relief?: boolean } = {}): Settings {
  const s: Settings = { app: SETTINGS_APP, version: 2, ambient: doc.ambient, lights: doc.lights, tone: doc.tone, finish: doc.finish };
  if (opts.relief !== false) s.relief = doc.relief;
  return clone(s);
}

/** Settings from anything a person or an agent hands over: Settings, a whole document, or their
 *  JSON text. Throws a plain message when it is neither. */
export function readSettings(input: unknown): Partial<Settings> {
  let v = input;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { throw new Error('That is not DigiLight settings (copy them with Copy settings first).'); }
  }
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== 'object' || !('lights' in o || 'ambient' in o || 'finish' in o || 'tone' in o))
    throw new Error('That is not DigiLight settings (copy them with Copy settings first).');
  const out: Partial<Settings> = {};
  for (const k of ['ambient', 'lights', 'tone', 'finish', 'relief'] as const) if (k in o) (out as Record<string, unknown>)[k] = clone(o[k]);
  return out;
}

/** `doc` with the settings put on: one valid document for the same photo. Settings left out stay
 *  as they are; Texture comes on only as `measured`, and only when `hasMeasured`. */
export function withSettings(doc: Doc, input: unknown, hasMeasured: boolean): Doc {
  const s = readSettings(input);
  const next: Record<string, unknown> = { ...clone(doc) };
  for (const k of ['ambient', 'lights', 'tone', 'finish'] as const) if (s[k] !== undefined) next[k] = s[k];
  if (s.relief) next.relief = { ...s.relief, mode: hasMeasured && s.relief.mode !== 'off' ? 'measured' : 'off' };
  return parseDoc(next);
}
