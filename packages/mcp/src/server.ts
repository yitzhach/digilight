#!/usr/bin/env node
// server.ts — DigiLight's MCP server for AI agents on this computer (BUILD.md Phase 7): JSON-RPC
// 2.0 over stdio, one message a line, written here (the protocol's part a tool server needs is
// small: initialize, tools/list, tools/call, ping; D-080). Requests run one at a time, in order,
// so the document never sees two changes at once. Logs go to stderr; stdout carries only messages.
// Run: node packages/mcp/src/server.ts

import { createInterface } from 'node:readline';
import { Session } from './session.ts';
import { INSTRUCTIONS, TOOLS } from './tools.ts';

const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
type Id = string | number | null;
interface Message { jsonrpc?: string; id?: Id; method?: string; params?: Record<string, unknown> }

const session = new Session();
const send = (m: object) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...m })}\n`);

async function call(params: Record<string, unknown> | undefined): Promise<object> {
  const name = params?.name, tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { content: [{ type: 'text', text: `No tool "${String(name)}". The tools are ${TOOLS.map((t) => t.name).join(', ')}.` }], isError: true };
  const token = (params?._meta as { progressToken?: string | number } | undefined)?.progressToken;
  let step = 0;
  const progress = (message: string) => { if (token !== undefined) send({ method: 'notifications/progress', params: { progressToken: token, progress: ++step, message } }); };
  try {
    const r = await tool.run(session, (params?.arguments as Record<string, unknown> | undefined) ?? {}, progress);
    return { content: [{ type: 'text', text: r.text }, ...(r.pictures ?? []).map((p) => ({ type: 'image', data: p.data.toString('base64'), mimeType: p.mimeType }))] };
  } catch (e) {
    return { content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }], isError: true };
  }
}

async function handle(line: string): Promise<void> {
  let m: Message;
  try { m = JSON.parse(line) as Message; } catch { send({ id: null, error: { code: -32700, message: 'Parse error: one JSON-RPC message a line' } }); return; }
  if (!m || typeof m !== 'object' || Array.isArray(m)) { send({ id: null, error: { code: -32600, message: 'Invalid request' } }); return; }
  if (m.id === undefined) return; // a notification (initialized, cancelled): nothing to answer
  const ok = (result: object) => send({ id: m.id, result });
  switch (m.method) {
    case 'initialize': {
      const asked = m.params?.protocolVersion as string | undefined;
      ok({ protocolVersion: asked && VERSIONS.includes(asked) ? asked : VERSIONS[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'digilight', title: 'DigiLight', version: '2.0.0' }, instructions: INSTRUCTIONS });
      return;
    }
    case 'ping': ok({}); return;
    case 'tools/list':
      ok({ tools: TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: { title: t.title, readOnlyHint: !!t.readOnly, destructiveHint: false, openWorldHint: false } })) });
      return;
    case 'tools/call': ok(await call(m.params)); return;
    default: send({ id: m.id, error: { code: -32601, message: `Method not found: ${String(m.method)}` } });
  }
}

let queue = Promise.resolve();
createInterface({ input: process.stdin }).on('line', (line) => {
  if (line.trim()) queue = queue.then(() => handle(line)).catch((e: unknown) => { process.stderr.write(`digilight: ${String(e)}\n`); });
});
