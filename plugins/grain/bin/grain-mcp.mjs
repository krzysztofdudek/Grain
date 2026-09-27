#!/usr/bin/env node
// grain MCP server — the grain CLI over another wire: a protocol adapter, not a second implementation.
//
// Built on the family's one MCP adapter, @chrisdudek/runes/mcp, vendored under engine/vendor/runes/ (pinned in
// engine/vendor/runes.pin.json and checked by scripts/runes.mjs). The CLI's own command table (engine/grain-commands.mjs)
// becomes one Runes command table, TABLE, and the adapter generates the tools from it: one tool per command,
// grain_<command> (a subcommand joins with `_`: grain_decide_steer), one field per argument and per flag under the flag's
// own name (map-rows, no-refresh, instead-of), and grain_help answering with the usage text. A tool's description is one
// sentence — what it writes, then the command's `summary` — and the usage text (engine/grain-usage.mjs, with the notes
// below) is what grain_help answers with. A call is turned back into the argv the CLI would get and run by the CLI
// itself, `bin/grain.mjs`, as a child process (the adapter's spawn executor): its stdout is the answer (the JSON `--json`
// prints, with json: true), its stderr a second block, and a non-zero exit comes back with isError: true. Running the
// CLI rather than its functions in this process keeps the two identical by construction, and lets each query run under
// the CLI's low-memory `--liftoff-only` mode instead of holding the optimising compiler's memory for the whole session.
// The transport, the timeout, cancellation and stopping the CLI's whole process tree are the adapter's.
//
// Paths: a field the CLI resolves against its working directory (repo, out, content, graph, …) must be absolute,
// since this server does not run in the caller's directory; a path inside the repository (check's file,
// obligation's path, …) may also be relative to the repository root. An absolute path from inside a dev container
// is translated to the host directory a running container mounts there, as the CLI does for `--repo`. These rules
// are Grain's, applied to a call's fields before the adapter turns them into argv (checkFields).
//
// Wire format: newline-delimited JSON-RPC 2.0 on stdin/stdout (MCP stdio transport); stderr is for diagnostics.
import { existsSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, resolve, dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMANDS, GLOBAL_FLAGS, ALIASES } from '../engine/grain-commands.mjs';
import { USAGE } from '../engine/grain-usage.mjs';
import { hostPathFor, findRoot } from '../engine/grain-context.mjs';
import { ENGINE_VERSION } from '../engine/config.mjs';
import { defineTable } from '../engine/vendor/runes/dist/cli/index.mjs';
import {
  buildTools as generateTools, argvFor as generateArgv, answersJson as answersJsonOf, createServer, serveStdio, spawnCli, killTree as killProcessTree, InvalidParams,
  PROTOCOL_VERSION as RUNES_PROTOCOL_VERSION, PROTOCOL_VERSIONS as RUNES_PROTOCOL_VERSIONS,
} from '../engine/vendor/runes/dist/mcp/index.mjs';

export const PROTOCOL_VERSION = RUNES_PROTOCOL_VERSION;
// The versions this server can speak: it uses nothing a later one added beyond tool annotations, which an older
// client ignores. A client asking for one of these gets it back; any other gets PROTOCOL_VERSION.
export const PROTOCOL_VERSIONS = RUNES_PROTOCOL_VERSIONS;
const BIN = fileURLToPath(new URL('./grain.mjs', import.meta.url));
const STDERR_LINES = 40; // a first build logs its progress on stderr; the answer needs only the end of it

export const TOOL_PREFIX = 'grain_';
export const toolName = cmd => TOOL_PREFIX + cmd.replace(/[ -]/g, '_');
export const argName = a => a.replace(/[?.]+$/, '');
const variadic = a => a.endsWith('...');

