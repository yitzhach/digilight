// schema.ts — the document (BUILD.md §6). Every setting is declared once in the field tables
// (fields.ts), with its tier, label, range and default; the Zod schema and describe() are built
// from them here, so the expert panel and an AI agent's menu can never drift from validation.

import { z } from 'zod';
import { AMBIENT, FINISH, LIGHT, RELIEF, TONE, type Doc, type Field, type PhotoInfo, type Spec, type Tier, type TupleField } from './fields.ts';

export * from './fields.ts';

// ---------------------------------------------------------------- Zod, from the tables

function zodOf(f: Field | TupleField): z.ZodType {
  switch (f.type) {
    case 'number': return z.number().min(f.min).max(f.max).default(f.default);
    case 'boolean': return z.boolean().default(f.default);
    case 'enum': return z.enum(f.options as [string, ...string[]]).default(f.default);
    case 'curve': return z.array(z.number().min(0).max(1)).length(256).optional();
    case 'tuple': {
      const items = f.items.map((i) => z.number().min(i.min).max(i.max)) as [z.ZodNumber, ...z.ZodNumber[]];
      return z.tuple(items).default(f.items.map((i) => i.default) as never);
    }
  }
}
function group<S extends Spec>(spec: S) {
  return z.strictObject(Object.fromEntries(Object.entries(spec).map(([k, f]) => [k, zodOf(f)])));
}

const lightSchema = group(LIGHT).extend({ id: z.string().regex(/^[\w-]{1,32}$/, 'a light id is 1 to 32 letters, digits, - or _') });

export const docSchema = z.strictObject({
  version: z.literal(2),
  photo: z.strictObject({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    space: z.enum(['srgb', 'display-p3']),
    sha256: z.string().regex(/^[0-9a-f]{64}$/, 'the SHA-256 of the photo file, 64 hex digits'),
    widthMm: z.number().positive().optional(),
  }),
  ambient: group(AMBIENT).prefault({}),
  lights: z.array(lightSchema).max(8).default([]),
  relief: group(RELIEF).prefault({}),
  tone: group(TONE).prefault({}),
  finish: group(FINISH).prefault({}),
}).superRefine((d, ctx) => {
  const ids = d.lights.map((l) => l.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', path: ['lights'], message: 'light ids must be different' });
});

/** A valid document (defaults filled in), or an Error that says what is wrong and where. */
export function parseDoc(input: unknown): Doc {
  const r = docSchema.safeParse(input);
  if (r.success) return r.data as unknown as Doc;
  const msg = r.error.issues.map((i) => `${i.path.join('.') || 'document'}: ${i.message}`).join('; ');
  throw new Error(`Invalid document: ${msg}`);
}

/** A neutral document for a photo: room light 1, no lights, texture off, finish neutral. */
export function neutralDoc(photo: PhotoInfo): Doc {
  return parseDoc({ version: 2, photo });
}

// ---------------------------------------------------------------- describe()

export interface Setting {
  path: string; label: string; help: string; tier: Tier; type: Field['type'];
  min?: number; max?: number; step?: number; options?: readonly string[];
  default: number | boolean | string | null; value: unknown;
}

function entries(prefix: string, spec: Spec, value: Record<string, unknown>, out: Setting[]): void {
  for (const [k, f] of Object.entries(spec)) {
    const v = value[k];
    if (f.type === 'tuple') {
      f.items.forEach((item, i) => out.push(setting(`${prefix}${k}.${i}`, item, (v as number[])[i])));
    } else out.push(setting(prefix + k, f, v ?? null));
  }
}
function setting(path: string, f: Field, value: unknown): Setting {
  const s: Setting = { path, label: f.label, help: f.help, tier: f.tier, type: f.type, default: f.default, value };
  if (f.type === 'number' || f.type === 'curve') { s.min = f.min; s.max = f.max; }
  if (f.type === 'number') s.step = f.step;
  if (f.type === 'enum') s.options = f.options;
  return s;
}

/** Every setting of a document: path, label, tier, range, default and current value. */
export function describe(doc: Doc): Setting[] {
  const out: Setting[] = [];
  entries('ambient.', AMBIENT, doc.ambient, out);
  doc.lights.forEach((l, i) => entries(`lights.${i}.`, LIGHT, l as unknown as Record<string, unknown>, out));
  entries('relief.', RELIEF, doc.relief, out);
  entries('tone.', TONE, doc.tone, out);
  entries('finish.', FINISH, doc.finish, out);
  return out;
}
