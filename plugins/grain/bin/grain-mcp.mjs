#!/usr/bin/env node
// grain MCP server — a thin protocol adapter, not a new capability: every tool below is a direct pass-through to
// the exact `cmd*` functions the CLI already calls, always with `opts.json = true`, so an MCP client gets the same
// machine-readable answers `grain <cmd> --json` already produces. Reused from engine/grain.mjs, in-process (no
// `bin/grain.mjs` subprocess per call) — findRoot/storeFor/ensureFresh/cmd* are the exact functions `main()` calls.
//
// Wire format: MCP's stdio transport is newline-delimited JSON-RPC 2.0 (NOT Content-Length-prefixed framing —
// that is LSP, not MCP). One JSON-RPC message per line on stdin/stdout; stderr is free for diagnostics.
// Protocol version implemented: 2025-06-18 (version negotiation per spec: this server always answers with the one
// version it knows; a client on an older version either accepts it or disconnects, exactly as the spec provides for).
//
// Unlike bin/grain.mjs, this process is NOT re-exec'd under `--liftoff-only`: that trick trades TurboFan's
// optimizing compile for lower peak memory because a one-shot query never runs long enough to earn back the
// optimization cost. A server answers many tool calls over its lifetime, so the opposite trade applies — it should
// keep the optimizing compiler on, like `grain refresh` already does.
import { createInterface } from 'node:readline';
import {
  findRoot,
  storeFor,
  ensureFresh,
  cmdWhere,
  cmdHow,
  cmdWhat,
  cmdCheck,
  cmdReview,
  cmdStatus,
  cmdReport,
  short,
} from '../engine/grain.mjs';
import { ENGINE_VERSION } from '../engine/config.mjs';

const PROTOCOL_VERSION = '2025-06-18';
const SERVER_INFO = { name: 'grain', version: ENGINE_VERSION };

// protocol-level JSON-RPC error (unknown tool, invalid/missing arguments) — distinct from a tool EXECUTION error,
// which the spec has report inside a normal result as `isError: true` (Tools § Error Handling) so the model can see it
class ProtocolError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const invalidParams = msg => new ProtocolError(-32602, msg);

// ----- repo context: the same ctx shape main() builds for every command, minus argv parsing (a tool call already
// arrives as structured arguments, not argv) -----
async function buildCtx(repoArg, args, opts) {
  const { root, git: isGit } = findRoot({ repo: repoArg });
  const store = storeFor(root);
  const { model, meta, head, banner, stale } = await ensureFresh({
    root,
    isGit,
    store,
    opts: {},
    want: 'refresh',
  });
  if (!model) throw new Error(banner.join('\n') || 'no index for this repository');
  const stamp = dirty =>
    `as of ${short(stale ? meta?.headSha : head)}${dirty ? '+dirty' : ''}${stale ? ' (STALE)' : ''}`;
  return { model, meta, head, root, isGit, args, opts, stamp, store };
}

const optionalRepoProp = {
  repo: {
    type: 'string',
    description: "Absolute path to the repository root. Defaults to this MCP server's own working directory.",
  },
};

