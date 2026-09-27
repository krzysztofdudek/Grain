// The MCP server (`grain-mcp.mjs`) is the grain CLI over another wire: one tool per command, one field per argument
// and flag, generated from the CLI's own command table and run by the CLI itself. The first tests hold the table, the
// usage text, the dispatcher and the tool set together in both directions — a command, a subcommand or a flag that
// one of them has and another lacks fails here. The rest drive the server as a REAL subprocess speaking
// newline-delimited JSON-RPC 2.0 over its stdio, against the shared deterministic fixture
// (tests/fixtures/build-fixture.mjs) other end-to-end tests already build against.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, writeFileSync, chmodSync, readFileSync, readdirSync, cpSync, mkdirSync } from 'node:fs';
import { tmpdir, constants as osConstants } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

import { COMMANDS, GLOBAL_FLAGS, ALIASES, INTERNAL, VALUE_FLAGS } from '../engine/grain-commands.mjs';
import { USAGE } from '../engine/grain-usage.mjs';
import { parseArgv } from '../engine/grain-context.mjs';
import * as mcp from '../bin/grain-mcp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BIN_MCP = join(here, '..', 'bin', 'grain-mcp.mjs');
const BUILDER = join(here, '..', '..', '..', 'tests', 'fixtures', 'build-fixture.mjs');
const WIN = process.platform === 'win32';
let tmp, repo, server;

