#!/usr/bin/env node
// grain MCP server — the grain CLI over another wire: a protocol adapter, not a second implementation.
//
// Every tool is generated from the CLI's own command table (engine/grain-commands.mjs) and its usage text
// (engine/grain-usage.mjs): one tool per command, grain_<command> (a subcommand joins with `_`: grain_decide_steer),
// one field per argument and per flag under the flag's own name (map-rows, no-refresh, instead-of). A call is turned
// back into the argv the CLI would get and run by the CLI itself, `bin/grain.mjs`, as a child process: its stdout is
// the answer (the JSON `--json` prints, with json: true), its stderr a second block, and a non-zero exit comes back
// with isError: true. Running the CLI rather than its functions in this process keeps the two identical by
// construction, and lets each query run under the CLI's low-memory `--liftoff-only` mode instead of holding the
// optimising compiler's memory for the whole session.
//
// Paths: a field the CLI resolves against its working directory (repo, out, content, graph, …) must be absolute,
// since this server does not run in the caller's directory; a path inside the repository (check's file,
// obligation's path, …) may also be relative to the repository root. An absolute path from inside a dev container
// is translated to the host directory a running container mounts there, as the CLI does for `--repo`.
//
// Wire format: newline-delimited JSON-RPC 2.0 on stdin/stdout (MCP stdio transport); stderr is for diagnostics.
import { createInterface } from 'node:readline';
import { existsSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { COMMANDS, GLOBAL_FLAGS } from '../engine/grain-commands.mjs';
import { USAGE } from '../engine/grain-usage.mjs';
import { hostPathFor, findRoot } from '../engine/grain-context.mjs';
import { ENGINE_VERSION } from '../engine/config.mjs';

export const PROTOCOL_VERSION = '2025-06-18';
// The versions this server can speak: it uses nothing a later one added beyond tool annotations, which an older
// client ignores. A client asking for one of these gets it back; any other gets PROTOCOL_VERSION.
export const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'grain', version: ENGINE_VERSION };
const BIN = fileURLToPath(new URL('./grain.mjs', import.meta.url));
const STDERR_LINES = 40; // a first build logs its progress on stderr; the answer needs only the end of it

export const TOOL_PREFIX = 'grain_';
export const toolName = cmd => TOOL_PREFIX + cmd.replace(/[ -]/g, '_');
export const argName = a => a.replace(/[?.]+$/, '');
const optional = a => a.endsWith('?');
const variadic = a => a.endsWith('...');

