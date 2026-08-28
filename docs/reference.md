# Operational reference

Everything an operator or an integrator needs in one place: commands and flags, the hooks and their payloads, the
store on disk, the environment switches, the cache version keys, and the export schema contract.

## Commands

All commands accept `--repo <path>` (act on another checkout), `--no-refresh` (answer from the existing index; a
stale one carries a STALE banner) and `--no-history` (skip the history layer for this invocation: no lifecycle
weights, no co-change, faster on a huge repository; nothing counts as established). Every answer ends with `as of <sha>`, plus `+dirty` when the file was read from an
uncommitted worktree.

| command | flags | answer |
| --- | --- | --- |
| `where <intent words>` | `--top N`, `--map-rows N`, `--json` | ranked cards (group, marker, directory, file) with conventions, exemplars, superposition, co-change; a compact map when nothing matches lexically; a history bridge line for words only the commits know |
| `check <file>` | `--as <path>`, `--content <file>`, `--all`, `--json` | deviations in your change with evidence and exemplars, pre-existing ones folded (`--all` lists), maintainer decisions departed from, architecture notes, a placement note for a file the tree does not know. `--as` judges content as if it lived at another path; `--content` reads the body from elsewhere |
| `review` | `--staged`, `--range <a>..<b>`, `--worktree`, `--json` | one aggregated report over every file in the whole change (default: every uncommitted change plus untracked new files) — the same per-file findings as `check`, restricted to each file's own changed lines, plus one whole-set co-change line from `completeness` |
| `completeness <file…>` | | files this repo's own commit history shows reliably changing together with the ones given, above a real directional confidence (`co-changed in N/M commits`) — the same line `check-hook` appends automatically after an edit that has one |
| `spectrum <file>` | `--minbits N`, `--top N` | the full local to global lattice around one file, accepted NORM rows and below gate obs rows |
| `status` | `--json` | model size, signal verdict, freshness, history mode, agent share of young code |
| `report` | `--top N`, `--json` | top conventions with trends and ages, templates of the unclustered residue, drift, the module graph with cycles, boundaries |
| `rules` | `--out <file>`, `--top N` | a generated Markdown document of established conventions over the same data `report` prints, stamped with the commit; no `--out` prints it to stdout (so `grain rules > CONVENTIONS.md` works) — for a reader with no terminal and no grain plugin |
| `export` | `--out <file>`, `--max-sites N`, `--compact`, `--no-anchors` | the whole model as data; see the schema contract below |
| `seed add <path>#<name>` | `--surfaces <pid,…>`, `--instead-of <pid,…>`, `--note`, `--topic`, `--weight`, `--author` | record a maintainer decision; without `--surfaces` it refuses and lists the exemplar's properties |
| `seed add-boundary <from>` | `--never-imports <to>`, `--note`, `--author` | an architecture decision; new imports crossing it are flagged at edit time |
| `seed list`, `seed rm <id>` | | the decisions in force; withdraw one |
| `refresh` | `--full` | rebuild now (queries auto-refresh anyway); `--full` re-walks the whole history |
| `version` | | engine, extractor and grammar versions |

The agent-authored share (`status`, `report`) classifies the commit author string of the last commit to touch each
surviving line against `AGENT_AUTHOR_RE`, over committed history only — it never sees the uncommitted worktree in
either direction (the norm is the accepted past), so a 0% or low reading means recent committers on that code weren't
tool-named authors, not that no AI-assisted work happened there.

A type name can legitimately appear at more than one declaration in the same file where a language allows arity- or
generic-parameter overloading (the same identifier naming genuinely distinct declarations); grain counts each as its
own scope, so repeated same-name entries in `where`/`check`/`export` output are expected there, not a bug.

## Hooks

Registered by `hooks/hooks.json` (Claude Code) and `hooks/codex-hooks.json` (Codex). Two more registrations exist
and carry ONLY the session start hook: `hooks/cursor-hooks.json` (Cursor, which also uses a relative command path)
and the plugin root `hooks.json` (Copilot); a Cursor or Copilot user therefore gets no placement and no post edit
hook today. All hooks are silent on any failure and never block; the hook path never builds or refreshes an index.