// What a tool's one sentence leaves out, for grain_help: the documents the JSON answers are, and what propose and export
// write. The usage text says what a command does; these say what an agent reading a tool result needs to know.
const NOTES = {
  where: 'Use the repository\'s own vocabulary (a decorator, a base type, a file or function name), not a paraphrase of it.',
  how: 'The question is "what does a change like this involve here", not "where does this one thing live" (that is grain_where). Answers from real commits only; it says so plainly when no past change matches.',
  what: 'The question is "what is this concept in this codebase already", not "where should new code go" (grain_where) or "what did past changes touching it look like" (grain_how).',
  check: 'Leave out "file" to check the whole uncommitted change instead (the CLI\'s `review`).',
  completeness:
    'Input: "files", one or more paths inside the repository. Answers from commit history only (nothing parsed, any file type). With json: true it returns the grain-completeness/1 document { schema, files: [{ file, partners, ambient }], partners, ambient, asOf, dirtyTree? }: `files` gives each input file its own partners (the other inputs left out), `partners` and `ambient` are the merged lists the text prints. A partner is { file, sup, commits, bits, dead }: `sup` of the edited file\'s `commits` commits also touched it, `bits` is the evidence it beats chance, `dead` means it no longer exists at HEAD. An ambient entry is { file, k, n, share, dead }: a file touched by `k` of all `n` commits, named because the repository touches it with almost everything, not because of these files. Every list holds at most 5, as the text does. An empty `partners` means no file changes with these more often than it changes anyway — not that the change is complete.',
  advise:
    'For a repository that ALREADY has a Yggdrasil graph (.yggdrasil/, or "graph" for one held beside the repository); it never reads a proposal and never writes. With json: true it returns the grain-advice/1 document { schema, repo, at, items[] }: an item is { kind: "split", nodes: [node], candidates: [dir…], evidence, text } — a node whose own files a finer cut beats (evidence.candidates[].reason is "tighter" or "unread") — or { kind: "relation", nodes: [a, b], confidence, evidence: { coChanged, ofA, ofB, declared, declaredVia? }, text } — two nodes whose code changes together, listed as data, not advice. With no graph it returns no items and a note saying so. The text answer lists the splits and only counts the relations.',
  propose:
    'Input: "out-dir", an absolute directory (default .yggdrasil-proposal/ at the repository root; your own .yggdrasil/ is refused). It WRITES there: the .yggdrasil/ tree (node types, nodes, relations, aspects and mined rules with their evidence), PROPOSAL.md (the architecture, the rules a real `yg drill` proved, the candidates), REFACTOR-BACKLOG.md (each dependency cycle and the weakest dependency left out to break it), alternatives.md, sizing.json and proposal.json (schema grain-proposal/1), plus the family-without-law signal `yg advise` reads (.yggdrasil/.family-candidates.grain.json; "family-candidates" moves it, "no-family-candidates" drops it). "json" names an absolute path to write the report as JSON as well; "full" adds every draft it kept back; "holdout" (YYYY-MM-DD) cuts each rule\'s drill cases only from code first seen after that date, so a passing drill tests the rule on code it was not mined from (without it the report says the drills prove only the count). Nothing is adopted: accepting the proposal is `yg adopt <out-dir>`, whose command the report names. Rebuilding a proposal is slow on a large repository.',
  export:
    'Every convention with all its sites, anchors and trends, the partitions and their groups, markers and directories, the module graph and its dependency edges, architecture norms, commit shapes, co-change pairs, value sets and the maintainer decisions in force. It answers in the tool result unless "out" names an absolute file to write it to instead. "max-sites" caps the sites listed per convention (default 300), "no-anchors" leaves out the source lines, "compact" prints it on one line.',
};
const HELP = `${USAGE}

MCP tools (grain_<command>, a subcommand joined with _): every argument and flag is a field under its own name. Notes:
${Object.entries(NOTES).map(([c, n]) => `  ${toolName(c)}: ${n}`).join('\n')}`;
const INSTRUCTIONS = 'Every grain command is a tool, grain_<command>, with its arguments and flags as fields. A description is one sentence; grain_help answers with the full usage and what each JSON answer holds.';

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