// When to reach for a tool, for the questions an agent asks mid-task: the usage text says what a command does, this
// says when it is the right one. Only guidance lives here; every field still comes from the table.
const WHEN = {
  where:
    'Call this BEFORE creating a new source file, or whenever it is unclear where new code belongs. Use the repository\'s own vocabulary (a decorator, a base type, a file or function name), not a paraphrase of it.',
  how: 'Call this when the question is "what does a change like this involve here", not "where does this one thing live" (that is grain_where). Answers from real commits only; it says so plainly when no past change matches.',
  what: 'Call this when the question is "what is this concept in this codebase already", not "where should new code go" (grain_where) or "what did past changes touching it look like" (grain_how).',
  check: 'Call this AFTER writing or editing a file. Leave out "file" to check the whole uncommitted change instead (the CLI\'s `review`).',
  obligation: 'Call this before creating a file at a path, to see what such a file has historically come with.',
  completeness:
    'Call this before considering a change done, with the files you touched. Input: "files", one or more paths inside the repository. Answers from commit history only (nothing parsed, any file type). With json: true it returns { files: [{ file, partners, ambient }], partners, ambient, asOf, dirtyTree? }: `files` gives each input file its own partners (the other inputs left out), `partners` and `ambient` are the merged lists the text prints. A partner is { file, sup, commits, bits, dead }: `sup` of the edited file\'s `commits` commits also touched it, `bits` is the evidence it beats chance, `dead` means it no longer exists at HEAD. An ambient entry is { file, k, n, share, dead }: a file touched by `k` of all `n` commits, named because the repository touches it with almost everything, not because of these files. Every list holds at most 5, as the text does. An empty `partners` means no file changes with these more often than it changes anyway — not that the change is complete.',
  advise:
    'Call this on a repository that ALREADY has a Yggdrasil graph (.yggdrasil/, or "graph" for one held beside the repository) to read what its history and imports say about that graph; it never reads a proposal and never writes. With json: true it returns the grain-advice/1 document { schema, repo, at, items[] }: an item is { kind: "split", nodes: [node], candidates: [dir…], evidence, text } — a node whose own files a finer cut beats (evidence.candidates[].reason is "tighter" or "unread") — or { kind: "relation", nodes: [a, b], confidence, evidence: { coChanged, ofA, ofB, declared, declaredVia? }, text } — two nodes whose code changes together, listed as data, not advice. With no graph it returns no items and a note saying so. The text answer lists the splits and only counts the relations.',
  propose:
    'Call this to mine a first Yggdrasil graph for a repository from its code and full git history. Input: "out-dir", an absolute directory (default .yggdrasil-proposal/ at the repository root; your own .yggdrasil/ is refused). It WRITES there: the .yggdrasil/ tree (node types, nodes, relations, aspects and mined rules with their evidence), PROPOSAL.md (the architecture, the rules a real `yg drill` proved, the candidates), REFACTOR-BACKLOG.md (each dependency cycle and the weakest dependency left out to break it), alternatives.md, sizing.json and proposal.json (schema grain-proposal/1), plus the family-without-law signal `yg advise` reads (.yggdrasil/.family-candidates.grain.json; "family-candidates" moves it, "no-family-candidates" drops it). "json" names an absolute path to write the report as JSON as well; "full" adds every draft it kept back; "holdout" (YYYY-MM-DD) cuts each rule\'s drill cases only from code first seen after that date, so a passing drill tests the rule on code it was not mined from (without it the report says the drills prove only the count). Nothing is adopted: accepting the proposal is `yg adopt <out-dir>`, whose command the report names. Rebuilding a proposal is slow on a large repository.',
  export:
    'Call this for the whole mined model as one JSON document (schema grain-export/1): every convention with all its sites, anchors and trends, the partitions and their groups, markers and directories, the module graph and its dependency edges, architecture norms, commit shapes, co-change pairs, value sets and the maintainer decisions in force. It answers in the tool result unless "out" names an absolute file to write it to instead. "max-sites" caps the sites listed per convention (default 300), "no-anchors" leaves out the source lines, "compact" prints it on one line. It is large: prefer grain_map, grain_report or grain_advise when one of them answers the question.',
};

// Each command's lines of the usage text: its synopsis (up to the first run of two spaces) and its description,
// whitespace collapsed. A command with several lines (selftest) gets them all.
export function usageBlocks(usage = USAGE) {
  const lines = usage.split('\n');
  const start = lines.findIndex(l => l.startsWith('usage:')) + 1;
  const keys = Object.keys(COMMANDS).sort((a, b) => b.length - a.length); // longest first: `decide steer` before `decide`
  const blocks = {};
  let cur = null;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (/^\S/.test(line)) break; // "aliases:" ends the table
    const indent = line.length - line.trimStart().length;
    if (indent === 2) {
      const [syn, ...desc] = line.trim().split(/\s{2,}/);
      const key = keys.find(k => syn === k || syn.startsWith(k + ' '));
      if (!key) {
        cur = null;
        continue;
      }
      cur = blocks[key] = blocks[key] || { synopsis: [], description: [] };
      cur.synopsis.push(syn);
      cur.description.push(desc.join(' '));
      continue;
    }
    if (cur && line.trim()) cur.description[cur.description.length - 1] += ' ' + line.trim();
  }
  const out = {};
  for (const [k, b] of Object.entries(blocks))
    out[k] = { synopsis: b.synopsis.join(' | '), description: b.description.map(d => d.trim()).filter(Boolean).join(' · ') };
  return out;
}
// The global flags, as the `usage:` line shows them.
export const usageGlobalFlags = (usage = USAGE) =>
  [...(usage.split('\n').find(l => l.startsWith('usage:')) || '').matchAll(/--([a-z][a-z-]*)/g)].map(m => m[1]);

