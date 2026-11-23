// The MCP server, Phase 7's gate (BUILD.md §10): a full session over stdio, every tool; a 1,280 px
// preview of the Light layer in under a second, and the first preview with Texture saying it
// built the maps; an export with the same pixel SHA-256 as the app's export of the same document
// from the same PNG photo, the photo's decoded pixels hashed alike in both records; and
// `digilight verify` accepting the record.

import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { loadFixture } from '../packages/core/scripts/jpeg.ts';
import { encodePng } from './png.ts';

const APP = 'http://localhost:5180/';
const SERVER = new URL('../packages/mcp/src/server.ts', import.meta.url).pathname;
const CLI = new URL('../packages/mcp/src/cli.ts', import.meta.url).pathname;

interface Content { type: string; text?: string; data?: string; mimeType?: string }
/** A client speaking MCP to the server over its stdin and stdout. */
class Client {
  private proc: ChildProcessWithoutNullStreams;
  private buf = ''; private next = 0;
  private waiting = new Map<number, (m: { result?: any; error?: any }) => void>();
  readonly notes: any[] = [];
  constructor() {
    this.proc = spawn(process.execPath, [SERVER], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', (d: string) => {
      this.buf += d;
      for (let i = this.buf.indexOf('\n'); i >= 0; i = this.buf.indexOf('\n')) {
        const m = JSON.parse(this.buf.slice(0, i)); this.buf = this.buf.slice(i + 1);
        if (m.id !== undefined && this.waiting.has(m.id)) { this.waiting.get(m.id)!(m); this.waiting.delete(m.id); } else this.notes.push(m);
      }
    });
  }
  request(method: string, params: object = {}): Promise<{ result?: any; error?: any }> {
    const id = ++this.next;
    return new Promise((res) => { this.waiting.set(id, res); this.proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`); });
  }
  notify(method: string) { this.proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method })}\n`); }
  async tool(name: string, args: object = {}) {
    const t0 = Date.now(), r = await this.request('tools/call', { name, arguments: args, _meta: { progressToken: `${name}-${this.next + 1}` } });
    const content = r.result.content as Content[];
    return { ms: Date.now() - t0, isError: r.result.isError === true, text: content[0]!.text!, images: content.slice(1) };
  }
  close() { this.proc.stdin.end(); }
}

