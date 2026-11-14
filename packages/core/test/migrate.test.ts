import { expect, test } from 'vitest';
import { DOC_LATEST, migrate, neutralDoc } from '../src/index.ts';

const photo = { width: 40, height: 30, space: 'srgb' as const, sha256: 'a'.repeat(64) };

test('a current document opens as it is; settings added later get their defaults', () => {
  const d = neutralDoc(photo);
  expect(migrate(JSON.parse(JSON.stringify(d)))).toEqual(d);
  const { finish: _f, tone: _t, ...older } = d; // saved before tone and finish existed
  expect(migrate(older)).toEqual(d);
  expect(DOC_LATEST).toBe(2);
});

test('a newer or unknown document says what to do', () => {
  expect(() => migrate({ ...neutralDoc(photo), version: 3 })).toThrow(/newer DigiLight/);
  expect(() => migrate({ photo })).toThrow(/no version number/);
  expect(() => migrate({ version: 1, photo })).toThrow(/version 1 cannot be opened/);
  expect(() => migrate(null)).toThrow(/not something DigiLight saved/);
});
