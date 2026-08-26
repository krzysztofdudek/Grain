# Operational reference

Everything an operator or an integrator needs in one place: commands and flags, the hooks and their payloads, the
store on disk, the environment switches, the cache version keys, and the export schema contract.

## Commands

All commands accept `--repo <path>` (act on another checkout) and `--no-refresh` (answer from the existing index; a
stale one carries a STALE banner). Every answer ends with `as of <sha>`, plus `+dirty` when the file was read from an
uncommitted worktree.

| command | flags | answer |
|---|---|---|
| `where <intent words>` | `--top N`, `--map-rows N`, `--json` | ranked cards (group, marker, directory, file) with conventions, exemplars, superposition, co-change; a compact map when nothing matches lexically; a history bridge line for words only the commits know |
| `check <file>` | `--as <path>`, `--content <file>`, `--all`, `--json` | deviations in your change with evidence and exemplars, pre-existing ones folded (`--all` lists), maintainer decisions departed from, architecture notes, a placement note for a file the tree does not know. `--as` judges content as if it lived at another path; `--content` reads the body from elsewhere |
| `spectrum <file>` | `--minbits N`, `--top N` | the full local to global lattice around one file, accepted NORM rows and below gate obs rows |
| `status` | `--json` | model size, signal verdict, freshness, history mode, agent share of young code |
| `report` | `--top N`, `--json` | top conventions with trends and ages, templates of the unclustered residue, drift, the module graph with cycles, boundaries |
| `export` | `--out <file>`, `--max-sites N`, `--compact`, `--no-anchors` | the whole model as data; see the schema contract below |
| `seed add <path>#<name>` | `--surfaces <pid,…>`, `--instead-of <pid,…>`, `--note`, `--topic`, `--weight`, `--author` | record a maintainer decision; without `--surfaces` it refuses and lists the exemplar's properties |
| `seed add-boundary <from>` | `--never-imports <to>`, `--note`, `--author` | an architecture decision; new imports crossing it are flagged at edit time |
| `seed list`, `seed rm <id>` | | the decisions in force; withdraw one |
| `refresh` | `--full` | rebuild now (queries auto-refresh anyway); `--full` re-walks the whole history |
| `version` | | engine, extractor and grammar versions |

## Hooks

Registered by `hooks/hooks.json` (Claude Code) and `hooks/codex-hooks.json` (Codex). All three are silent on any
failure and never block; the hook path never builds or refreshes an index.

- **SessionStart** runs `grain session-context`: what grain answers, the live index state, the architecture shape,
  the maintainer decisions in force.
- **PreToolUse on Write** runs `grain check-hook --pre`: placement from the intended path alone, before the file
  exists, injected as additional context with an explicit allow decision.
- **PostToolUse on Edit and Write** runs `grain check-hook`: the edited file is re-checked and grain speaks only when
  it has findings on the touched lines (deviations, maintainer decisions, architecture crossings, a placement note),
  capped at eight lines. Identical findings for the same file repeat at most once per 15 minutes
  (`GRAIN_HOOK_TTL_MS` overrides; state in `.grain/cache/hook-seen.json`, safe to delete).

Hook payloads arrive on stdin as the host's JSON; paths are canonicalised through the deepest existing ancestor, so
macOS `/var` and `/private/var` symlinks cannot put a file outside its own repository.

## The store

```
<repo>/.grain/
  .gitignore        created by grain; ignores cache/
  .gitattributes    merge=union for the two decision files
  seeds.jsonl       maintainer decisions, meant to be committed
  decisions.jsonl   the audit trail, meant to be committed
  cache/            disposable, rebuilt on demand
    model.json      the mined model (conventions, groups, templates, edges, affinity)
    meta.json       version keys and the indexed HEAD
    history.json    the resumable history replay state
    tree.json       per blob extraction cache (scopes, skeletons, relation facts)
    hook-seen.json  repeat suppression state for the hooks
```

Deleting `cache/` is always safe; the next query rebuilds the same bytes.

## Environment

From `.env.example` and the engine:

| variable | effect |
|---|---|
| `GRAIN_V8=off` | disable the `--liftoff-only` re-exec; long builds get V8's optimiser and roughly 500 MB more RSS |
| `GRAIN_NO_REFRESH=1` | never auto-rebuild; stale answers carry a STALE banner |
| `GRAIN_DEBUG=1` | full stack traces on errors |
| `GRAIN_DBG=<substr>` | mining debug: print candidate cells whose surface id contains the substring |
| `GRAIN_GRAMMAR_DIR` | override the grammar directory |
| `GRAIN_HOOK_TTL_MS` | repeat suppression window for hook notes (default 15 minutes) |
| `GRAIN_PLUGIN_DIR`, `GRAIN_TRIAL_SETTINGS`, `GRAIN_YGG_DIR` | stress and vendoring tooling only |

## Cache version keys

`meta.json` carries four keys; a mismatch on any of them invalidates exactly the layer it names.

| key | invalidates | bump when |
|---|---|---|
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
edges, edgesTruncated, moduleGraph, partitions, conventions, cochange`.

Each convention entry: `id, partition, context, unit, kind, feature (enumerator and argument), expected, negated,
packageWide, seeded, contested, statement, parentDefault, localContrast, alphabet, counts, established, share,
bitsPerInstance, gapThresholdBits, surfaces, siblings, trend, calibration, lifecycle, sites, exemplars,
conformingSites, deviatingSites (each with observed value, phrase, gap in bits, whether it fires, and the nearest
conforming exemplar), check` (a machine executable description of how to verify the convention on a new file).

Each partition: `name, label, kind, files, scopes, groups (with size, lift, implied companions and registration,
superposition profile, markers, defining tokens, members), directories, markers, conventions, templates` (the
unclustered residue templates, with skeleton, coverage, slots and exemplars).

`schemaNotes` inside the export carries the field by field explanation for a consumer that only has the file.