test('MCP: a full session over stdio; a fast preview; the export equals the app\'s; verify accepts it', async ({ page }) => {
  test.setTimeout(400_000);
  const dir = mkdtempSync(join(tmpdir(), 'digilight-e2e-mcp-'));
  const door = join(dir, 'door.png'), sun = join(dir, 'door-sun.png'), out = join(dir, 'door-lit.png');
  writeFileSync(door, encodePng(loadFixture('door-flat-crop.jpg')));
  writeFileSync(sun, encodePng(loadFixture('door-sun.jpg')));

  const c = new Client();
  const init = await c.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } });
  expect(init.result.protocolVersion).toBe('2025-06-18');
  expect(init.result.instructions).toMatch(/open_image[\s\S]*render_preview[\s\S]*export_image/);
  c.notify('notifications/initialized');
  const tools = (await c.request('tools/list')).result.tools as { name: string; inputSchema: { type: string } }[];
  expect(tools).toHaveLength(16);
  for (const t of tools) expect(t.inputSchema.type).toBe('object');
  expect((await c.request('nonsense')).error.code).toBe(-32601);

  expect((await c.tool('open_image', { path: door })).text).toMatch(/1280 x 1805 px, sRGB/);
  expect((await c.tool('list_looks')).text).toContain('spotlight: Spotlight');
  expect((await c.tool('apply_look', { id: 'spotlight' })).text).toContain('ambient.level: 1 -> 0.28');
  expect((await c.tool('describe_settings', { prefix: 'finish.' })).text).toContain('finish.contrast = 0');
  expect((await c.tool('set_settings', { values: { 'finish.contrast': 0.2, 'finish.vignette': 0.3 } })).text).toContain('finish.vignette: 0 -> 0.3');
  expect((await c.tool('add_light', { pos: [-1.8, 0.4, 0.6], intensity: 0.4, kelvin: 6500 })).text).toContain('added light-2');
  expect((await c.tool('update_light', { id: 'light-2', cone: 60 })).text).toContain('lights.1.cone: 90 -> 60');
  expect((await c.tool('get_settings', { paths: ['lights.1.cone'] })).text).toBe('lights.1.cone = 60');
  const bad = await c.tool('set_settings', { values: { 'lights.0.intensity': 9 } });
  expect(bad.isError).toBe(true);
  expect(bad.text).toMatch(/intensity/);

  // The Light layer at 1,280 px: under a second, the picture and its numbers. The fastest of
  // three, as other tests may be running beside this one on the same machine.
  const runs = [await c.tool('render_preview'), await c.tool('render_preview'), await c.tool('render_preview')], p1 = runs[0]!;
  console.log(`1,280 px previews, Light layer: ${runs.map((r) => r.ms).join(', ')} ms`);
  expect(Math.min(...runs.map((r) => r.ms))).toBeLessThan(1000);
  expect(p1.text).toMatch(/Preview 1280 x 1805 px/);
  expect(p1.text).toMatch(/Picture: blown [\d.]+%, crushed/);
  expect(p1.images[0]!.mimeType).toBe('image/jpeg');
  expect(p1.images[0]!.data!.startsWith('/9j/')).toBe(true); // a JPEG's first bytes
  expect((await c.tool('remove_light', { id: 'light-2' })).text).toContain('removed light-2');

  // Texture: the first preview builds the maps and says so; then the export.
  expect((await c.tool('set_relief', { mode: 'estimated' })).text).toContain('next render_preview first builds its maps');
  const p2 = await c.tool('render_preview');
  console.log(`first preview with Texture (maps built): ${p2.ms} ms`);
  expect(p2.text).toContain('Texture\'s maps were built first');
  const ex = await c.tool('export_image', { path: out });
  expect(ex.text).toContain('door-lit.json');
  const record = JSON.parse(readFileSync(out.replace(/\.png$/, '.json'), 'utf8'));
  expect(record.picture).toMatchObject({ width: 1280, height: 1805, format: 'png' });

  const cmp = await c.tool('compare', { a: 'photo', b: 'current' });
  expect(cmp.images).toHaveLength(3);
  expect(cmp.text).toMatch(/Mean difference [\d.]+ levels/);

  // True Relief from the side-lit photo, with progress on the way.
  const notes = c.notes.length;
  const m = await c.tool('measure_relief', { photos: [{ path: sun }] });
  console.log(`measure_relief: ${(m.ms / 1000).toFixed(1)} s`);
  expect(m.isError).toBe(false);
  expect(m.text).toContain('Measured the texture');
  expect(m.text).toContain('relief.mode: "estimated" -> "measured"');
  expect(c.notes.slice(notes).some((n) => n.method === 'notifications/progress')).toBe(true);
  expect((await c.tool('render_preview', { width: 640 })).text).toMatch(/Preview 640 x 903 px/);
  expect((await c.tool('undo')).text).toContain('relief.mode: "measured" -> "estimated"');
  expect((await c.tool('reset')).text).toContain('Back to the photo as taken');
  expect((await c.tool('no_such_tool')).isError).toBe(true);
  c.close();

  // The app: the same PNG, the same document, its export.
  await page.goto(APP);
  await page.locator('header input[type=file]').setInputFiles(door);
  await page.waitForFunction((s) => { try { return (window as any).digilight.getDoc().photo.sha256 === s; } catch { return false; } }, record.photo.sha256, { timeout: 60_000 });
  const app = await page.evaluate(async (d) => {
    const dl = (window as any).digilight;
    dl.setDoc(d);
    return (await dl.export({ format: 'png' })).record;
  }, record.document);
  expect(app.photo.sha256).toBe(record.photo.sha256);
  expect(app.photo.pixelsSha256).toBe(record.photo.pixelsSha256);
  expect(app.picture.pixelsSha256).toBe(record.picture.pixelsSha256);

  // The command line verifies the server's record.
  expect(execFileSync(process.execPath, [CLI, 'verify', out.replace(/\.png$/, '.json'), door], { encoding: 'utf8' })).toContain('Verified: the same pixels');
});
