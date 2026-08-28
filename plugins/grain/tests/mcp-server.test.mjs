// The MCP server (`grain-mcp.mjs`) is a thin protocol adapter over the exact `cmd*` functions the CLI already
// calls — this drives it as a REAL subprocess speaking real newline-delimited JSON-RPC 2.0 over its stdio, the
// same "spawn it, drive its piped stdio" technique this project's own hook tests already use (check-hook.test.mjs),
// just speaking the MCP wire format instead of a single hook payload, against the shared deterministic fixture
// (tests/fixtures/build-fixture.mjs) other end-to-end tests already build against.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const here = dirname(fileURLToPath(import.meta.url));
const BIN_MCP = join(here, '..', 'bin', 'grain-mcp.mjs');
const BUILDER = join(here, '..', '..', '..', 'tests', 'fixtures', 'build-fixture.mjs');
let tmp, repo, server;

// a minimal MCP client: newline-delimited JSON-RPC request/response correlation by id, over the child's real stdio
function startServer(cwd) {
  const child = spawn('node', [BIN_MCP], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const pending = new Map(); let nextId = 1; let stderrBuf = '';
  child.stderr.on('data', d => { stderrBuf += d.toString(); });
  rl.on('line', line => {
    if (!line.trim()) return;
    let msg; try { msg = JSON.parse(line); } catch { return; }
    if (msg && Object.prototype.hasOwnProperty.call(msg, 'id') && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  const send = (method, params) => { const id = nextId++;
    const p = new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timed out waiting for a response to "${method}" — stderr so far:\n${stderrBuf}`)), 15000);
      pending.set(id, msg => { clearTimeout(t); resolve(msg); }); });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); return p; };
  const notify = (method, params) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  return { send, notify, child, stderr: () => stderrBuf };
}

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-mcp-'));
  repo = join(tmp, 'fixture');
  execFileSync('node', [BUILDER, repo], { stdio: 'pipe' });
  server = startServer(repo);
});
after(() => {
  try { server.child.stdin.end(); } catch { /* already closed */ }
  try { server.child.kill(); } catch { /* already dead */ }
  rmSync(tmp, { recursive: true, force: true });
});

test('initialize handshake: a valid protocol version, the tools capability, and server info', async () => {
  const r = await server.send('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test-client', version: '0.0.0' } });
  assert.ok(!r.error, JSON.stringify(r));
  assert.equal(typeof r.result.protocolVersion, 'string');
  assert.deepEqual(r.result.capabilities.tools, {});
  assert.equal(r.result.serverInfo.name, 'grain');
  assert.equal(typeof r.result.serverInfo.version, 'string');
  server.notify('notifications/initialized', {}); // a notification: no response is sent for this, by design — the next request proves the server is still fine with that
});

test('tools/list returns exactly the four curated tools, each with a valid JSON-Schema inputSchema', async () => {
  const r = await server.send('tools/list', {});
  assert.ok(!r.error, JSON.stringify(r));
  const tools = r.result.tools;
  assert.deepEqual(tools.map(t => t.name).sort(), ['grain_check', 'grain_report', 'grain_status', 'grain_where']);
  for (const t of tools) {
    assert.equal(typeof t.description, 'string'); assert.ok(t.description.length > 10, `${t.name} needs a real description`);
    assert.equal(t.inputSchema.type, 'object');
    assert.equal(typeof t.inputSchema.properties, 'object');
  }
  assert.deepEqual(tools.find(t => t.name === 'grain_where').inputSchema.required, ['query']);
  assert.deepEqual(tools.find(t => t.name === 'grain_check').inputSchema.required, ['file']);
});

test('tools/call grain_where answers a real query the fixture is known to answer', async () => {
  const r = await server.send('tools/call', { name: 'grain_where', arguments: { query: 'handler' } });
  assert.ok(!r.error, JSON.stringify(r));
  assert.equal(r.result.isError, false);
  const data = JSON.parse(r.result.content[0].text);
  assert.equal(data.query, 'handler');
  assert.ok(Array.isArray(data.hits) && data.hits.length > 0, JSON.stringify(data));
  assert.ok(data.hits.some(h => (h.label || '').includes('src/handlers')), `expected a hit naming src/handlers: ${JSON.stringify(data.hits.map(h => h.label))}`);
  assert.ok(data.hits.some(h => h.conventions.some(c => c.statement.includes('@Handler'))), `expected the planted @Handler convention somewhere in the hits: ${JSON.stringify(data.hits.map(h => h.conventions.map(c => c.statement)))}`);
});

test('tools/call grain_check answers valid JSON for a real file', async () => {
  const r = await server.send('tools/call', { name: 'grain_check', arguments: { file: 'src/handlers/order.handler.ts' } });
  assert.ok(!r.error, JSON.stringify(r));
  assert.equal(r.result.isError, false);
  const data = JSON.parse(r.result.content[0].text);
  assert.equal(data.file, 'src/handlers/order.handler.ts');
  assert.equal(typeof data.partition, 'string');
});

test('tools/call with a deliberately bad tool name is a protocol-level error, not a crash — and the server keeps answering afterward', async () => {
  const bad = await server.send('tools/call', { name: 'grain_bogus_tool', arguments: {} });
  assert.ok(bad.error, JSON.stringify(bad));
  assert.equal(bad.error.code, -32602);
  assert.match(bad.error.message, /grain_bogus_tool/);
  const again = await server.send('tools/call', { name: 'grain_where', arguments: { query: 'handler' } });
  assert.ok(!again.error, JSON.stringify(again));
  assert.equal(JSON.parse(again.result.content[0].text).query, 'handler');
});

test('tools/call with a missing required argument is a clean protocol-level error, not a crash', async () => {
  const r1 = await server.send('tools/call', { name: 'grain_where', arguments: {} });
  assert.ok(r1.error, JSON.stringify(r1)); assert.equal(r1.error.code, -32602);
  const r2 = await server.send('tools/call', { name: 'grain_check', arguments: {} });
  assert.ok(r2.error, JSON.stringify(r2)); assert.equal(r2.error.code, -32602);
  const r3 = await server.send('tools/call', { name: 'grain_status', arguments: {} });
  assert.ok(!r3.error, JSON.stringify(r3)); // survives both bad calls above
});

test('tools/call grain_check on a file that does not exist is a tool EXECUTION error (isError: true), not a protocol error and not a crash', async () => {
  const r = await server.send('tools/call', { name: 'grain_check', arguments: { file: 'src/does/not/exist.ts' } });
  assert.ok(!r.error, JSON.stringify(r));
  assert.equal(r.result.isError, true);
  assert.match(r.result.content[0].text, /no such file/);
  const again = await server.send('tools/call', { name: 'grain_status', arguments: {} });
  assert.ok(!again.error, JSON.stringify(again));
});

test('tools/call grain_status and grain_report answer valid, well-shaped JSON', async () => {
  const rs = await server.send('tools/call', { name: 'grain_status', arguments: {} });
  const ds = JSON.parse(rs.result.content[0].text);
  assert.equal(typeof ds.files, 'number'); assert.ok(Array.isArray(ds.partitions));
  const rr = await server.send('tools/call', { name: 'grain_report', arguments: { top: 5 } });
  const dr = JSON.parse(rr.result.content[0].text);
  assert.ok(Array.isArray(dr.partitions));
});

test('an unparseable line on stdin gets a JSON-RPC parse error and does not crash the server', async () => {
  server.child.stdin.write('not json at all\n');
  const r = await server.send('ping', {}); // proves the server is still alive and answering after the bad line
  assert.ok(!r.error, JSON.stringify(r));
  assert.deepEqual(r.result, {});
});