const ABS_NOTE = " An absolute path: the server does not run in your working directory, so a relative one is refused.";
function flagSchema(name, kind) {
  if (kind === 'bool') return { type: 'boolean', description: `--${name} on the CLI.` };
  if (kind === 'path') return { type: 'string', description: `--${name} <path> on the CLI.${ABS_NOTE}` };
  return { type: 'string', description: `--${name} <value> on the CLI (a number is taken as its text).` };
}
function effectOf(cmd, spec) {
  if (spec.writes === 'always')
    return cmd.startsWith('decide')
      ? 'WRITES the maintainer decisions (.grain/seeds.jsonl and .grain/decisions.jsonl, meant to be committed).'
      : 'WRITES files: the proposed graph and its reports into the output directory (never over your own .yggdrasil/).';
  if (spec.writes === 'yes') return 'WRITES the oracle record only when "yes" is true; without it, prints what it would store and where.';
  if (spec.writes) return `WRITES the file named by "${spec.writes}" when it is given; without it, only answers.`;
  if (cmd === 'refresh') return "WRITES only Grain's own disposable index (.grain/cache/), rebuilt now; every other tool refreshes it as needed.";
  return "Read-only: writes nothing beyond Grain's own disposable index (.grain/cache/).";
}

// One tool per command, generated from the table.
export function buildTools() {
  const blocks = usageBlocks();
  const tools = [];
  for (const [cmd, spec] of Object.entries(COMMANDS)) {
    const b = blocks[cmd] || { synopsis: cmd, description: '' };
    const properties = {};
    const required = [];
    const repoPaths = new Set(spec.repoPaths || []);
    const paths = new Set(spec.paths || []);
    const pathOrName = new Set(spec.pathOrName || []);
    spec.args.forEach((a, i) => {
      const n = argName(a);
      const where = repoPaths.has(n)
        ? ' A path inside the repository: absolute, or relative to the repository root.'
        : paths.has(n)
          ? ABS_NOTE
          : pathOrName.has(n)
            ? ' A bare name, or a directory as an absolute path.'
            : '';
      properties[n] = variadic(a)
        ? { type: 'array', items: { type: 'string' }, minItems: 1, description: `Argument ${i + 1} of the CLI synopsis and every one after it, one per item.${where}` }
        : { type: 'string', description: `Argument ${i + 1} of the CLI synopsis${optional(a) ? ' (may be left out)' : ''}.${where}` };
      if (!optional(a)) required.push(n);
    });
    for (const [f, kind] of Object.entries(spec.flags)) properties[f] = flagSchema(f, kind);
    if (spec.flags.json === 'bool') properties.json.description = 'Answer with the JSON --json prints instead of the text.';
    for (const [f, kind] of Object.entries(GLOBAL_FLAGS)) properties[f] = flagSchema(f, kind);
    properties.repo.description =
      "--repo: the repository, as an absolute path. Defaults to this MCP server's own working directory. A path from inside a dev container is translated to the host directory a running container mounts there; one no container mounts is refused, never swapped for another repository.";
    const writes = !!spec.writes || cmd === 'refresh';
    tools.push({
      name: toolName(cmd),
      description: `${effectOf(cmd, spec)} CLI: grain ${b.synopsis} — ${b.description.replace(/[.;,]?$/, '.')}${WHEN[cmd] ? ' ' + WHEN[cmd] : ''}`,
      inputSchema: { type: 'object', properties, ...(required.length ? { required } : {}), additionalProperties: false },
      annotations: {
        readOnlyHint: !writes,
        destructiveHint: cmd === 'decide rm',
        idempotentHint: !writes,
        openWorldHint: false,
      },
    });
  }
  tools.push({
    name: toolName('help'),
    description: 'Read-only: the CLI usage text (what `grain help` prints) — every command and flag the grain tools are generated from.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  });
  return tools;
}

class ProtocolError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const invalid = msg => new ProtocolError(-32602, msg);
function need(cond, msg) {
  if (!cond) throw invalid(msg);
}
const scalar = v => (typeof v === 'string' && v !== '') || (typeof v === 'number' && Number.isFinite(v));
// a path inside the repository, from inside a dev container: the host path a running container mounts there
const hostSide = p => (isAbsolute(p) && !existsSync(p) ? (hostPathFor(p) ?? p) : p);
const isDir = p => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

// A tool call back into the argv the CLI would be given: the command words, every flag inline (--name=value, so a
// value that starts with -- is never read as a flag), then a bare -- and the arguments in order. The CLI's parseArgv
// reads it exactly as it reads a command line.
export function argvFor(cmd, input = {}) {
  const tool = toolName(cmd);
  need(input !== null && typeof input === 'object' && !Array.isArray(input), `${tool}: arguments must be an object`);
  const spec = COMMANDS[cmd];
  const flags = { ...spec.flags, ...GLOBAL_FLAGS };
  const known = new Set([...spec.args.map(argName), ...Object.keys(flags)]);
  for (const k of Object.keys(input)) need(known.has(k), `${tool}: unknown field "${k}" — it takes ${[...known].join(', ')}`);
  const argv = cmd.split(' ');
  for (const [f, kind] of Object.entries(flags)) {
    const v = input[f];
    if (v === undefined || v === null) continue;
    if (kind === 'bool') {
      need(typeof v === 'boolean', `${tool}: "${f}" must be true or false`);
      if (v) argv.push(`--${f}`);
    } else if (kind === 'path') {
      need(typeof v === 'string' && isAbsolute(v), `${tool}: "${f}" must be an absolute path (got ${JSON.stringify(v)}) — the server does not run in your working directory`);
      argv.push(`--${f}=${v}`);
    } else {
      need(scalar(v), `${tool}: "${f}" must be a non-empty string or a number`);
      argv.push(`--${f}=${v}`);
    }
  }
  const words = [];
  let gap = null;
  for (const a of spec.args) {
    const n = argName(a);
    const v = input[n];
    if (v === undefined || v === null) {
      need(optional(a), `${tool}: "${n}" is required`);
      gap = gap || n;
      continue;
    }
    need(gap === null, `${tool}: "${n}" is given but "${gap}" before it is not — the arguments are read in order`);
    const list = variadic(a) ? [].concat(v) : [v];
    need(list.length > 0 && list.every(x => typeof x === 'string' && x !== ''), `${tool}: "${n}" must be ${variadic(a) ? 'a non-empty list of non-empty strings' : 'a non-empty string'}`);
    for (const x of list.map(String)) {
      if ((spec.paths || []).includes(n))
        need(isAbsolute(x), `${tool}: "${n}" must be an absolute path (got ${JSON.stringify(x)}) — the server does not run in your working directory`);
      if ((spec.pathOrName || []).includes(n))
        need(isAbsolute(x) || !/[/\\]/.test(x), `${tool}: "${n}" must be a bare name or an absolute path (got ${JSON.stringify(x)}) — the server does not run in your working directory`);
      words.push((spec.repoPaths || []).includes(n) ? hostSide(x) : x);
    }
  }
  if (words.length) argv.push('--', ...words);
  return argv;
}

// How long one CLI run may take before it is stopped. A query that has to build the index first can take minutes on a
// large repository; propose and selftest rebuild the model on purpose and take longer still. Both can be overridden
// from the server's environment, in milliseconds.
export function timeoutFor(cmd, env = process.env) {
  const long = cmd === 'propose' || cmd === 'selftest';
  const v = Number(long ? env.GRAIN_MCP_LONG_TIMEOUT_MS : env.GRAIN_MCP_TIMEOUT_MS);
  return Number.isFinite(v) && v > 0 ? v : long ? 60 * 60_000 : 10 * 60_000;
}

// The CLI, run once: { code, out, err, stopped }. It runs in a process group of its own (bin/grain.mjs starts itself
// again under --liftoff-only, so the answer comes from a grandchild), and a timeout or a cancellation kills the whole
// group, never just the parent.
function runCli(argv, { cwd = process.cwd(), timeoutMs, signal } = {}) {
  return new Promise(res => {
    const child = spawn(process.execPath, [BIN, ...argv], { cwd, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let out = '';
    let err = '';
    let stopped = null;
    const stop = why => {
      if (stopped) return;
      stopped = why;
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        try {
          child.kill('SIGKILL');
        } catch {
          /* already gone */
        }
      }
    };
    const timer = setTimeout(() => stop('timeout'), timeoutMs);
    const onAbort = () => stop('cancelled');
    if (signal) signal.aborted ? onAbort() : signal.addEventListener('abort', onAbort, { once: true });
    const done = r => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      res({ ...r, stopped });
    };
    child.stdout.setEncoding('utf8').on('data', d => (out += d));
    child.stderr.setEncoding('utf8').on('data', d => (err += d));
    child.on('error', e => done({ code: 1, out, err: err + (e?.message || String(e)) }));
    child.on('close', (code, sig) => done({ code: code ?? 1, out, err: err + (sig && !stopped ? `\n[grain-mcp] the CLI was stopped by ${sig}` : '') }));
  });
}

// One tool call: { content, isError } as MCP returns it. Invalid fields throw a ProtocolError (a JSON-RPC error);
// everything the CLI prints — its answer, its diagnostics, its refusal — comes back as the result.
export async function callTool(name, input = {}, { signal, env = process.env } = {}) {
  if (name === toolName('help')) return { content: [{ type: 'text', text: USAGE }], isError: false };
  const cmd = Object.keys(COMMANDS).find(c => toolName(c) === name);
  if (!cmd) throw invalid(`Unknown tool: ${name}`);
  const argv = argvFor(cmd, input);
  const timeoutMs = timeoutFor(cmd, env);
  // The CLI runs in the repository it answers for, so what it resolves against its working directory (a bare oracle
  // name, say) resolves there and not wherever the server was started. With no repo given, that is the server's
  // working directory, and the answer says which repository that turned out to be.
  let cwd = process.cwd();
  let note = null;
  if (typeof input.repo === 'string') {
    const dir = hostSide(input.repo);
    if (isDir(dir)) cwd = dir;
  } else if (cmd !== 'version') {
    note = `repo: ${findRoot({}).root} (no repo given — found from the server's working directory ${process.cwd()})`;
  }
  const r = await runCli(argv, { cwd, timeoutMs, signal });
  if (r.stopped === 'timeout')
    return {
      content: [{ type: 'text', text: `grain ${cmd} did not finish within ${Math.round(timeoutMs / 1000)} s and was stopped. Set ${cmd === 'propose' || cmd === 'selftest' ? 'GRAIN_MCP_LONG_TIMEOUT_MS' : 'GRAIN_MCP_TIMEOUT_MS'} in the server's environment to allow longer, or run it from a terminal.` }],
      isError: true,
    };
  if (r.stopped === 'cancelled') return { content: [{ type: 'text', text: `grain ${cmd} was cancelled and stopped.` }], isError: true };
  const out = r.out.replace(/\n$/, '');
  const errLines = r.err.trim() ? r.err.trim().split('\n') : [];
  const err = errLines.length
    ? (errLines.length > STDERR_LINES ? [`(${errLines.length - STDERR_LINES} earlier lines of stderr left out)`, ...errLines.slice(-STDERR_LINES)] : errLines).join('\n')
    : null;
  // A JSON answer is one block a client can parse as it comes: what the CLI said on stderr and which repository was
  // meant go to _meta, never into a second text block.
  if (input.json === true && r.code === 0) {
    const meta = { ...(err ? { 'grain/stderr': err } : {}), ...(note ? { 'grain/repo': note } : {}) };
    return { content: [{ type: 'text', text: out }], isError: false, ...(Object.keys(meta).length ? { _meta: meta } : {}) };
  }
  // text: the answer first; what the CLI said on stderr (its refusal, its diagnostics) after it, or alone when it
  // printed nothing else; then which repository was meant, when the call did not say
  const content = [];
  if (out) content.push({ type: 'text', text: out });
  if (err) content.push({ type: 'text', text: err });
  if (!content.length) content.push({ type: 'text', text: r.code === 0 ? '' : `grain exited with ${r.code} and said nothing` });
  if (note) content.push({ type: 'text', text: note });
  return { content, isError: r.code !== 0 };
}

// ----- JSON-RPC / MCP -----
export async function handle(msg, tools, signal) {
  const { id, method, params } = msg;
  const ok = result => ({ jsonrpc: '2.0', id, result });
  const err = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
  if (method === 'initialize') {
    const asked = params?.protocolVersion;
    return ok({
      protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
    });
  }
  if (method === 'ping') return ok({});
  if (method === 'tools/list') return ok({ tools });
  if (method === 'tools/call') {
    try {
      return ok(await callTool(params?.name, params?.arguments || {}, { signal }));
    } catch (e) {
      if (e instanceof ProtocolError) return err(e.code, e.message);
      return err(-32603, e?.message || String(e));
    }
  }
  return err(-32601, `Method not found: ${method}`);
}

function serve() {
  const tools = buildTools();
  const send = m => process.stdout.write(JSON.stringify(m) + '\n'); // one compact line: JSON.stringify never emits a raw newline
  // Requests the client cancelled (notifications/cancelled), and the running call's way to stop its CLI. A cancel is
  // read the moment it arrives, not in turn behind the call it cancels; a cancelled request is never answered.
  const cancelled = new Set();
  const running = new Map(); // request id → AbortController
  const key = id => JSON.stringify(id);
  function parse(line) {
    const t = line.trim();
    if (!t) return { skip: true };
    try {
      return { msg: JSON.parse(t) };
    } catch {
      return { bad: true };
    }
  }
  async function onMessage({ msg, bad }) {
    if (bad) {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      return;
    }
    const hasId = msg && typeof msg === 'object' && Object.hasOwn(msg, 'id');
    // a response from the client (to a request this server never sends): nothing to answer
    if (hasId && msg.method === undefined && (Object.hasOwn(msg, 'result') || Object.hasOwn(msg, 'error'))) return;
    if (!msg || typeof msg.method !== 'string') {
      if (hasId) send({ jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32600, message: 'Invalid Request' } });
      return;
    }
    if (!hasId) return; // a notification (initialized, cancelled): nothing to answer
    if (cancelled.delete(key(msg.id))) return; // cancelled while it waited its turn
    const ctrl = new AbortController();
    running.set(key(msg.id), ctrl);
    let reply;
    try {
      reply = await handle(msg, tools, ctrl.signal);
    } catch (e) {
      reply = { jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: e?.message || String(e) } };
    } finally {
      running.delete(key(msg.id));
    }
    if (ctrl.signal.aborted) {
      cancelled.delete(key(msg.id));
      return;
    }
    send(reply);
  }
  // one call at a time, in order: two calls rebuilding the same index at once is not a risk worth taking
  let queue = Promise.resolve();
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', line => {
    const p = parse(line);
    if (p.skip) return;
    if (p.msg?.method === 'notifications/cancelled') {
      const id = p.msg.params?.requestId;
      if (id === undefined) return;
      const ctrl = running.get(key(id));
      if (ctrl) ctrl.abort();
      else cancelled.add(key(id));
      return;
    }
    queue = queue.then(() => onMessage(p)).catch(e => console.error('[grain-mcp]', e?.stack || e));
  });
  // the client is gone: stop whatever is running and leave, answering nothing more
  rl.on('close', () => {
    for (const ctrl of running.values()) ctrl.abort();
    process.stdout.write('', () => process.exit(0));
  });
  process.on('uncaughtException', e => console.error('[grain-mcp] uncaught:', e?.stack || e));
  process.on('unhandledRejection', e => console.error('[grain-mcp] unhandled rejection:', e?.stack || e));
}

// started as a program (not imported by a test): argv[1] names this file, possibly through a symlink
const self = p => {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
};
if (process.argv[1] && self(process.argv[1]) === self(fileURLToPath(import.meta.url))) serve();