// Grain's own notes on a field, added after the adapter's: where a path is read from, and the repository field.
const REPO_NOTE =
  "The repository. Defaults to this MCP server's own working directory. A path from inside a dev container is translated to the host directory a running container mounts there; one no container mounts is refused, never swapped for another repository.";
function fieldNote(cmd, f) {
  const spec = COMMANDS[cmd];
  if (f === 'repo') return REPO_NOTE;
  if ((spec.repoRelative || []).includes(f)) return f in spec.flags ? 'Relative to the repository root (an absolute path is refused).' : 'Relative to the repository root, as written (an absolute path is refused).';
  if ((spec.repoPaths || []).includes(f)) return 'A path inside the repository: absolute, or relative to the repository root.';
  if ((spec.pathOrName || []).includes(f)) return 'A bare name, or a directory as an absolute path.';
  return undefined;
}
function effectOf(cmd, spec) {
  if (spec.writes === 'always') return cmd.startsWith('decide') ? 'WRITES the maintainer decisions.' : 'WRITES the output directory.';
  if (spec.writes === 'yes') return 'WRITES only with "yes".';
  if (spec.writes) return `WRITES the file "${spec.writes}" names, when given.`;
  if (cmd === 'refresh') return "WRITES only Grain's disposable index.";
  return 'Read-only.';
}
const describe = cmd => `${effectOf(cmd, COMMANDS[cmd])} ${COMMANDS[cmd].summary} CLI: grain ${cmd}.`;

// The tools that can replace what is there: propose rewrites its output directory, rules and export overwrite the
// file named by "out", decide rm withdraws a decision.
export const DESTRUCTIVE = new Set(['propose', 'rules', 'export', 'decide rm']);

// The command table as the adapter reads it. What a command writes decides readOnlyHint (refresh writes only the
// disposable index, and says so); a path the CLI resolves against its working directory (a 'path' flag, `paths`) must
// be absolute; export prints its JSON unasked unless "out" names a file.
export const TABLE = defineTable({
  tool: 'grain',
  globalFlags: GLOBAL_FLAGS,
  commands: Object.fromEntries(
    Object.entries(COMMANDS).map(([cmd, spec]) => [
      cmd,
      {
        args: spec.args,
        flags: spec.flags,
        summary: spec.summary,
        writes: !!spec.writes || cmd === 'refresh',
        destructive: DESTRUCTIVE.has(cmd),
        ...(spec.paths ? { paths: spec.paths } : {}),
        ...(spec.stdoutJson ? { stdoutJson: spec.writes || true } : {}),
      },
    ])
  ),
  aliases: ALIASES,
});
// The options the tools are generated with; the parity test builds its reference from the same options.
export const TOOL_OPTIONS = { prefix: TOOL_PREFIX, describe, fieldNote, help: HELP };

// One tool per command, and grain_help, generated by the adapter from TABLE.
export function buildTools() {
  return generateTools(TABLE, TOOL_OPTIONS);
}

// A refusal of the call's input: a JSON-RPC -32602 error, never a tool result — the adapter's InvalidParams, carrying the
// code where callers of this module read it.
const invalid = msg => Object.assign(new InvalidParams(msg), { code: -32602 });
function need(cond, msg) {
  if (!cond) throw invalid(msg);
}
const scalar = v => (typeof v === 'string' && v !== '') || (typeof v === 'number' && Number.isFinite(v));
// a path inside the repository, from inside a dev container: the host path a running container mounts there
// Each answer is kept a minute, so a path asked about again does not ask docker again; a path that does not exist yet
// (obligation's is asked BEFORE the file is written) is translated through the nearest directory above it that does
// not exist here either, the one docker can place.
const HOST_TTL = 60_000;
const hostCache = new Map();
function hostPathCached(p) {
  const hit = hostCache.get(p);
  if (hit && Date.now() - hit.at < HOST_TTL) return hit.host;
  const host = hostPathFor(p);
  hostCache.set(p, { host, at: Date.now() });
  return host;
}
export function hostSide(p) {
  if (!isAbsolute(p) || existsSync(p)) return p;
  const tail = [];
  for (let d = p; ; ) {
    const host = hostPathCached(d);
    if (host) return tail.length ? join(host, ...tail) : host;
    const up = dirname(d);
    if (up === d || existsSync(up)) return p; // reached a directory that is here: the path is this machine's, just absent
    tail.unshift(basename(d));
    d = up;
  }
}
const isDir = p => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