// a minimal MCP client: newline-delimited JSON-RPC request/response correlation by id, over the child's real stdio
function startServer(cwd, env = process.env) {
  const child = spawn('node', [BIN_MCP], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
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

// ----- parity: the table, the usage text, the dispatcher and the tools say the same thing -----

const TOOLS = mcp.buildTools();
const byName = Object.fromEntries(TOOLS.map(t => [t.name, t]));
const SRC = f => readFileSync(join(here, '..', 'engine', f), 'utf8');

// the commands the dispatcher runs, read from its source — not from the table the tools are built from
function dispatched() {
  const src = SRC('grain.mjs');
  return new Set([...src.matchAll(/case '([\w-]+)':/g), ...src.matchAll(/if \(cmd === '([\w-]+)'\)/g)].map(m => m[1]));
}

test('parity: every command the dispatcher runs is in the table, an alias or an internal hook — and nothing else is', () => {
  const inTable = new Set([...Object.keys(COMMANDS).map(k => k.split(' ')[0]), ...Object.keys(ALIASES), ...Object.keys(INTERNAL)]);
  const run = dispatched();
  assert.ok(run.size >= 25, `read ${run.size} commands from the dispatcher`);
  assert.deepEqual([...run].sort(), [...inTable].sort());
});

test('parity: the subcommands in the table are the ones decide and oracle accept', () => {
  const seed = SRC('grain-seed.mjs');
  const subs = new Set([...seed.matchAll(/sub === '([\w-]+)'/g)].map(m => m[1]));
  const renamed = Object.fromEntries([...seed.matchAll(/const DECIDE_SUBS = \{([^}]*)\}/g)][0][1].split(',').map(p => p.split(':').map(x => x.trim().replace(/'/g, ''))).filter(p => p[1]).map(([a, b]) => [b, a]));
  const decide = [...subs].map(s => renamed[s] || s).sort();
  const table = k => Object.keys(COMMANDS).filter(c => c.startsWith(k + ' ')).map(c => c.slice(k.length + 1)).sort();
  assert.deepEqual(table('decide'), decide);
  const oracle = [...SRC('oracle.mjs').matchAll(/sub !== '([\w-]+)'/g)].map(m => m[1]).sort();
  assert.deepEqual(table('oracle'), oracle);
});

test('parity: the value flags the CLI parses are exactly the ones it parsed before the table existed', () => {
  assert.deepEqual([...VALUE_FLAGS].sort(), ['repo', 'top', 'minbits', 'as', 'content', 'mode', 'map-rows', 'out', 'max-sites', 'surfaces', 'instead-of', 'never-imports', 'weight', 'topic', 'note', 'author', 'range', 'on', 'last', 'runs', 'seed', 'holdout', 'family-candidates', 'graph', 'proposal', 'name'].sort());
  assert.deepEqual(parseArgv(['propose', '--json', 'out.json']).opts, { json: 'out.json' });
  assert.deepEqual(parseArgv(['check', '--json', 'src/a.ts']), { cmd: 'check', args: ['src/a.ts'], opts: { json: true } });
});

test('parity: every usage line belongs to a command in the table, and every command has one', () => {
  const lines = USAGE.split('\n');
  const body = lines.slice(lines.findIndex(l => l.startsWith('usage:')) + 1, lines.findIndex(l => l.startsWith('aliases:')));
  const keys = Object.keys(COMMANDS);
  for (const l of body.filter(l => /^ {2}\S/.test(l))) {
    const syn = l.trim().split(/\s{2,}/)[0];
    assert.ok(keys.some(k => syn === k || syn.startsWith(k + ' ')), `usage line for a command not in the table: ${l}`);
  }
  assert.deepEqual(Object.keys(mcp.usageBlocks()).sort(), [...keys].sort());
  assert.deepEqual(mcp.usageGlobalFlags().sort(), Object.keys(GLOBAL_FLAGS).sort(), 'the usage: line shows the global flags');
});

test('parity: each command\'s usage shows exactly the flags the table gives it, both ways', () => {
  const blocks = mcp.usageBlocks();
  for (const [cmd, spec] of Object.entries(COMMANDS)) {
    const shown = new Set([...blocks[cmd].synopsis.matchAll(/--([a-z][a-z-]*)/g)].map(m => m[1]));
    for (const f of shown) assert.ok(spec.flags[f], `${cmd}: usage shows --${f}, the table does not have it`);
    for (const f of Object.keys(spec.flags)) assert.ok(shown.has(f), `${cmd}: --${f} is in the table, its usage does not show it`);
  }
});

test('parity: every flag the engine reads off the command line is in the table', () => {
  const known = new Set([...Object.values(COMMANDS).flatMap(c => Object.keys(c.flags)), ...Object.keys(GLOBAL_FLAGS), ...Object.values(INTERNAL).flatMap(c => Object.keys(c.flags)), 'help']);
  // option bags that are not the command line: camelCase names, and propose's own `quiet` (set by its callers, never a flag)
  const NOT_FLAGS = new Set(['quiet']);
  const dir = join(here, '..', 'engine');
  const read = new Set();
  for (const f of readdirSync(dir).filter(f => f.endsWith('.mjs')))
    for (const m of readFileSync(join(dir, f), 'utf8').matchAll(/\bopts(?:\.([a-z]+(?:-[a-z]+)*)\b(?![A-Z(])|\[['"]([a-z]+(?:-[a-z]+)*)['"]\])/g)) read.add(m[1] || m[2]);
  assert.ok(read.size >= 40, `read ${read.size} flag names from the engine`);
  const missing = [...read].filter(n => !known.has(n) && !NOT_FLAGS.has(n));
  assert.deepEqual(missing, [], `the engine reads these flags, the command table does not have them: ${missing.join(', ')}`);
});

test('parity: the tool set is the one this release documents — adding or removing a tool is a deliberate edit here', () => {
  assert.deepEqual(TOOLS.map(t => t.name).sort(), [
    'advise', 'check', 'completeness', 'decide_boundary', 'decide_list', 'decide_rm', 'decide_steer', 'decide_waive',
    'explain', 'export', 'help', 'how', 'map', 'obligation', 'oracle_record', 'oracle_score', 'propose', 'refresh',
    'report', 'rules', 'selftest', 'status', 'version', 'what', 'where',
  ].map(n => 'grain_' + n).sort());
  assert.deepEqual(TOOLS.map(t => t.name).sort(), [...Object.keys(COMMANDS).map(mcp.toolName), 'grain_help'].sort(), 'one tool per command, and help');
});

test('parity: each tool has one field per argument and per flag, under the CLI name, and says plainly whether it writes', () => {
  for (const [cmd, spec] of Object.entries(COMMANDS)) {
    const t = byName[mcp.toolName(cmd)];
    const props = t.inputSchema.properties;
    const args = spec.args.map(mcp.argName);
    for (const a of args) assert.ok(!spec.flags[a] && !GLOBAL_FLAGS[a], `${cmd}: argument "${a}" clashes with a flag`);
    assert.deepEqual(Object.keys(props).sort(), [...args, ...Object.keys(spec.flags), ...Object.keys(GLOBAL_FLAGS)].sort(), `${cmd}: fields`);
    for (const [f, kind] of Object.entries({ ...spec.flags, ...GLOBAL_FLAGS }))
      assert.deepEqual(props[f].type, kind === 'bool' ? 'boolean' : kind === 'number' ? ['number', 'string'] : 'string', `${cmd} --${f}`);
    assert.equal(t.annotations.destructiveHint, mcp.DESTRUCTIVE.has(cmd), `${cmd}: destructiveHint`);
    assert.equal(t.inputSchema.additionalProperties, false);
    const writes = !!spec.writes || cmd === 'refresh';
    assert.equal(t.annotations.readOnlyHint, !writes, cmd);
    assert.match(t.description, writes ? /^WRITES / : /^Read-only/, `${cmd}: the description says whether it writes`);
    assert.ok(t.description.includes(`CLI: grain ${cmd}`), `${cmd}: the description carries its usage`);
  }
  for (const d of ['grain_propose', 'grain_rules', 'grain_export', 'grain_decide_rm']) assert.equal(byName[d].annotations.destructiveHint, true, d);
  for (const w of ['grain_propose', 'grain_decide_steer', 'grain_decide_boundary', 'grain_decide_waive', 'grain_decide_rm', 'grain_oracle_record'])
    assert.match(byName[w].description, /^WRITES /, w);
});

test('parity: every field reaches the CLI parser as the flag or argument it names', () => {
  for (const [cmd, spec] of Object.entries(COMMANDS)) {
    const input = {};
    const wantArgs = [];
    for (const a of spec.args) {
      const n = mcp.argName(a);
      const v = (spec.paths || []).includes(n) ? '/abs/--' + n : '--' + n + ' value';
      input[n] = a.endsWith('...') ? [v, v + '2'] : v;
      wantArgs.push(...[].concat(input[n]));
    }
    const wantOpts = {};
    for (const [f, kind] of Object.entries({ ...spec.flags, ...GLOBAL_FLAGS })) {
      input[f] = kind === 'bool' ? true : kind === 'path' ? '/abs/--' + f + '=x' : '--v=1';
      wantOpts[f] = input[f];
    }
    const { cmd: c, args, opts } = parseArgv(mcp.argvFor(cmd, input));
    assert.deepEqual([c, ...args], [...cmd.split(' '), ...wantArgs], `${cmd}: arguments`);
    assert.deepEqual(opts, wantOpts, `${cmd}: flags`);
  }
});

test('invalid input is refused before the CLI runs: unknown field, wrong type, missing or out-of-order argument, relative path', () => {
  const refuses = (cmd, input, re) => assert.throws(() => mcp.argvFor(cmd, input), e => e.code === -32602 && re.test(e.message), `${cmd} ${JSON.stringify(input)}`);
  refuses('status', { bogus: 1 }, /unknown field "bogus"/);
  refuses('status', { json: 'yes' }, /"json" must be true or false/);
  refuses('where', {}, /"query" is required/);
  refuses('completeness', { files: [] }, /non-empty list/);
  refuses('check', { file: '' }, /non-empty string/);
  refuses('status', { repo: 'relative/repo' }, /"repo" must be an absolute path/);
  refuses('rules', { out: 'CONVENTIONS.md' }, /"out" must be an absolute path/);
  refuses('propose', { 'out-dir': 'proposal' }, /"out-dir" must be an absolute path/);
  refuses('propose', { json: true }, /"json" must be an absolute path/);
  refuses('oracle score', { 'name-or-dir': 'some/dir' }, /bare name or an absolute path/);
  assert.deepEqual(mcp.argvFor('oracle score', { 'name-or-dir': 'mine' }), ['oracle', 'score', '--', 'mine']);
  assert.deepEqual(mcp.argvFor('check', { file: 'src/a.ts' }), ['check', '--', 'src/a.ts'], 'a path inside the repository may be relative to its root');
  assert.deepEqual(mcp.argvFor('report', { top: 5 }), ['report', '--top=5'], 'a number is taken as its text');
  assert.deepEqual(mcp.argvFor('report', { top: '5' }), ['report', '--top=5'], 'and so is its text');
  refuses('decide boundary', { from: '/abs/src/a', 'never-imports': 'src/b' }, /"from" is relative to the repository root/);
  refuses('decide boundary', { from: 'src/a', 'never-imports': '/abs/src/b' }, /"never-imports" is relative to the repository root/);
  refuses('check', { file: 'src/a.ts', as: '/abs/src/b.ts' }, /"as" is relative to the repository root/);
  assert.deepEqual(mcp.argvFor('decide waive', { target: 'src/a.ts#run', on: 'p' }), ['decide', 'waive', '--on=p', '--', 'src/a.ts#run'], 'a target keeps its #name');
});

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-mcp-'));
  repo = join(tmp, 'fixture');
  execFileSync('node', [BUILDER, repo], { stdio: 'pipe' });
  // copies taken before anything indexes the fixture: a call on one of them has to build the index first
  for (const name of ['fresh-json', 'fresh-timeout', 'fresh-cancel', 'fresh-close', 'fresh-SIGTERM', 'fresh-SIGINT', 'fresh-SIGHUP', 'fresh-ping']) cpSync(repo, join(tmp, name), { recursive: true });
  server = startServer(repo);
});
after(async () => {
  const exited = server.child.exitCode !== null || server.child.signalCode !== null
    ? Promise.resolve()
    : new Promise(res => server.child.once('exit', res));
  try { server.child.stdin.end(); } catch { /* already closed */ }
  // on Windows `kill` is TerminateProcess of the server alone: a CLI it spawned would keep the fixture open, so the whole tree goes
  if (process.platform === 'win32') try { execFileSync('taskkill', ['/pid', String(server.child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* already gone */ }
  try { server.child.kill(); } catch { /* already dead */ }
  await Promise.race([exited, new Promise(res => setTimeout(res, 10_000))]);
  // Windows keeps a directory busy for a moment after the process holding it died: retry for a while
  rmSync(tmp, { recursive: true, force: true, maxRetries: 40, retryDelay: 250 });
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

test('initialize negotiates the protocol version: a version it speaks comes back as asked, any other gets its own', async () => {
  const old = await server.send('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'old', version: '0' } });
  assert.equal(old.result.protocolVersion, '2024-11-05');
  const future = await server.send('initialize', { protocolVersion: '2099-01-01', capabilities: {}, clientInfo: { name: 'new', version: '0' } });
  assert.equal(future.result.protocolVersion, mcp.PROTOCOL_VERSION);
});

test('a response from the client is not answered, and the server keeps answering', async () => {
  let seen = '';
  const watch = d => { seen += d.toString(); }; // a plain listener: closing a second readline would pause the stream
  server.child.stdout.on('data', watch);
  server.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 'from-client', result: {} }) + '\n');
  const r = await server.send('ping', {});
  server.child.stdout.off('data', watch);
  const stray = seen.split('\n').find(l => l.includes('"from-client"')) || null;
  assert.deepEqual(r.result, {});
  assert.equal(stray, null, `the server answered a client response: ${stray}`);
});

test('tools/list returns every generated tool, each with a valid JSON-Schema inputSchema; the original six keep their names and fields', async () => {
  const r = await server.send('tools/list', {});
  assert.ok(!r.error, JSON.stringify(r));
  const tools = r.result.tools;
  assert.equal(tools.length, TOOLS.length);
  for (const t of tools) {
    assert.equal(typeof t.description, 'string'); assert.ok(t.description.length > 10, `${t.name} needs a real description`);
    assert.equal(t.inputSchema.type, 'object');
    assert.equal(typeof t.inputSchema.properties, 'object');
  }
  const get = n => tools.find(t => t.name === n);
  for (const n of ['grain_where', 'grain_how', 'grain_what']) assert.deepEqual(get(n).inputSchema.required, ['query']);
  assert.equal(get('grain_check').inputSchema.required, undefined); // `file` is optional (J1.5)
  assert.ok(get('grain_how').inputSchema.properties.top && get('grain_report').inputSchema.properties.top);
  for (const n of ['grain_where', 'grain_how', 'grain_what', 'grain_check', 'grain_status', 'grain_report']) assert.ok(get(n).inputSchema.properties.repo, n);
});

test('tools/call grain_where answers a real query the fixture is known to answer', async () => {
  const r = await server.send('tools/call', { name: 'grain_where', arguments: { query: 'handler', json: true } });
  assert.ok(!r.error, JSON.stringify(r));
  assert.equal(r.result.isError, false);
  const data = JSON.parse(r.result.content[0].text);
  assert.equal(data.query, 'handler');
  assert.ok(Array.isArray(data.hits) && data.hits.length > 0, JSON.stringify(data));
  assert.ok(data.hits.some(h => (h.label || '').includes('src/handlers')), `expected a hit naming src/handlers: ${JSON.stringify(data.hits.map(h => h.label))}`);
  assert.ok(data.hits.some(h => h.conventions.some(c => c.statement.includes('@Handler'))), `expected the planted @Handler convention somewhere in the hits: ${JSON.stringify(data.hits.map(h => h.conventions.map(c => c.statement)))}`);
});

test('tools/call grain_check answers valid JSON for a real file', async () => {
  const r = await server.send('tools/call', { name: 'grain_check', arguments: { file: 'src/handlers/order.handler.ts', json: true } });
  assert.ok(!r.error, JSON.stringify(r));
  assert.equal(r.result.isError, false);
  const data = JSON.parse(r.result.content[0].text);
  assert.equal(data.file, 'src/handlers/order.handler.ts');
  assert.equal(typeof data.partition, 'string');
});

test('tools/call grain_check without a "file" argument checks the whole uncommitted change (review --json shape) (J1.5)', async () => {
  const r = await server.send('tools/call', { name: 'grain_check', arguments: { json: true } });
  assert.ok(!r.error, JSON.stringify(r));
  assert.equal(r.result.isError, false);
  const data = JSON.parse(r.result.content[0].text);
  assert.ok(Array.isArray(data.files), JSON.stringify(data));
  assert.ok(Array.isArray(data.findings), JSON.stringify(data));
  assert.equal(typeof data.asOf, 'string');
});

test('tools/call grain_check rejects a non-string "file" argument even though it is now optional (J1.5)', async () => {
  const r = await server.send('tools/call', { name: 'grain_check', arguments: { file: 123 } });
  assert.ok(r.error, JSON.stringify(r));
  assert.equal(r.error.code, -32602);
});

test('tools/call grain_check rejects an empty-string "file" argument even though it is now optional (J1.5)', async () => {
  const r = await server.send('tools/call', { name: 'grain_check', arguments: { file: '' } });
  assert.ok(r.error, JSON.stringify(r));
  assert.equal(r.error.code, -32602);
});

test('tools/call with a deliberately bad tool name is a protocol-level error, not a crash — and the server keeps answering afterward', async () => {
  const bad = await server.send('tools/call', { name: 'grain_bogus_tool', arguments: {} });
  assert.ok(bad.error, JSON.stringify(bad));
  assert.equal(bad.error.code, -32602);
  assert.match(bad.error.message, /grain_bogus_tool/);
  const again = await server.send('tools/call', { name: 'grain_where', arguments: { query: 'handler', json: true } });
  assert.ok(!again.error, JSON.stringify(again));
  assert.equal(JSON.parse(again.result.content[0].text).query, 'handler');
});

test('tools/call with a missing required argument is a clean protocol-level error, not a crash', async () => {
  const r1 = await server.send('tools/call', { name: 'grain_where', arguments: {} });
  assert.ok(r1.error, JSON.stringify(r1)); assert.equal(r1.error.code, -32602);
  const r3 = await server.send('tools/call', { name: 'grain_status', arguments: {} });
  assert.ok(!r3.error, JSON.stringify(r3)); // survives the bad call above
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
  const rs = await server.send('tools/call', { name: 'grain_status', arguments: { json: true } });
  const ds = JSON.parse(rs.result.content[0].text);
  assert.equal(typeof ds.files, 'number'); assert.ok(Array.isArray(ds.partitions));
  const rr = await server.send('tools/call', { name: 'grain_report', arguments: { top: 5, json: true } });
  const dr = JSON.parse(rr.result.content[0].text);
  assert.ok(Array.isArray(dr.partitions));
});

test('tools/call grain_status with a nonexistent repo is a tool EXECUTION error, not a fabricated empty model (G3)', async () => {
  const bad = join(tmp, 'nonexistent-repo-for-mcp');
  assert.equal(existsSync(bad), false);
  const r = await server.send('tools/call', { name: 'grain_status', arguments: { repo: bad } });
  assert.ok(!r.error, JSON.stringify(r));
  assert.equal(r.result.isError, true, `expected isError:true for a bad repo, got: ${JSON.stringify(r.result)}`);
  assert.match(r.result.content[0].text, /no such directory/);
  assert.equal(existsSync(bad), false, 'a bad --repo must not fabricate a directory tree on disk');
  const again = await server.send('tools/call', { name: 'grain_where', arguments: { query: 'handler', json: true } });
  assert.ok(!again.error, JSON.stringify(again));
});

test('tools/call grain_check with a nonexistent repo is still isError: true (regression control — unaffected by the G3 fix)', async () => {
  const bad = join(tmp, 'nonexistent-repo-for-check');
  const r = await server.send('tools/call', { name: 'grain_check', arguments: { repo: bad, file: 'src/handlers/order.handler.ts' } });
  assert.ok(!r.error, JSON.stringify(r));
  assert.equal(r.result.isError, true, `expected isError:true for a bad repo, got: ${JSON.stringify(r.result)}`);
});

test('an unparseable line on stdin gets a JSON-RPC parse error and does not crash the server', async () => {
  server.child.stdin.write('not json at all\n');
  const r = await server.send('ping', {}); // proves the server is still alive and answering after the bad line
  assert.ok(!r.error, JSON.stringify(r));
  assert.deepEqual(r.result, {});
});

test('smoke: the default answer is the CLI text; a relative path over the wire is invalid params; a failing CLI run is isError with its message', async () => {
  const text = await server.send('tools/call', { name: 'grain_status', arguments: {} });
  assert.equal(text.result.isError, false);
  assert.match(text.result.content[0].text, /as of [0-9a-f]{7}/, 'the text answer ends with its stamp, as the CLI prints it');
  const rel = await server.send('tools/call', { name: 'grain_status', arguments: { repo: 'fixture' } });
  assert.equal(rel.error.code, -32602);
  const ver = await server.send('tools/call', { name: 'grain_version', arguments: {} });
  assert.match(ver.result.content[0].text, /^grain \S+ · extractor/);
  const help = await server.send('tools/call', { name: 'grain_help', arguments: {} });
  assert.match(help.result.content[0].text, /^grain — ask a repository/);
});

test('smoke: the writing tools write what the CLI writes — a decision recorded, listed and withdrawn, and rules into an absolute file', async () => {
  const call = async (name, args) => (await server.send('tools/call', { name, arguments: args })).result;
  const added = await call('grain_decide_boundary', { from: 'src/handlers', 'never-imports': 'src/db', note: 'handlers go through services', author: 'mcp-test' });
  assert.equal(added.isError, false, added.content.map(c => c.text).join('\n'));
  assert.ok(existsSync(join(repo, '.grain', 'seeds.jsonl')), 'the decision lands in .grain/seeds.jsonl');
  const listed = await call('grain_decide_list', {});
  const line = listed.content[0].text.split('\n').find(l => l.includes('boundary: src/handlers/ never imports src/db/'));
  assert.ok(line, listed.content[0].text);
  const removed = await call('grain_decide_rm', { id: line.split(/\s+/)[0], author: 'mcp-test' });
  assert.equal(removed.isError, false, removed.content[0].text);
  assert.doesNotMatch((await call('grain_decide_list', {})).content[0].text, /src\/handlers\/ never imports/);
  const gone = await call('grain_decide_rm', { id: 'deadbeef' });
  assert.equal(gone.isError, true, 'a refusal is the CLI\'s non-zero exit');
  assert.match(gone.content.map(c => c.text).join('\n'), /no seed with id deadbeef/);
  const out = join(tmp, 'CONVENTIONS.md');
  const rules = await call('grain_rules', { out, top: 3 });
  assert.equal(rules.isError, false, rules.content.map(c => c.text).join('\n'));
  assert.ok(existsSync(out) && readFileSync(out, 'utf8').length > 0, 'rules wrote the file it was given');
});

test('json: true on a fresh repository whose index gets built: the answer is one parseable block, the build log goes to _meta', async () => {
  const dir = join(tmp, 'fresh-json');
  const r = await server.send('tools/call', { name: 'grain_status', arguments: { repo: dir, json: true } });
  assert.equal(r.result.isError, false, JSON.stringify(r));
  assert.equal(r.result.content.length, 1, `one block only: ${JSON.stringify(r.result.content)}`);
  assert.equal(typeof JSON.parse(r.result.content[0].text).files, 'number');
  assert.equal(typeof r.result._meta?.['grain/stderr'], 'string', 'the build said something on stderr, and it is kept in _meta');
});

test('with no repo given the answer names the repository found from the server\'s working directory; with one given it does not', async () => {
  const text = await server.send('tools/call', { name: 'grain_status', arguments: {} });
  const last = text.result.content.at(-1).text;
  assert.match(last, /^repo: .*fixture \(no repo given — found from the server's working directory /);
  const json = await server.send('tools/call', { name: 'grain_status', arguments: { json: true } });
  assert.equal(json.result.content.length, 1);
  assert.match(json.result._meta['grain/repo'], /no repo given/);
  const given = await server.send('tools/call', { name: 'grain_status', arguments: { repo } });
  assert.ok(!given.result.content.some(c => /no repo given/.test(c.text)));
});

test('a bare oracle name resolves in the repository, not where the server was started', async () => {
  const srv = startServer(tmp);
  try {
    await srv.send('initialize', {});
    const r = await srv.send('tools/call', { name: 'grain_oracle_score', arguments: { 'name-or-dir': 'no-such-oracle', repo } });
    assert.equal(r.result.isError, true);
    assert.ok(r.result.content.map(c => c.text).join('\n').includes(join(repo, 'no-such-oracle')), JSON.stringify(r.result.content));
  } finally { try { srv.child.stdin.end(); } catch { /* closed */ } }
});

// ----- stopping a CLI run: timeout, cancellation, the client going away -----

// the CLI processes still running for one repository (its --repo=<dir> is on their command line, parent and the
// --liftoff-only grandchild alike)
// (every process as `pid ppid command`: ps, or on Windows the process table through PowerShell)
const processes = () => (WIN
  ? execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId) $($_.CommandLine)" }'], { encoding: 'utf8', windowsHide: true })
  : execFileSync('ps', ['-Ao', 'pid=,ppid=,command='], { encoding: 'utf8' }))
  .split(/\r?\n/).filter(l => l.trim())
  .map(l => { const [pid, ppid, ...cmd] = l.trim().split(/\s+/); return { pid: +pid, ppid: +ppid, cmd: cmd.join(' ') }; });
const cliFor = dir => processes().map(p => p.cmd).filter(l => l.includes('grain.mjs') && l.includes(`--repo=${dir}`));
const until = async (cond, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { if (cond()) return true; await new Promise(r => setTimeout(r, 50)); } return cond(); };
const stopServer = srv => { try { srv.child.stdin.end(); } catch { /* closed */ } try { srv.child.kill(); } catch { /* dead */ } };

test('a CLI run past its timeout is stopped with its whole process group, answered as isError, and the server keeps answering', async () => {
  const dir = join(tmp, 'fresh-timeout');
  const srv = startServer(tmp, { ...process.env, GRAIN_MCP_TIMEOUT_MS: '400' });
  try {
    await srv.send('initialize', {});
    const r = await srv.send('tools/call', { name: 'grain_status', arguments: { repo: dir } });
    assert.equal(r.result.isError, true, JSON.stringify(r));
    assert.match(r.result.content[0].text, /did not finish within 0 s and was stopped.*GRAIN_MCP_TIMEOUT_MS/);
    assert.ok(await until(() => cliFor(dir).length === 0), `the CLI and its --liftoff-only child are gone: ${cliFor(dir).join('\n')}`);
    assert.deepEqual((await srv.send('ping', {})).result, {});
  } finally { stopServer(srv); }
  assert.equal(mcp.timeoutFor('where', {}), 600_000);
  assert.equal(mcp.timeoutFor('propose', {}), 3_600_000);
  assert.equal(mcp.timeoutFor('selftest', { GRAIN_MCP_LONG_TIMEOUT_MS: '5' }), 5);
});

test('notifications/cancelled stops the running CLI with its process group, and the cancelled request gets no answer', async () => {
  const dir = join(tmp, 'fresh-cancel');
  const srv = startServer(tmp);
  let seen = '';
  srv.child.stdout.on('data', d => { seen += d.toString(); });
  try {
    await srv.send('initialize', {});
    srv.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 'slow', method: 'tools/call', params: { name: 'grain_status', arguments: { repo: dir } } }) + '\n');
    assert.ok(await until(() => cliFor(dir).length > 0), 'the CLI started');
    srv.notify('notifications/cancelled', { requestId: 'slow', reason: 'test' });
    assert.ok(await until(() => cliFor(dir).length === 0), `the CLI and its --liftoff-only child are gone: ${cliFor(dir).join('\n')}`);
    assert.deepEqual((await srv.send('ping', {})).result, {});
    assert.ok(!seen.includes('"slow"'), `a cancelled request is not answered: ${seen}`);
  } finally { stopServer(srv); }
});

test('when the client closes stdin, the running CLI is stopped and the server exits', async () => {
  const dir = join(tmp, 'fresh-close');
  const srv = startServer(tmp);
  await srv.send('initialize', {});
  srv.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 'left', method: 'tools/call', params: { name: 'grain_status', arguments: { repo: dir } } }) + '\n');
  assert.ok(await until(() => cliFor(dir).length > 0), 'the CLI started');
  const exited = new Promise(r => srv.child.on('exit', r));
  srv.child.stdin.end();
  await exited;
  assert.ok(await until(() => cliFor(dir).length === 0), `the CLI and its --liftoff-only child are gone: ${cliFor(dir).join('\n')}`);
});

// A CLI that cannot finish on its own (issue 454): a `git` first on the PATH that never returns, so the first git call
// of the build blocks for as long as nobody kills it. It writes nothing, so it cannot die on a closed pipe either —
// once the server is gone, the only way this CLI ends is being killed. "Gone" below therefore means "stopped by the
// server", on a machine of any speed. The server itself runs no git, so only the CLI hangs.
function hangingGitPath() {
  const bin = join(tmp, 'hanging-git');
  if (!existsSync(join(bin, 'git'))) {
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'git'), '#!/bin/sh\nexec sleep 86400\n');
    chmodSync(join(bin, 'git'), 0o755);
  }
  return `${bin}:${process.env.PATH}`;
}
// what a failing run leaves behind: the CLI, its --liftoff-only child and the sleeping git under them — found by
// ancestry, since a server that never detached the CLI left no process group to kill
const killLeftovers = dir => {
  const procs = processes();
  const doomed = new Set(procs.filter(p => p.cmd.includes('grain.mjs') && p.cmd.includes(`--repo=${dir}`)).map(p => p.pid));
  for (let grew = true; grew; ) { grew = false; for (const p of procs) if (doomed.has(p.ppid) && !doomed.has(p.pid)) { doomed.add(p.pid); grew = true; } }
  for (const pid of doomed) try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ }
};

// Windows delivers none of the three to a child: `kill` there is TerminateProcess, which no handler sees (the server's
// signal handlers are POSIX-only, as documented in docs/reference.md), and a sh script cannot stand in for git.
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP'])
  test(`${sig} to the server stops the running CLI with its process group, and the server exits`, { skip: WIN && 'POSIX signals: Windows terminates a process without running its handlers' }, async () => {
    const dir = join(tmp, `fresh-${sig}`);
    const srv = startServer(tmp, { ...process.env, PATH: hangingGitPath() });
    try {
      await srv.send('initialize', {});
      srv.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 'killed', method: 'tools/call', params: { name: 'grain_status', arguments: { repo: dir } } }) + '\n');
      assert.ok(await until(() => cliFor(dir).length > 0), 'the CLI started');
      const exited = new Promise(r => srv.child.on('exit', (code, signal) => r({ code, signal })));
      srv.child.kill(sig);
      const how = await exited;
      // the CLI is blocked in git and would never end by itself: gone within the deadline means the server killed it
      assert.ok(await until(() => cliFor(dir).length === 0, 30_000), `the CLI and its --liftoff-only child are gone: ${cliFor(dir).join('\n')}`);
      assert.equal(how.signal, null, `the server handled ${sig} and exited on its own, not by the default action: ${JSON.stringify(how)}`);
      assert.equal(how.code, 128 + osConstants.signals[sig], `the server exits as the signal would: ${JSON.stringify(how)}`);
    } finally { stopServer(srv); killLeftovers(dir); }
  });

// a raw request with a chosen id, and the one answer to it (or null if none comes within ms)
function rawCall(srv, id, method, params, ms = 15000) {
  return new Promise(res => {
    let buf = '';
    const t = setTimeout(() => { srv.child.stdout.off('data', on); res(null); }, ms);
    const on = d => {
      buf += d.toString();
      for (const l of buf.split('\n')) {
        let m; try { m = JSON.parse(l); } catch { continue; }
        if (m && m.id === id) { clearTimeout(t); srv.child.stdout.off('data', on); res(m); return; }
      }
    };
    srv.child.stdout.on('data', on);
    srv.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

test('ping and tools/list are answered at once while a tools/call runs, not in turn behind it', async () => {
  const dir = join(tmp, 'fresh-ping');
  const srv = startServer(tmp);
  try {
    await srv.send('initialize', {});
    let slowDone = false;
    const slow = rawCall(srv, 'slow-build', 'tools/call', { name: 'grain_status', arguments: { repo: dir } }, 60000).then(r => { slowDone = true; return r; });
    assert.ok(await until(() => cliFor(dir).length > 0), 'the CLI started');
    const ping = await srv.send('ping', {});
    assert.deepEqual(ping.result, {});
    const list = await srv.send('tools/list', {});
    assert.equal(list.result.tools.length, TOOLS.length);
    assert.equal(slowDone, false, 'ping and tools/list came back before the running call finished');
    assert.ok(cliFor(dir).length > 0, 'the call was still running when they were answered');
    assert.equal((await slow).result.isError, false);
  } finally { stopServer(srv); }
});

test('a cancel for a request already answered, or never sent, does not drop a later request that reuses its id', async () => {
  const srv = startServer(tmp);
  try {
    await srv.send('initialize', {});
    const first = await rawCall(srv, 'reused', 'tools/call', { name: 'grain_version', arguments: {} });
    assert.equal(first.result.isError, false);
    srv.notify('notifications/cancelled', { requestId: 'reused', reason: 'too late' }); // arrives after the answer
    srv.notify('notifications/cancelled', { requestId: 'not-yet', reason: 'never in flight' });
    await srv.send('ping', {});
    const again = await rawCall(srv, 'reused', 'tools/call', { name: 'grain_version', arguments: {} }, 5000);
    assert.ok(again, 'the second request with the same id is answered');
    assert.equal(again.result.isError, false);
    const later = await rawCall(srv, 'not-yet', 'tools/call', { name: 'grain_version', arguments: {} }, 5000);
    assert.ok(later, 'a request whose id was cancelled before it was ever sent is answered');
  } finally { stopServer(srv); }
});

test('a cancel for a queued tools/call drops it; its id is free again afterwards', async () => {
  const srv = startServer(repo);
  let seen = '';
  srv.child.stdout.on('data', d => { seen += d.toString(); });
  try {
    await srv.send('initialize', {});
    const running = rawCall(srv, 'q-running', 'tools/call', { name: 'grain_status', arguments: { json: true } });
    srv.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 'q-waiting', method: 'tools/call', params: { name: 'grain_version', arguments: {} } }) + '\n');
    srv.notify('notifications/cancelled', { requestId: 'q-waiting', reason: 'test' });
    assert.equal((await running).result.isError, false);
    await srv.send('tools/call', { name: 'grain_version', arguments: {} }); // behind the dropped one in the queue
    assert.ok(!seen.includes('"q-waiting"'), `the cancelled queued request is not answered: ${seen}`);
    const reused = await rawCall(srv, 'q-waiting', 'tools/call', { name: 'grain_version', arguments: {} }, 5000);
    assert.ok(reused, 'its id, reused, is answered');
  } finally { stopServer(srv); }
});

test('grain_export without out answers one parseable JSON block; the stamp on stderr goes to _meta', async () => {
  const r = await server.send('tools/call', { name: 'grain_export', arguments: { repo, 'max-sites': 2, compact: true } });
  assert.equal(r.result.isError, false, JSON.stringify(r).slice(0, 500));
  assert.equal(r.result.content.length, 1, `one block only: ${r.result.content.map(c => c.text.slice(0, 80)).join(' | ')}`);
  assert.equal(typeof JSON.parse(r.result.content[0].text), 'object');
  assert.match(r.result._meta?.['grain/stderr'] || '', /as of/);
  const out = join(tmp, 'export.json');
  const w = await server.send('tools/call', { name: 'grain_export', arguments: { repo, out, 'max-sites': 2 } });
  assert.match(w.result.content[0].text, /^export /, 'with out, the answer is the text line naming the file');
  assert.ok(existsSync(out));
});

test('every command that prints JSON without a json field is declared so in the table', () => {
  // export prints its JSON on stdout by default; a command that does the same must say so, or its answer splits in two
  const declared = Object.entries(COMMANDS).filter(([, s]) => s.stdoutJson).map(([c]) => c);
  assert.deepEqual(declared, ['export']);
  assert.equal(mcp.answersJson('export', {}), true);
  assert.equal(mcp.answersJson('export', { out: '/abs/x.json' }), false);
  assert.equal(mcp.answersJson('status', { json: true }), true);
  assert.equal(mcp.answersJson('status', {}), false);
  assert.equal(mcp.answersJson('propose', { json: '/abs/r.json' }), false, 'propose --json names a file; its stdout stays text');
});

// Every command in the table, not a sample (issue 454): a command left out of `calls` fails the test, so a new command
// must say here how it is called. Each call has to succeed — an error result's text is the refusal, which proves
// nothing about what the command prints — and none of them may answer JSON when no json was asked for. The writing
// commands run on their own copy of the indexed fixture, so the shared one is left as the other tests expect it.
test('every command not declared stdoutJson prints text, not JSON, when no json is asked for — all of them', async () => {
  const own = join(tmp, 'stdout-json');
  execFileSync('cp', ['-R', repo, own]);
  const file = 'src/handlers/order.handler.ts';
  const prop = join(tmp, 'stdout-json-proposal');
  const calls = {
    where: { query: 'handler' },
    how: { query: 'handler' },
    what: { query: 'handler' },
    map: {},
    obligation: { path: file },
    check: { file },
    completeness: { files: [file] },
    explain: { file },
    status: {},
    report: { top: 3 },
    rules: { top: 3 },
    propose: { 'out-dir': prop },
    advise: {},
    'oracle record': { proposal: prop, graph: join(prop, '.yggdrasil'), name: 'stdout-json', out: join(tmp, 'stdout-json-oracles'), yes: true },
    'oracle score': { 'name-or-dir': join(tmp, 'stdout-json-oracles', 'stdout-json') },
    'decide steer': { target: `${file}#handle`, surfaces: 'auto.call:validate', note: 'handlers validate first', author: 'mcp-test' },
    'decide boundary': { from: 'src/handlers', 'never-imports': 'src/db', note: 'handlers go through services', author: 'mcp-test' },
    'decide waive': { target: `${file}#handle`, on: 'auto.arity', note: 'one command object', author: 'mcp-test' },
    'decide list': {},
    'decide rm': null, // the id of the boundary recorded above, read off decide list
    selftest: { how: true, last: 2 },
    refresh: {},
    version: {},
  };
  const printers = Object.entries(COMMANDS).filter(([, spec]) => !spec.stdoutJson).map(([c]) => c);
  assert.deepEqual(Object.keys(calls).sort(), printers.sort(), 'every command the table has, and no other, is called here');
  assert.equal(printers.length + 1, Object.keys(COMMANDS).length, 'with export, every command in the table');
  for (const [cmd, given] of Object.entries(calls)) {
    let input = given;
    if (cmd === 'decide rm') {
      const listed = (await mcp.callTool(mcp.toolName('decide list'), { repo: own })).content[0].text;
      input = { id: listed.split('\n').find(l => l.includes('never imports src/db/')).trim().split(/\s+/)[0], author: 'mcp-test' };
    }
    const r = await mcp.callTool(mcp.toolName(cmd), { ...input, repo: own });
    const text = r.content[0].text;
    assert.equal(r.isError, false, `${cmd} failed, so its output proves nothing: ${text.slice(0, 300)}`);
    let parsed = false;
    try { JSON.parse(text); parsed = true; } catch { /* text, as expected */ }
    assert.equal(parsed, false, `${cmd} printed JSON with no json asked for — mark it stdoutJson in the table: ${text.slice(0, 120)}`);
  }
});

// The repository open in a dev container: the agent names the repo AND the file by their container
// paths. Both are translated through the running container's mounts, so grain_check answers for the
// file rather than refusing a path that only exists inside the container.
test('grain_check with a container repo path and a container file path answers for the file', { skip: WIN && 'the stand-in docker is a shebang script; Windows runs only an .exe from PATH' }, async () => {
  const bin = join(tmp, 'docker-bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, 'docker'), `#!/usr/bin/env node
const a = process.argv.slice(2);
if (a[0] === 'ps') { console.log('abc123'); process.exit(0); }
if (a[0] === 'inspect') { console.log(${JSON.stringify(JSON.stringify([{ Type: 'bind', Source: '__REPO__', Destination: '/workspaces/app' }]))}.replace('__REPO__', ${JSON.stringify(repo)})); process.exit(0); }
process.exit(1);
`);
  chmodSync(join(bin, 'docker'), 0o755);
  const file = execFileSync('git', ['ls-files'], { cwd: repo, encoding: 'utf8' }).split('\n').find(f => /\.(ts|js|mjs)$/.test(f));
  assert.ok(file, 'the fixture has a source file to check');
  const srv = startServer(tmp, { ...process.env, PATH: `${bin}:${process.env.PATH}` });
  try {
    await srv.send('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } });
    const r = await srv.send('tools/call', { name: 'grain_check', arguments: { repo: '/workspaces/app', file: `/workspaces/app/${file}` } });
    assert.ok(!r.error, JSON.stringify(r));
    assert.notEqual(r.result.isError, true, r.result.content?.[0]?.text);
  } finally {
    try { srv.child.stdin.end(); } catch { /* closed */ }
    try { srv.child.kill(); } catch { /* dead */ }
  }
});
