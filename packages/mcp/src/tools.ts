// tools.ts — the MCP server's tools and its instructions (BUILD.md Phase 7): what an agent reads
// to use DigiLight, so the words are plain and exact. Each tool maps to the session, which maps
// to core's commands (§7). Arguments are checked here for kind; core checks every value.

import { LOOKS } from 'core';
import type { Result, Session } from './session.ts';

export const INSTRUCTIONS = `DigiLight relights a photo of a flat or low-relief artwork (a painting, a relief, a plaster panel) as if lit by lamps. It never repaints: every output pixel is the photo's own pixel times computed light, and with nothing changed the output is the photo.

The loop:
1. open_image: a photo (JPEG, PNG, WebP or TIFF) of the piece taken straight on in even light, or a .digilight project.
2. list_looks, then apply_look for a starting point. A strength under 1 keeps more of the photo's own light.
3. render_preview (1,280 px wide unless asked) and read its numbers: the shares of blown (luma 250 and over) and crushed (5 and under) pixels against the photo's, luma percentiles, and warnings in words. Look at the picture too.
4. Adjust: set_settings by path (describe_settings lists every path with its range and default), add_light, update_light, remove_light, set_relief for texture. Each change says what changed and warns of blown whites or crushed darks.
5. compare shows two states side by side with their difference: 'photo' (as taken), 'current', or settings saved from get_settings.
6. export_image at full size writes the picture and a .json record; \`digilight verify record.json photo\` re-renders it and compares the SHA-256.
undo steps back one change; reset goes back to the photo as taken.

Places on the picture: u runs across and v down from its top left corner, 0 to 1 on the picture; a lamp may stand off it, from -2 to 3. A lamp's pos is [u, v, z], z its height above the picture's face in picture widths, from 0.03 (raking: shows texture) to 3 (straight on); its aim [u, v] is where it points. Light falls off with distance, so a lamp near an edge is far brighter there: stand side lights well off the picture (u of -2 to -1, or 2 to 3). Warmth is in kelvin: 2700 candle, 4000 tungsten lamp, 6500 daylight, 9000 shade. The room light (ambient.level) is how much of the photo's own light stays.
Texture lets the light show the surface's relief: 'estimated' guesses it from this photo (approximate, can look gritty), 'measured' comes from measure_relief with one to three photos of the piece lit from one side.`;

type Args = Record<string, unknown>;
interface Tool {
  name: string; title: string; description: string; readOnly?: boolean;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
  run: (s: Session, a: Args, progress: (text: string) => void) => Result | Promise<Result>;
}

const text = (a: Args, k: string): string => {
  if (typeof a[k] !== 'string' || !a[k]) throw new Error(`${k} must be given as text`);
  return a[k] as string;
};
const num = (a: Args, k: string): number | undefined => {
  if (a[k] === undefined) return undefined;
  if (typeof a[k] !== 'number' || !Number.isFinite(a[k])) throw new Error(`${k} must be a number`);
  return a[k] as number;
};
const fmt = (a: Args): 'jpeg' | 'png' | undefined => {
  if (a.format === undefined) return undefined;
  if (a.format !== 'jpeg' && a.format !== 'png') throw new Error('format must be "jpeg" or "png"');
  return a.format;
};
const region = (a: Args) => {
  const r = a.region as Record<string, unknown> | undefined;
  if (r === undefined) return undefined;
  const v = ['x', 'y', 'width', 'height'].map((k) => num(r, k));
  if (v.some((x) => x === undefined)) throw new Error('region needs x, y, width and height');
  return { x: v[0]!, y: v[1]!, width: v[2]!, height: v[3]! };
};
const fields = (a: Args) => Object.fromEntries(Object.entries(a).filter(([k]) => k !== 'id'));

const LIGHT = {
  pos: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: '[u, v, z]: across and down the picture (0 to 1 on it, -2 to 3 off it) and height above its face in picture widths (0.03 raking to 3 straight on)' },
  aim: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: '[u, v] the lamp points at' },
  intensity: { type: 'number', minimum: 0, maximum: 4, description: 'brightness, 1 is the default lamp' },
  kelvin: { type: 'number', minimum: 1500, maximum: 12000, description: 'warmth: 2700 candle, 4000 lamp, 6500 daylight' },
  cone: { type: 'number', minimum: 5, maximum: 90, description: 'spread in degrees: narrow for a spotlight, 90 lights everything' },
  edge: { type: 'number', minimum: 0, maximum: 1, description: 'how soft the edge of the spot is' },
  falloff: { type: 'number', minimum: 0, maximum: 1, description: 'how much the light fades with distance (1 is natural)' },
  size: { type: 'number', minimum: 0, maximum: 1, description: 'size of the light: bigger gives softer shadows' },
  on: { type: 'boolean' },
  kind: { type: 'string', enum: ['lamp', 'sun'], description: 'a lamp near the picture, or sunlight from far away (then azimuth and elevation)' },
  azimuth: { type: 'number', minimum: 0, maximum: 360, description: 'sun only: where it shines from (0 right, 90 top)' },
  elevation: { type: 'number', minimum: 1, maximum: 90, description: 'sun only: degrees above the picture\'s face' },
};
const STATE = { description: '"photo" (as taken), "current" (the document now), or settings from get_settings (their JSON object)', anyOf: [{ type: 'string', enum: ['photo', 'current'] }, { type: 'object' }] };

