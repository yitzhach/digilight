// migrate.ts — documents saved by older updates still open (BUILD.md Phase 6b item 4). An
// additive change to the schema needs nothing here: parseDoc fills new settings with their
// defaults. Any other change adds a step below that turns version n into n + 1, and a test that
// opens a document committed before it (core/test/migrate.test.ts, fixtures/projects/).

import type { Doc } from './fields.ts';
import { parseDoc } from './schema.ts';

export const DOC_LATEST = 2;
/** Steps from version n (the key) to n + 1. None yet: version 2 is the first that is saved. */
const STEPS: Record<number, (d: Record<string, unknown>) => Record<string, unknown>> = {};

/** A saved document, brought up to this update's version and checked. */
export function migrate(input: unknown): Doc {
  if (!input || typeof input !== 'object') throw new Error('That is not something DigiLight saved.');
  let d = input as Record<string, unknown>;
  let v = d.version;
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error('That has no version number, so DigiLight did not save it.');
  if (v > DOC_LATEST) throw new Error('That was saved by a newer DigiLight. Reload the page to get the newest update, then open it again.');
  while (v < DOC_LATEST) {
    const step = STEPS[v];
    if (!step) throw new Error(`Files of version ${v} cannot be opened any more.`);
    d = { ...step(d), version: v + 1 };
    v++;
  }
  return parseDoc(d);
}