- **SessionStart** runs `grain session-context`: what grain answers, the live index state, the architecture shape,
  the maintainer decisions in force.
- **PreToolUse on Write** runs `grain check-hook --pre`: placement from the intended path alone, before the file
  exists, injected as additional context with an explicit allow decision.
- **PostToolUse on Edit, Write and MultiEdit** runs `grain check-hook`: the edited file is re-checked and grain speaks only when
  it has findings on the touched lines (deviations, maintainer decisions, architecture crossings, a placement note),
  plus, capped to 3 partners on one line, files this repo's own history shows reliably co-changing with the one you
  just touched (`completeness`, above `cochangeMinConf`) — this line fires even when nothing else does. The whole
  set is capped at eight lines. Identical findings for the same file repeat at most once per 15 minutes
  (`GRAIN_HOOK_TTL_MS` overrides; state in `.grain/cache/hook-seen.json`, safe to delete).

Hook payloads arrive on stdin as the host's JSON; paths are canonicalised through the deepest existing ancestor, so
macOS `/var` and `/private/var` symlinks cannot put a file outside its own repository.

**Placement feedback loop** (local only, nothing transmitted): a PreToolUse placement suggestion is remembered by
its name-kin suffix and token, not by the exact path warned about — the same exact path can only ever complete
as `deviated` (Pre and Post see the identical path; a suggestion is only ever "followed" by a DIFFERENT, corrective
write landing in the suggested directory). A later write matching that suffix/token resolves the suggestion as
`followed` (a corrective write landed in the suggested directory) or `deviated` (the flagged path was written
anyway); a write matching neither leaves it pending until it is pruned. `grain status` prints the cumulative count
(`placement notes followed: N of M (X%)`) once any outcome exists, and says nothing before that.

## MCP server

