// version.ts — which update this is: the commit's date and time (shown in the viewer's own
// clock) and its short name. Set when the app is built (vite.config.ts).

declare const __VERSION__: { time: string; commit: string };

const two = (n: number) => String(n).padStart(2, '0');

/** "2026-11-13 14:32 · cf09838". */
export function versionLabel(v: { time: string; commit: string } = __VERSION__): string {
  const d = new Date(v.time);
  const when = `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
  return v.commit ? `${when} · ${v.commit}` : when;
}
