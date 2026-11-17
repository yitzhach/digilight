// tools/index.ts — the light tools (BUILD.md §5.12, docs/light-tools.md): trials that can be
// removed in one commit. Each is expert tier and off by default to the byte; its maths is in
// its own file here and its hooks elsewhere carry the comment `tool:<id>`.
// TOOLS lists those built (core/test/tools.test.ts checks each against these rules).
// RETIRED lists the settings of tools that were removed: they are dropped from any document,
// preset or project that still carries them, so nothing stops opening.

export interface Tool {
  id: string; label: string;
  /** Its settings, as describe() names them (a light's as `lights.0.<name>`). */
  paths: readonly string[];
  /** The values at which it does nothing; these must be the defaults. */
  off: Readonly<Record<string, number | boolean | string>>;
}

export const TOOLS: readonly Tool[] = [
  { id: 'bounce', label: 'Bounce light', paths: ['relief.bounce'], off: { 'relief.bounce': 0 } },
  { id: 'roomside', label: 'Room light from one side', paths: ['relief.roomSide', 'relief.roomFrom'], off: { 'relief.roomSide': 0 } },
  { id: 'gel', label: 'Colour filter', paths: ['lights.0.gel', 'lights.0.gelHue'], off: { 'lights.0.gel': 0 } },
  { id: 'pattern', label: 'Light patterns', paths: ['lights.0.pattern', 'lights.0.patternSize', 'lights.0.patternSoft', 'lights.0.patternTurn'], off: { 'lights.0.pattern': 'none' } },
  { id: 'even', label: 'Even out the photo', paths: ['prepare.tilt', 'prepare.tiltFrom', 'prepare.corners', 'prepare.tint'], off: { 'prepare.tilt': 0, 'prepare.corners': 0, 'prepare.tint': 0 } },
  { id: 'glow', label: 'Glow', paths: ['finish.glow', 'finish.glowSpread', 'finish.glowWarmth'], off: { 'finish.glow': 0 } },
];

/** Settings of removed tools: `group.name`, or `lights.name` for one every light had. */
export const RETIRED: readonly string[] = [];

/** `input` (a document or settings, as read) without the retired settings; never changes `input`. */
export function dropRetired(input: unknown, retired: readonly string[] = RETIRED): unknown {
  if (!retired.length || !input || typeof input !== 'object') return input;
  const out: Record<string, unknown> = { ...(input as Record<string, unknown>) };
  for (const path of retired) {
    const [group, name] = path.split('.') as [string, string];
    const g = out[group];
    if (Array.isArray(g)) out[group] = g.map((l: unknown) => (l && typeof l === 'object' && name in l ? without(l as Record<string, unknown>, name) : l));
    else if (g && typeof g === 'object' && name in g) out[group] = without(g as Record<string, unknown>, name);
  }
  return out;
}
function without(o: Record<string, unknown>, name: string): Record<string, unknown> {
  const { [name]: _gone, ...rest } = o;
  return rest;
}