// a path inside the repository, possibly `<path>#<scope name>`: the path part through the container translation
const inRepo = x => {
  const i = x.indexOf('#');
  return i < 0 ? hostSide(x) : hostSide(x.slice(0, i)) + x.slice(i);
};

// Grain's own rules on a call's fields, before the adapter checks the rest and builds the argv: a value is never
// empty, a 'path' field is an absolute path, a field taken relative to the repository root is not absolute, an
// argument that is a bare name or a directory is one of the two — and a path inside the repository goes through the
// container translation. Returns the fields with those paths translated; throws InvalidParams.
export function checkFields(cmd, input = {}) {
  const tool = toolName(cmd);
  need(input !== null && typeof input === 'object' && !Array.isArray(input), `${tool}: arguments must be an object`);
  const spec = COMMANDS[cmd];
  const flags = { ...spec.flags, ...GLOBAL_FLAGS };
  const known = new Set([...spec.args.map(argName), ...Object.keys(flags)]);
  for (const k of Object.keys(input)) need(known.has(k), `${tool}: unknown field "${k}" — it takes ${[...known].join(', ')}`);
  const repoRelative = spec.repoRelative || [];
  const repoPaths = spec.repoPaths || [];
  const out = { ...input };
  for (const [f, kind] of Object.entries(flags)) {
    const v = input[f];
    if (v === undefined || v === null || kind === 'bool') continue;
    if (kind === 'path') {
      need(typeof v === 'string' && isAbsolute(v), `${tool}: "${f}" must be an absolute path (got ${JSON.stringify(v)}) — the server does not run in your working directory`);
      continue;
    }
    need(scalar(v), `${tool}: "${f}" must be a non-empty string or a number`);
    need(!repoRelative.includes(f) || !isAbsolute(String(v)), `${tool}: "${f}" is relative to the repository root (got ${JSON.stringify(v)})`);
    if (repoPaths.includes(f)) out[f] = inRepo(String(v));
  }
  for (const a of spec.args) {
    const n = argName(a);
    const v = input[n];
    if (v === undefined || v === null) continue; // a missing one: the adapter says it is required, or reads on
    const list = variadic(a) ? [].concat(v) : [v];
    need(list.length > 0 && list.every(x => typeof x === 'string' && x !== ''), `${tool}: "${n}" must be ${variadic(a) ? 'a non-empty list of non-empty strings' : 'a non-empty string'}`);
    for (const x of list) {
      if ((spec.pathOrName || []).includes(n))
        need(isAbsolute(x) || !/[/\\]/.test(x), `${tool}: "${n}" must be a bare name or an absolute path (got ${JSON.stringify(x)}) — the server does not run in your working directory`);
      if (repoRelative.includes(n)) need(!isAbsolute(x), `${tool}: "${n}" is relative to the repository root (got ${JSON.stringify(x)})`);
    }
    if (repoPaths.includes(n)) out[n] = variadic(a) ? list.map(inRepo) : inRepo(v);
  }
  return out;
}

