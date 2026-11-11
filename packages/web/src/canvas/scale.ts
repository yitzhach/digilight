// scale.ts — the adaptive drawing scale while a control is held (§9): q in {1, 0.75, 0.5,
// 0.35}, lowered when the average frame takes over 24 ms, raised under 12 ms; 120 ms after
// release one frame at q = 1.

export const STEPS = [1, 0.75, 0.5, 0.35] as const;
export const SETTLE_MS = 120;

export function createScale() {
  let i = 0, smooth = 0;
  const times: number[] = [];
  return {
    get q(): number { return STEPS[i]!; },
    /** How long a held frame took (ms, from its draw to the next display frame). */
    record(ms: number): void {
      // A 60 Hz display never shows a frame under 16.7 ms, so "under 12 ms" cannot be seen
      // there: 30 frames in a row at the display's rate also count as room to raise (D-025).
      smooth = ms <= 18 ? smooth + 1 : 0;
      if (smooth >= 30 && i > 0) { i--; smooth = 0; times.length = 0; return; }
      times.push(ms);
      if (times.length > 6) times.shift();
      if (times.length < 3) return;
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      if (avg > 24 && i < STEPS.length - 1) { i++; times.length = 0; }
      else if (avg < 12 && i > 0) { i--; times.length = 0; }
    },
  };
}
