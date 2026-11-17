import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { describe as settingsOfDoc, dropRetired, isNeutral, neutralDoc, parseDoc, RETIRED, TOOLS } from '../src/index.ts';

// The rules every light tool keeps (docs/light-tools.md section 2), checked for each one listed.
const photo = { width: 8, height: 6, space: 'srgb' as const, sha256: 'd'.repeat(64) };
const doc = parseDoc({ ...neutralDoc(photo), lights: [{ id: 'a' }] });
const settings = new Map(settingsOfDoc(doc).map((s) => [s.path, s]));
const src = new URL('../src/', import.meta.url);
const files = readdirSync(src, { recursive: true }).map(String).filter((f) => f.endsWith('.ts'));

test('tool ids are different', () => {
  expect(new Set(TOOLS.map((t) => t.id)).size).toBe(TOOLS.length);
});

for (const tool of TOOLS) {
  test(`tool ${tool.id}: its settings exist, are expert, and it is off by default`, () => {
    expect(tool.paths.length).toBeGreaterThan(0);
    for (const path of tool.paths) {
      const s = settings.get(path);
      expect(s, `${path} is not a setting`).toBeDefined();
      expect(s!.tier, path).toBe('expert');
      expect(RETIRED, path).not.toContain(path.replace(/^lights\.\d+\./, 'lights.'));
    }
    expect(Object.keys(tool.off).length).toBeGreaterThan(0);
    for (const [path, off] of Object.entries(tool.off)) {
      expect(tool.paths, path).toContain(path);
      expect(settings.get(path)!.default, `${path} must default to off`).toBe(off);
    }
  });

  test(`tool ${tool.id}: its hooks are marked tool:${tool.id}`, () => {
    const marked = files.filter((f) => readFileSync(new URL(f, src), 'utf8').includes(`tool:${tool.id}`));
    expect(marked.length, `no file in core/src mentions tool:${tool.id}`).toBeGreaterThan(0);
  });
}

test('a new document is neutral with every tool listed', () => {
  expect(isNeutral(neutralDoc(photo))).toBe(true);
});

test('retired settings are dropped from documents and settings, so old files still open', () => {
  const old = { ...doc, relief: { ...doc.relief, gone: 0.5 }, finish: { ...doc.finish, alsoGone: 1 }, lights: doc.lights.map((l) => ({ ...l, tint: 3 })) };
  expect(() => parseDoc(old)).toThrow(); // unknown settings are refused...
  const cleaned = dropRetired(old, ['relief.gone', 'finish.alsoGone', 'lights.tint']); // ...unless retired
  expect(parseDoc(cleaned)).toEqual(doc);
  expect(old.relief.gone).toBe(0.5); // the input is not changed
  expect(dropRetired(doc, [])).toBe(doc);
  expect(dropRetired('text', ['relief.gone'])).toBe('text');
  expect(dropRetired({ lights: doc.lights }, ['relief.gone'])).toEqual({ lights: doc.lights }); // settings without that group
});