export const TOOLS: Tool[] = [
  { name: 'open_image', title: 'Open a photo', description: 'Opens a photo of an artwork (JPEG, PNG, WebP or TIFF; turned upright by its EXIF) or a .digilight project, and starts its document: a photo as photographed, a project with its settings, measured texture and crop. Returns the size, colour space and SHA-256.',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'the file, absolute or from the folder the server runs in' } }, required: ['path'], additionalProperties: false },
    run: (s, a) => s.open(text(a, 'path')) },
  { name: 'list_looks', title: 'List the looks', readOnly: true, description: 'The one-tap starting lightings (gallery, spotlight, soft window, raking...): id and name. Apply one with apply_look.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }, run: (s) => s.looks() },
  { name: 'apply_look', title: 'Apply a look', description: 'Sets the room light and the lights to a look; the finish is left as it is. One undo step.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', enum: LOOKS.map((l) => l.id) }, strength: { type: 'number', minimum: 0, maximum: 1, description: 'how far toward the look from the photo as taken (default 1)' }, flip: { type: 'boolean', description: 'mirror the lights left to right' } }, required: ['id'], additionalProperties: false },
    run: (s, a) => s.applyLook(text(a, 'id'), num(a, 'strength'), a.flip === undefined ? undefined : a.flip === true) },
  { name: 'describe_settings', title: 'Describe the settings', readOnly: true, description: 'Every setting: its path (for set_settings), current value, label, tier (simple or expert), range, step, default and a line on what it does. Narrow it with a path prefix such as "lights.0." or "finish.".',
    inputSchema: { type: 'object', properties: { prefix: { type: 'string' }, tier: { type: 'string', enum: ['simple', 'expert'] } }, additionalProperties: false },
    run: (s, a) => s.describe(a.prefix as string | undefined, a.tier as 'simple' | 'expert' | undefined) },
  { name: 'get_settings', title: 'Get settings', readOnly: true, description: 'The value of some settings by path, or, with no paths, every setting but the photo as JSON (keep it to compare or set again later).',
    inputSchema: { type: 'object', properties: { paths: { type: 'array', items: { type: 'string' } } }, additionalProperties: false },
    run: (s, a) => s.getSettings(a.paths as string[] | undefined) },
  { name: 'set_settings', title: 'Set settings', description: 'Sets one or more settings by path in one undo step, e.g. {"lights.0.kelvin": 3000, "ambient.level": 0.6, "finish.contrast": 0.2}. Out-of-range values are refused with the range. Returns what changed and warnings.',
    inputSchema: { type: 'object', properties: { values: { type: 'object', description: 'path: value, paths as describe_settings lists them' } }, required: ['values'], additionalProperties: false },
    run: (s, a) => { if (!a.values || typeof a.values !== 'object' || Array.isArray(a.values)) throw new Error('values must be an object of path: value'); return s.setSettings(a.values as Args); } },
  { name: 'add_light', title: 'Add a light', description: 'Adds a lamp, by default above the picture aimed at its centre; give any fields to place it. Returns its id (light-1, light-2...). Up to 8 lights.',
    inputSchema: { type: 'object', properties: LIGHT, additionalProperties: true }, run: (s, a) => s.addLight(a) },
  { name: 'update_light', title: 'Change a light', description: 'Changes some fields of one light (the others stay). One undo step.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, ...LIGHT }, required: ['id'], additionalProperties: true },
    run: (s, a) => s.updateLight(text(a, 'id'), fields(a)) },
  { name: 'remove_light', title: 'Remove a light', description: 'Removes one light. One undo step.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false }, run: (s, a) => s.removeLight(text(a, 'id')) },
  { name: 'set_relief', title: 'Set the texture', description: 'Texture: the light shows the surface\'s relief. mode "estimated" guesses it from this photo (approximate, can look gritty), "measured" uses measure_relief\'s height, "off" switches it off. depth and shadows as describe_settings gives them. The first render with an estimated texture builds its maps (about 15 s for a large photo, once).',
    inputSchema: { type: 'object', properties: { mode: { type: 'string', enum: ['off', 'estimated', 'measured'] }, depth: { type: 'number', minimum: 0, maximum: 0.03 }, shadows: { type: 'number', minimum: 0, maximum: 1 } }, additionalProperties: false },
    run: (s, a) => s.setRelief(Object.fromEntries(['mode', 'depth', 'shadows'].filter((k) => a[k] !== undefined).map((k) => [k, a[k]]))) },
  { name: 'measure_relief', title: 'Measure the texture', description: 'True Relief: measures the real surface from one to three photos of the same piece lit from one side (sun or a lamp; handheld is fine) and switches texture to it. from: where a photo\'s light came from in degrees (0 right, 90 top, 180 left, 270 bottom); left out, it is read from the photo. elevation: the light\'s height above the face in degrees (default 20). Takes tens of seconds.',
    inputSchema: { type: 'object', properties: { photos: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'object', properties: { path: { type: 'string' }, from: { type: 'number', minimum: 0, maximum: 360 }, elevation: { type: 'number', minimum: 3, maximum: 60 } }, required: ['path'] } }, widthCm: { type: 'number', description: 'the piece\'s width, when a lamp was measured in cm' } }, required: ['photos'], additionalProperties: false },
    run: (s, a, progress) => {
      if (!Array.isArray(a.photos)) throw new Error('photos must be a list of {path, from?, elevation?}');
      return s.measureRelief((a.photos as Args[]).map((p) => ({ path: text(p, 'path'), ...(num(p, 'from') === undefined ? {} : { from: num(p, 'from')! }), ...(num(p, 'elevation') === undefined ? {} : { elevation: num(p, 'elevation')! }) })), num(a, 'widthCm'), progress);
    } },
  { name: 'render_preview', title: 'Render a preview', readOnly: true, description: 'Renders the document now with the reference renderer and returns the picture with its numbers against the photo at the same size: shares of blown and crushed pixels, luma 5/50/95% percentiles, the protect-whites factor, and warnings. width defaults to 1,280 px (never wider than the photo); region (in that picture\'s pixels) looks at a detail at full size.',
    inputSchema: { type: 'object', properties: { width: { type: 'integer', minimum: 1 }, region: { type: 'object', properties: { x: { type: 'integer' }, y: { type: 'integer' }, width: { type: 'integer' }, height: { type: 'integer' } }, required: ['x', 'y', 'width', 'height'] }, format: { type: 'string', enum: ['jpeg', 'png'] } }, additionalProperties: false },
    run: (s, a) => s.preview(num(a, 'width'), region(a), fmt(a)) },
  { name: 'compare', title: 'Compare two states', readOnly: true, description: 'Renders A and B at the same size (640 px unless asked) and returns both and their difference (four times brighter where they differ), with the mean difference and how much of the picture changed.',
    inputSchema: { type: 'object', properties: { a: STATE, b: STATE, width: { type: 'integer', minimum: 1 } }, required: ['a', 'b'], additionalProperties: false },
    run: (s, a) => s.compare(a.a, a.b, num(a, 'width')) },
  { name: 'export_image', title: 'Export the picture', description: 'Renders at full size (or a width) and writes the picture to path (PNG or JPEG, by format or the file\'s extension) and its record beside it (.json: the document, the SHA-256 of the photo file, of its decoded pixels, of the picture\'s pixels and of the file).',
    inputSchema: { type: 'object', properties: { path: { type: 'string' }, width: { type: 'integer', minimum: 1 }, format: { type: 'string', enum: ['jpeg', 'png'] }, quality: { type: 'number', exclusiveMinimum: 0, maximum: 1, description: 'JPEG quality (default 0.92)' } }, required: ['path'], additionalProperties: false },
    run: (s, a) => s.exportImage(text(a, 'path'), { ...(num(a, 'width') === undefined ? {} : { width: num(a, 'width')! }), ...(fmt(a) ? { format: fmt(a)! } : {}), ...(num(a, 'quality') === undefined ? {} : { quality: num(a, 'quality')! }) }) },
  { name: 'undo', title: 'Undo', description: 'Steps back one change.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, run: (s) => s.undo() },
  { name: 'reset', title: 'Reset', description: 'Back to the photo as taken: no lights, room light 1, texture off, finish neutral. One undo step.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, run: (s) => s.reset() },
];
