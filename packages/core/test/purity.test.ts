import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// core is pure (BUILD.md §3): no DOM, no Node APIs, no non-deterministic maths.
const dir = new URL('../src/', import.meta.url);
const files = readdirSync(dir, { recursive: true }).map(String).filter((f) => f.endsWith('.ts'));
const code = (f: string) => readFileSync(new URL(f, dir), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('no banned Math.* in core/src (use dmath.ts)', () => {
  const banned = /Math\.(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|pow|exp|expm1|log\w*|cbrt|hypot)\b|\*\*/;
  expect(files.length).toBeGreaterThan(5);
  for (const f of files) expect(code(f), f).not.toMatch(banned);
});

test('no DOM or Node APIs in core/src', () => {
  const banned = /\b(document|window|navigator|process|globalThis)\s*\.|\b(ImageData|OffscreenCanvas|HTMLElement|Buffer|fetch|require)\b\s*\(?|from ['"]node:/;
  for (const f of files) expect(code(f), f).not.toMatch(banned);
});

test('files stay under 300 lines', () => {
  for (const f of files) expect(readFileSync(new URL(f, dir), 'utf8').split('\n').length, f).toBeLessThan(300);
});