// ----- the curated tool set: read-only pass-throughs over already-tested CLI commands, nothing new -----
const TOOLS = {
  grain_where: {
    description:
      "Ask this repository where something like <query> lives, what convention governs that place, and which exemplar to copy — call this BEFORE creating a new source file, or whenever it is unclear where new code belongs. Use the repository's own vocabulary (a decorator, a base type, a file or function name), not a paraphrase of it.",
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Intent words describing what is about to be built, in the repo\'s own vocabulary (e.g. "http handler for orders", "database migration").',
        },
        ...optionalRepoProp,
      },
      required: ['query'],
      additionalProperties: false,
    },
    validate(a) {
      if (typeof a?.query !== 'string' || !a.query.trim())
        throw invalidParams('grain_where: "query" (a non-empty string) is required');
    },
    async exec(a) {
      const ctx = await buildCtx(a.repo, [a.query], { json: true });
      const [json] = await cmdWhere(ctx);
      return json;
    },
  },
  grain_how: {
    description:
      'Ask this repository how a change like <query> has actually been made here before: the past commits whose message and touched files match the intent, and the files such a change reached — enum, DTO, fixture, test, wiring. Call this when the question is "what does a change like this involve here", not "where does this one thing live" (that is grain_where). Answers from real commits only; it says so plainly when no past change matches.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'The intended change, in the repo\'s own vocabulary (e.g. "add a new order status", "add a rate limit to an endpoint").',
        },
        top: { type: 'number', description: 'How many past commits to cite as examples (default 5).' },
        ...optionalRepoProp,
      },
      required: ['query'],
      additionalProperties: false,
    },
    validate(a) {
      if (typeof a?.query !== 'string' || !a.query.trim())
        throw invalidParams('grain_how: "query" (a non-empty string) is required');
      if (a?.top !== undefined && typeof a.top !== 'number')
        throw invalidParams('grain_how: "top" must be a number');
    },
    async exec(a) {
      const ctx = await buildCtx(a.repo, [a.query], { json: true, top: a.top });
      const [json] = await cmdHow(ctx);
      return json;
    },
  },
  grain_what: {
    description:
      'Ask this repository what <query> already IS here: its declarations, the indexed values that belong to it, its spread across modules, sibling values from the same enum/switch/object, historical commit mentions and file-level fan-in — all in one concept card. Call this when the question is "what is this concept in this codebase already", not "where should new code go" (grain_where) or "what did past changes touching it look like" (grain_how).',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'A word or short phrase naming the concept, in the repo\'s own vocabulary (e.g. "order status", "rate limit").',
        },
        ...optionalRepoProp,
      },
      required: ['query'],
      additionalProperties: false,
    },
    validate(a) {
      if (typeof a?.query !== 'string' || !a.query.trim())
        throw invalidParams('grain_what: "query" (a non-empty string) is required');
    },
    async exec(a) {
      const ctx = await buildCtx(a.repo, [a.query], { json: true });
      const [json] = await cmdWhat(ctx);
      return json;
    },
  },
  grain_check: {
    description:
      'Ask how one file, as it currently sits on disk, holds up against this repository\'s own established conventions — deviations with evidence and exemplars. Call this AFTER writing or editing a file. Omit "file" to check the whole uncommitted change instead of a single file.',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description:
            'Path to the file to check, absolute or relative to the repository root. Omit to check the whole uncommitted change instead.',
        },
        ...optionalRepoProp,
      },
      additionalProperties: false,
    },
    validate(a) {
      if (a?.file !== undefined && (typeof a.file !== 'string' || !a.file.trim()))
        throw invalidParams('grain_check: "file", if present, must be a non-empty string');
    },
    async exec(a) {
      const ctx = await buildCtx(a.repo, a.file !== undefined ? [a.file] : [], { json: true });
      const [json] = a.file !== undefined ? await cmdCheck(ctx) : await cmdReview(ctx);
      return json;
    },
  },
  grain_status: {
    description:
      "Get the size, freshness and health of this repository's mined convention model: how many conventions, over how many files, and whether the index is up to date with HEAD.",
    inputSchema: { type: 'object', properties: { ...optionalRepoProp }, additionalProperties: false },
    validate() {},
    async exec(a) {
      const ctx = await buildCtx(a.repo, [], { json: true });
      const [json] = await cmdStatus(ctx);
      return json;
    },
  },
  grain_report: {
    description:
      "Get this repository's top established conventions with evidence and trends, grouped by partition — a broad survey, not a query about one place or file.",
    inputSchema: {
      type: 'object',
      properties: {
        top: {
          type: 'number',
          description: 'How many top conventions to include per partition (default 15).',
        },
        ...optionalRepoProp,
      },
      additionalProperties: false,
    },
    validate(a) {
      if (a?.top !== undefined && typeof a.top !== 'number')
        throw invalidParams('grain_report: "top" must be a number');
    },
    async exec(a) {
      const ctx = await buildCtx(a.repo, [], { json: true, top: a.top });
      const [json] = await cmdReport(ctx);
      return json;
    },
  },
};

// ----- JSON-RPC / MCP message handling -----
const send = msg => process.stdout.write(JSON.stringify(msg) + '\n'); // one compact line — JSON.stringify never emits a raw newline byte, so this can never corrupt the framing
const result = (id, res) => send({ jsonrpc: '2.0', id, result: res });
const errorResponse = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

async function handleRequest(id, method, params) {
  if (method === 'initialize') {
    result(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: SERVER_INFO });
    return;
  }
  if (method === 'ping') {
    result(id, {});
    return;
  }
  if (method === 'tools/list') {
    result(id, {
      tools: Object.entries(TOOLS).map(([name, t]) => ({
        name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    });
    return;
  }
  if (method === 'tools/call') {
    const name = params?.name;
    const args = params?.arguments || {};
    const tool = TOOLS[name];
    if (!tool) {
      errorResponse(id, -32602, `Unknown tool: ${name}`);
      return;
    }
    try {
      tool.validate(args);
    } catch (e) {
      if (e instanceof ProtocolError) {
        errorResponse(id, e.code, e.message);
        return;
      }
      throw e;
    }
    try {
      const text = await tool.exec(args);
      result(id, { content: [{ type: 'text', text }], isError: false });
    } catch (e) {
      result(id, { content: [{ type: 'text', text: e?.message || String(e) }], isError: true });
    } // an execution failure (bad repo, unknown file, …) — never a protocol error, never a crash
    return;
  }
  errorResponse(id, -32601, `Method not found: ${method}`);
}

async function handleLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    return;
  }
  const hasId = msg && Object.prototype.hasOwnProperty.call(msg, 'id');
  if (!msg || typeof msg.method !== 'string') {
    if (hasId) errorResponse(msg?.id ?? null, -32600, 'Invalid Request');
    return;
  }
  if (!hasId) return; // a notification (initialized, cancelled, …) — nothing this server needs to act on, and never a response
  try {
    await handleRequest(msg.id, msg.method, msg.params);
  } catch (e) {
    errorResponse(msg.id, -32603, e?.message || String(e));
  } // internal error — still never crash the process
}

let queue = Promise.resolve(); // serialize message handling: two overlapping index rebuilds racing the same cache files is not a risk worth taking
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', line => {
  queue = queue.then(() => handleLine(line)).catch(e => console.error('[grain-mcp]', e?.stack || e));
});
rl.on('close', () => {
  queue.finally(() => process.stdout.write('', () => process.exit(0)));
});
process.on('uncaughtException', e => console.error('[grain-mcp] uncaught:', e?.stack || e));
process.on('unhandledRejection', e => console.error('[grain-mcp] unhandled rejection:', e?.stack || e));