// A tool call back into the argv the CLI would be given — the command words, every flag inline (--name=value, so a
// value that starts with -- is never read as a flag), then a bare -- and the arguments in order — by the adapter, after
// Grain's own checks. The CLI's parseArgv reads it exactly as it reads a command line.
export function argvFor(cmd, input = {}) {
  const fields = checkFields(cmd, input);
  try {
    return generateArgv(TABLE, cmd, fields, TOOL_OPTIONS);
  } catch (e) {
    if (e instanceof InvalidParams) e.code = -32602;
    throw e;
  }
}

// How long one CLI run may take before it is stopped. A query that has to build the index first can take minutes on a
// large repository; propose and selftest rebuild the model on purpose and take longer still. Both can be overridden
// from the server's environment, in milliseconds.
const isLong = cmd => cmd === 'propose' || cmd === 'selftest';
export function timeoutFor(cmd, env = process.env) {
  const v = Number(isLong(cmd) ? env.GRAIN_MCP_LONG_TIMEOUT_MS : env.GRAIN_MCP_TIMEOUT_MS);
  return Number.isFinite(v) && v > 0 ? v : isLong(cmd) ? 60 * 60_000 : 10 * 60_000;
}

// A process tree, killed from its root (the adapter's: the process group on POSIX, taskkill /T on Windows).
export const killTree = pid => killProcessTree(pid);

// Whether a call's stdout is a JSON document: the ones asked for with json: true, and a command the table marks as
// printing JSON on its own (export), unless it was told to write it to a file instead.
export function answersJson(cmd, input = {}) {
  return answersJsonOf(TABLE, cmd, input);
}

// The server: the adapter over TABLE, running bin/grain.mjs for each call. The CLI runs in the repository it answers
// for, so what it resolves against its working directory (a bare oracle name, say) resolves there and not wherever
// the server was started. With no repo given, that is the server's working directory, and the answer says which
// repository that turned out to be (a last text block, or grain/repo in _meta for a JSON answer).
export const server = createServer({
  table: TABLE,
  name: 'grain',
  version: ENGINE_VERSION,
  executor: spawnCli({ args: [BIN], stderrLines: STDERR_LINES }),
  tools: TOOL_OPTIONS,
  instructions: INSTRUCTIONS,
  timeoutMs: cmd => timeoutFor(cmd),
  timeoutHint: cmd => `Set ${isLong(cmd) ? 'GRAIN_MCP_LONG_TIMEOUT_MS' : 'GRAIN_MCP_TIMEOUT_MS'} in the server's environment to allow longer, or run it from a terminal.`,
  transformInput: ({ command, input }) => checkFields(command, input),
  prepare: ({ command, input }) => {
    if (typeof input.repo === 'string') {
      const dir = hostSide(input.repo);
      return isDir(dir) ? { cwd: dir } : {};
    }
    if (command === 'version') return {};
    return { notes: { repo: `repo: ${findRoot({}).root} (no repo given — found from the server's working directory ${process.cwd()})` } };
  },
});

// One tool call: { content, isError } as MCP returns it. Invalid fields throw InvalidParams (a JSON-RPC error);
// everything the CLI prints — its answer, its diagnostics, its refusal — comes back as the result.
export function callTool(name, input = {}, { signal } = {}) {
  return server.callTool(name, input, signal);
}

// ----- JSON-RPC / MCP -----
export function handle(msg, _tools, signal) {
  return server.handle(msg, signal);
}

// started as a program (not imported by a test): argv[1] names this file, possibly through a symlink
// (Windows: the native realpath expands 8.3 short names, and the comparison ignores letter case as the file system does)
const self = p => {
  let r;
  try {
    r = process.platform === 'win32' ? realpathSync.native(p) : realpathSync(p);
  } catch {
    r = resolve(p);
  }
  return process.platform === 'win32' ? r.toLowerCase() : r;
};
if (process.argv[1] && self(process.argv[1]) === self(fileURLToPath(import.meta.url))) serveStdio(server, { log: line => console.error(line.replace('[mcp]', '[grain-mcp]')) });
