import { expect, it, vi } from 'vitest';

// The maps' workers, stood in for: the first build fails, the next one works.
let fail = true;
vi.mock('../src/workers/pool.ts', () => ({
  reliefHeight: vi.fn(async () => {
    if (fail) throw new Error('first build failed');
    return { height: { width: 2, height: 2 }, inp: {} };
  }),
  reliefTmax: vi.fn(async () => 1),
  reliefTable: vi.fn(async () => {}),
}));
vi.stubGlobal('performance', { now: () => 0 });

it('an export after a failed and then repeated map build does not report the old failure', async () => {
  const { reliefForExport, resetRelief, startRelief } = await import('../src/relief.ts');
  resetRelief();
  const errors: string[] = [];
  startRelief(null, (e) => errors.push(e.message));
  await expect(reliefForExport(() => {})).rejects.toThrow('first build failed');
  await vi.waitFor(() => expect(errors).toEqual(['first build failed']));
  fail = false;
  startRelief(null, (e) => errors.push(e.message)); // Texture switched on again
  await expect(reliefForExport(() => {})).resolves.toBeUndefined();
  expect(errors).toEqual(['first build failed']);
});
