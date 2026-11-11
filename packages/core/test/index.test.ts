import { expect, test } from 'vitest';
import { DOC_VERSION } from '../src/index';

test('document version is 2', () => {
  expect(DOC_VERSION).toBe(2);
});