`bin/grain-mcp.mjs` is a long-lived [Model Context Protocol](https://modelcontextprotocol.io) server: the same
answers `where`/`check`/`status`/`report --json` already give, over stdio, for any MCP client — not only Claude
Code. It calls the same `cmd*` functions the CLI does, in-process, so it pays Node's startup cost once for the
whole session rather than once per call; unlike `bin/grain.mjs`, it is not re-exec'd under `--liftoff-only` — a
server answering many calls over its lifetime is better served by V8's optimising compiler than by the low-memory
single-shot mode a one-query-then-exit CLI invocation uses.

Launch it directly: `node "${CLAUDE_PLUGIN_ROOT}/bin/grain-mcp.mjs"` (or any absolute path to it). Claude Code
starts it automatically for this plugin via `.mcp.json` at the plugin root; any other MCP-speaking client can point
at the same binary by hand.

- **Transport**: stdio, newline-delimited JSON-RPC 2.0 — one message per line, none containing an embedded newline
  (MCP's stdio framing; not the `Content-Length`-prefixed framing LSP uses). Diagnostics go to stderr only; stdout
  carries protocol messages exclusively.
- **Protocol version**: `2025-06-18`.
- **Tools** (all read-only, all `{ repo?: string }`-scoped to default to the server's own working directory):
  - `grain_where { query: string, repo? }` — same as `where <query> --json`
  - `grain_check { file: string, repo? }` — same as `check <file> --json`
  - `grain_status { repo? }` — same as `status --json`
  - `grain_report { repo?, top?: number }` — same as `report --top <top> --json`
- **Errors**: an unknown tool name or a missing/invalid required argument is a JSON-RPC protocol error (code
  `-32602`); a failure while answering (a bad `repo` path, a file that does not exist) comes back as a normal
  result with `isError: true` so the calling model can see and react to it. Neither kind ever crashes the server —
  it keeps answering later calls.
- Mutating commands (`seed`, `refresh`) and `review` (reads git state beyond a single file) are deliberately not
  exposed; this is a read-only query surface.

## The store

```text
<repo>/.grain/
  .gitignore        created by grain; ignores cache/
  .gitattributes    created by the first seed command; merge=union for the two decision files
  seeds.jsonl       maintainer decisions, meant to be committed
  decisions.jsonl   the audit trail, meant to be committed
  cache/            disposable, rebuilt on demand
    model.json      the mined model (conventions, groups, templates, edges, affinity)
    meta.json       the four version keys, the indexed HEAD and build metadata
    history.json    the resumable history replay state
    tree.json       HEAD's extraction cache, keyed by blob sha and path (scopes, skeletons, relation facts)
    blobs/          sharded per blob payloads the history replay fetched
    hook-seen.json  repeat suppression state for the hooks
    placement-pending.json   suggestions PreToolUse made, awaiting the write that resolves them (pruned after GRAIN_HOOK_TTL_MS)
    placement-outcomes.json  cumulative counts of resolved suggestions (`followed`/`deviated`) — read by `grain status`
```

Deleting `cache/` is always safe; the next query rebuilds the same bytes.

## Environment

From `.env.example` and the engine:

| variable | effect |
| --- | --- |
| `GRAIN_V8=off` | disable the `--liftoff-only` re-exec; long builds get V8's optimiser and roughly 500 MB more RSS |
| `GRAIN_NO_REFRESH=1` | never auto-rebuild; stale answers carry a STALE banner |
| `GRAIN_DEBUG=1` | full stack traces on errors |
| `GRAIN_DBG=<substr>` | mining debug: print candidate cells whose surface id contains the substring |
| `GRAIN_GRAMMAR_DIR` | override the grammar directory |
| `GRAIN_HOOK_TTL_MS` | repeat suppression window for hook notes (default 15 minutes) |
| `GRAIN_PLUGIN_DIR`, `GRAIN_TRIAL_SETTINGS`, `GRAIN_YGG_DIR` | stress and vendoring tooling only |

## Cache version keys

Among its build metadata `meta.json` carries four version keys; a mismatch on any of them invalidates exactly the
layer it names.

| key | invalidates | bump when |
| --- | --- | --- |
| `engine` | everything | the engine version changes |
| `extractor` (EXTR_V) | the per blob extraction cache and the history replay | anything about extraction changes |
| `model` (MODEL_V) | the mined model only (a re-learn, not a re-parse) | the model gains fields queries depend on |
| `grammars` | everything parsed | a grammar wasm changes |

## The export schema contract

`grain export` prints `schema: "grain-export/1"`. **The schema is a published interface with a downstream consumer**:
a fine-tuning pipeline cuts training samples from it, masking the anchor lines for fill in the middle examples. Field
renames and semantic changes are breaking changes for that consumer; make them deliberately and versioned, never as a
side effect of a refactor.

Top level: `schema, engine, extractor, repo, asOf, schemaNotes, indexedAt, history, summary, steers, boundaries,
edges, edgesTruncated, moduleGraph, archNorms, partitions, conventions, cochange`.

`archNorms`: established layering per (source module, target module) pair — the same acceptance test (§mathematics)
as every other convention, applied to the module graph. Each entry: `from, to, exp` (`"true"` the module reaches the
target as established practice, `"false"` it does not), `ne, neff, share, bits`. A pair absent here cleared no
acceptance floor; that is silence, never a claim of `"false"`.

Each convention entry: `id, partition, context, unit, kind, feature (enumerator and argument), expected, negated,
packageWide, seeded, contested, statement, parentDefault, localContrast, alphabet, counts, established, share,
bitsPerInstance, gapThresholdBits, surfaces, siblings, trend, calibration, lifecycle, sites, exemplars,
conformingSites, deviatingSites (each with observed value, phrase, gap in bits, whether it fires, and the nearest
conforming exemplar), check` (a machine executable description of how to verify the convention on a new file).

Each partition: `name, label, kind, files, scopes, groups (with size, lift, implied companions and registration,
superposition profile, markers, defining tokens, members), directories, markers, conventions, templates` (the
unclustered residue templates, with skeleton, coverage, slots and exemplars).

`schemaNotes` inside the export carries the field by field explanation for a consumer that only has the file.
